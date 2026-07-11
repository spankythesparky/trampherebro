#!/usr/bin/env node
/* =============================================================================
   TrampHereBro — Static Per-Local Page Generator
   -----------------------------------------------------------------------------
   Pulls live data from Supabase and writes ONE crawlable, pre-rendered HTML page
   per IBEW local into your site repo — with the real contractor / hands / scale
   text baked into the HTML (so Google + AI crawlers can read it), JobPosting +
   BreadcrumbList + FAQPage schema on every page (Google Jobs eligibility), a
   /locals directory hub, and a freshly rebuilt sitemap.xml.

   This is the discovery-burial move: ~270 indexed pages targeting the exact
   searches travelers make ("IBEW Local 26 job calls scale per diem dispatch").

   HOW TO RUN (from your site repo):
       cd /Users/Owner/Desktop/trampherebro
       node generate-pages.js
       git add . && git commit -m "Generate per-local pages" && git push

   Requires Node 18+ (uses built-in fetch). Check with: node -v
   ============================================================================= */

const fs = require('fs');
const path = require('path');

/* ================= CONFIG — the only lines you'd ever change ================ */
const SITE_DIR = '/Users/Owner/Desktop/trampherebro';   // your site repo folder
const CANON    = 'https://www.trampherebro.com';        // canonical origin — matches your live redirect (apex → www)
const SUPA_URL = 'https://cpyhqsfkvtkangjfddis.supabase.co';
const SUPA_KEY = 'sb_publishable_lBCUtgCBIR7IkuwKt5I0Mg_-sb9vLMM';
const CORE_PAGES = ['', 'snapshot', 'calculator', 'jnctn', 'resources', 'contact', 'unionhistory', 'ibewhistory', 'uahistory', 'unionretirement']; // existing top-level pages, added to sitemap
/* =========================================================================== */

const LOCALS_DIR = path.join(SITE_DIR, 'locals');
const COORDS_CACHE = path.join(SITE_DIR, 'coords-cache.json');
const INDEX_HTML = path.join(SITE_DIR, 'index.html');
const CONTACT_FILE = path.join(SITE_DIR, 'locals-contact.json');
let CONTACT = {};
try { CONTACT = JSON.parse(fs.readFileSync(CONTACT_FILE, 'utf8')); } catch (e) { CONTACT = {}; }
const SCALE_FILE = path.join(SITE_DIR, 'locals-scale.json');
let SCALE = {};
try { SCALE = JSON.parse(fs.readFileSync(SCALE_FILE, 'utf8')); } catch (e) { SCALE = {}; }
let LINEMAN_SCALE = {};
try { LINEMAN_SCALE = JSON.parse(fs.readFileSync(path.join(SITE_DIR, 'lineman-scale.json'), 'utf8')); } catch (e) { LINEMAN_SCALE = {}; }
const UA_FILE = path.join(SITE_DIR, 'ua-locals.json');
const TRADE = {
  IBEW: { name: 'IBEW', slug: 'ibew', worker: 'inside wireman', workers: 'inside wiremen' },
  UA:   { name: 'UA',   slug: 'ua',   worker: 'plumber & pipefitter', workers: 'plumbers, pipefitters & HVAC/R techs' },
  LINEMAN: { name: 'IBEW Lineman', slug: 'lineman', worker: 'outside lineman', workers: 'outside linemen' }
};
const tradeOf = local => TRADE[local && local.trade] || TRADE.IBEW;
const OUTLOOK_CACHE = path.join(SITE_DIR, 'outlook-cache.json');
const OUTLOOK_MODEL = 'claude-haiku-4-5-20251001'; // change here if your account needs a different model string
const SNAPSHOT_CACHE = path.join(SITE_DIR, 'snapshot-cache.json');
const SNAPSHOT_MODEL = 'claude-haiku-4-5-20251001'; // once-a-day editorial; bump to a Sonnet string for richer prose
let ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
if (!ANTHROPIC_KEY) { try { const _t = fs.readFileSync(path.join(SITE_DIR, '.env'), 'utf8'); const _m = _t.match(/ANTHROPIC_API_KEY\s*=\s*['"]?([^'"\r\n]+)/); if (_m) ANTHROPIC_KEY = _m[1].trim(); } catch (e) {} }
const TODAY = new Date();
const ISO_DATE = TODAY.toISOString().slice(0, 10);
const VALID_THROUGH = new Date(TODAY.getTime() + 21 * 864e5).toISOString().slice(0, 10);
const PRETTY_DATE = TODAY.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
const UPDATED_STAMP = (()=>{const n=new Date();const d=n.toLocaleDateString('en-US',{timeZone:'America/New_York',month:'long',day:'numeric',year:'numeric'});const t=n.toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'});return d+' \u00b7 '+t+' ET';})();

function stampFor(calls){
  var newest = 0;
  if (calls && calls.length) {
    for (var i=0;i<calls.length;i++){
      var ls = calls[i] && calls[i].last_seen ? Date.parse(calls[i].last_seen) : 0;
      if (ls && ls > newest) newest = ls;
    }
  }
  if (!newest) return UPDATED_STAMP;
  var n = new Date(newest);
  var d = n.toLocaleDateString('en-US',{timeZone:'America/New_York',month:'long',day:'numeric',year:'numeric'});
  var t = n.toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'});
  return d + ' \u00b7 ' + t + ' ET';
}


const CA_PROVINCES = new Set(['AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT']);
const STATE_NAMES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',
  DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',
  KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',
  MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',
  NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',
  OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',
  TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',
  WI:'Wisconsin',WY:'Wyoming',DC:'Washington, D.C.',
  AB:'Alberta',BC:'British Columbia',MB:'Manitoba',NB:'New Brunswick',NL:'Newfoundland and Labrador',
  NS:'Nova Scotia',NT:'Northwest Territories',NU:'Nunavut',ON:'Ontario',PE:'Prince Edward Island',
  QC:'Quebec',SK:'Saskatchewan',YT:'Yukon'
};

/* ------------------------------- helpers ---------------------------------- */
async function supaGet(pathq) {
  const r = await fetch(SUPA_URL + '/rest/v1/' + pathq, {
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY }
  });
  if (!r.ok) throw new Error(pathq + ' -> HTTP ' + r.status);
  return r.json();
}
// Supabase/PostgREST caps a single response at 1000 rows regardless of ?limit.
// Paginate with Range headers to pull EVERYTHING.
async function supaGetAll(pathq) {
  let out = [], from = 0; const size = 1000;
  for (;;) {
    const r = await fetch(SUPA_URL + '/rest/v1/' + pathq, {
      headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY,
                 'Range-Unit': 'items', Range: from + '-' + (from + size - 1) }
    });
    if (!r.ok) throw new Error(pathq + ' -> HTTP ' + r.status);
    const chunk = await r.json();
    out = out.concat(chunk);
    if (!Array.isArray(chunk) || chunk.length < size) break;
    from += size;
  }
  return out;
}
const esc = s => String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const money = v => (v != null && v !== '' && !isNaN(Number(v))) ? '$' + Number(v).toFixed(2) : '—';
const cleanName = (n, id) => String(n || ('IBEW ' + id)).replace(/IBEW\s+Local/i, 'IBEW').replace(/\s+/g,' ').trim();

function localNumber(name) {
  const m = String(name || '').match(/(\d+)/);
  return m ? m[1] : null;
}
function slugFor(name, id, trade) {
  const n = localNumber(name);
  const pfx = (TRADE[trade] && TRADE[trade].slug) || 'ibew';
  if (n) return pfx + '-local-' + n;
  return pfx + '-' + String(name || id).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') + '-' + id;
}
function stateName(abbr) { return STATE_NAMES[abbr] || abbr || ''; }
function countryOf(abbr) { return CA_PROVINCES.has(abbr) ? 'CA' : 'US'; }

/* -------------------------- shared page chrome ---------------------------- */
const CSS = `
:root{--bg:#F8FAFC;--card:#FFFFFF;--navy:#072554;--navy2:#0C2E63;--orange:#FF6B00;--orange-h:#FF7E1F;--orange-soft:rgba(255,107,0,.10);--charcoal:#1E293B;--slate:#64748B;--line:#E5E7EB;--line2:#EEF1F5;--radius:16px;--shadow:0 1px 2px rgba(7,37,84,.04),0 6px 20px rgba(7,37,84,.06);--shadow-lg:0 2px 4px rgba(7,37,84,.05),0 14px 40px rgba(7,37,84,.10)}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;overflow-x:hidden}
body{color:var(--charcoal);font-family:'Inter',system-ui,sans-serif;font-weight:450;line-height:1.6;letter-spacing:-.006em;-webkit-font-smoothing:antialiased;background:#D9E4F1;background-image:radial-gradient(1250px 680px at 94% -12%,rgba(255,107,0,.38),transparent 56%),radial-gradient(1100px 620px at -6% 0%,rgba(7,37,84,.30),transparent 54%),linear-gradient(165deg,#E7EFF8 0%,#D3E0EF 55%,#DBE7F3 100%);background-attachment:fixed;min-height:100vh}
.wrap{max-width:1040px;margin:0 auto;padding:0 28px}
a{color:inherit;text-decoration:none}
.topbar{background:#fff;border-bottom:1px solid var(--line);box-shadow:0 1px 10px rgba(7,37,84,.05);position:sticky;top:0;z-index:20}
.topbar .inner{max-width:1040px;margin:0 auto;padding:15px 28px;display:flex;align-items:center;justify-content:space-between;gap:14px;position:relative}
.brand{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:22px;color:var(--navy);letter-spacing:-.02em}
.brand .b{color:var(--orange)}
.nav{display:flex;gap:17px;align-items:center}
.nav a{font-size:14px;font-weight:600;color:var(--slate);transition:color .15s;white-space:nowrap}
@media(max-width:1120px) and (min-width:641px){.topbar .inner{padding-left:16px;padding-right:16px}.nav{gap:13px}.nav a{font-size:13px}}
.navdd{position:relative;display:inline-flex;align-items:center}.navdd>a{display:inline-flex;align-items:center;gap:4px}.navdd .caret{width:9px;height:9px;transition:transform .18s}.navdd .ddmenu{position:absolute;top:100%;left:-14px;min-width:170px;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 12px 26px rgba(7,37,84,.14);padding:6px;margin-top:8px;opacity:0;visibility:hidden;transform:translateY(-4px);transition:all .16s;z-index:60}.navdd:hover .ddmenu{opacity:1;visibility:visible;transform:translateY(0)}.navdd:hover .caret{transform:rotate(180deg)}.navdd .ddmenu a{display:block;padding:9px 12px;border-radius:7px;font-size:13.5px}.navdd .ddmenu a:hover{background:rgba(255,107,0,.08);color:var(--navy)}@media(max-width:640px){.navdd{display:block;width:100%}.navdd>a{width:100%;justify-content:space-between}.navdd .caret{display:inline-block;width:12px;height:12px;flex-shrink:0;transition:transform .2s}.navdd.open>a .caret{transform:rotate(180deg)}.navdd .ddmenu{position:static;opacity:1;visibility:visible;transform:none;box-shadow:none;border:none;border-radius:0;padding:0;margin:0;min-width:0;display:none}.navdd.open .ddmenu{display:block}.navdd:hover .ddmenu{display:none}.navdd.open:hover .ddmenu{display:block}.navdd .ddmenu a{padding:11px 20px 11px 36px;font-size:14px;color:var(--slate);background:rgba(7,37,84,.02)}}
.navtoggle{display:none;flex-direction:column;gap:4px;background:none;border:none;cursor:pointer;padding:8px;margin-left:auto}
.navtoggle span{display:block;width:22px;height:2.5px;background:var(--navy);border-radius:2px}
/* language toggle — sibling of .nav, so it stays visible on mobile instead of
   collapsing into the hamburger dropdown */
.nav{margin-left:auto}
.langtog{display:inline-flex;align-items:stretch;border:1.5px solid var(--line);border-radius:8px;overflow:hidden;flex-shrink:0;order:3;line-height:1}
.langtog a{display:flex;align-items:center;padding:7px 10px;font-size:12.5px;font-weight:700;color:var(--slate);text-decoration:none;letter-spacing:.03em;background:#fff;transition:background .15s,color .15s}
.langtog a+a{border-left:1.5px solid var(--line)}
.langtog a.on{background:var(--orange);color:#fff}
.langtog a:not(.on):hover{background:rgba(7,37,84,.06);color:var(--navy)}
.brand{order:1}.nav{order:2}.navtoggle{order:4}
@media(max-width:640px){.navtoggle{display:flex;margin-left:0;order:4}.langtog{margin-left:auto;order:3}.nav{display:none;position:absolute;top:100%;left:0;right:0;flex-direction:column;gap:0;background:#fff;border-top:1px solid var(--line);border-bottom:1px solid var(--line);box-shadow:0 12px 26px rgba(7,37,84,.12);padding:6px 0;z-index:40;margin-left:0}.nav.open{display:flex}.nav a{font-size:15px;padding:13px 20px;width:100%;box-sizing:border-box}.nav .langtog{display:none}}
.nav a:hover,.nav a.on{color:var(--navy)}
header{position:relative;margin:0 calc(50% - 50vw);padding:56px max(28px,calc(50vw - 492px)) 46px;background:linear-gradient(180deg,#05122b 0%,#071e46 55%,#0b2a5c 100%);overflow:hidden;color:#EAF0FA;border-bottom:3px solid var(--orange)}
header::after{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);background-size:46px 46px;-webkit-mask-image:radial-gradient(circle at 68% 30%,#000,transparent 72%);mask-image:radial-gradient(circle at 68% 30%,#000,transparent 72%);opacity:.55}
.hero-inner{position:relative;z-index:1}
.crumbs{font-size:12.5px;color:#7E95B8;margin-bottom:16px;font-weight:500}
.crumbs a{color:#9DB3D6}.crumbs a:hover{color:#fff}
.kick{display:inline-flex;align-items:center;gap:8px;font-size:11.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#FF9250;margin-bottom:14px}
.kick .dot{width:7px;height:7px;border-radius:50%;background:var(--orange)}
h1.lede{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:44px;color:#F2F6FC;line-height:1.04;letter-spacing:-.03em}
h1.lede b{color:var(--orange)}
.hsub{margin-top:12px;color:#A6BAD8;font-size:16px;max-width:56ch}
.hstats{display:flex;gap:40px;margin-top:26px;flex-wrap:wrap}
.hstat .n{font-family:'Space Grotesk',sans-serif;font-size:34px;font-weight:700;color:#fff;line-height:1;letter-spacing:-.03em}
.hstat .n.accent{color:var(--orange)}
.hstat .l{font-size:11.5px;color:#849ABC;margin-top:7px;font-weight:500}
main{padding:34px 0 10px}
.sec-h{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:16px;color:var(--navy);margin:6px 0 14px;letter-spacing:-.01em}
.vitcard{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:22px 24px;margin-bottom:26px}
.vitals{display:flex;flex-wrap:wrap;gap:18px 44px}
.vit .l{font-size:11.5px;color:var(--slate);font-weight:500}
.vit .v{font-family:'Space Grotesk',sans-serif;font-size:19px;font-weight:700;color:var(--navy);margin-top:4px}
.vit .v.small{font-size:14px;font-weight:450;color:var(--charcoal);font-family:'Inter',sans-serif}
.dispatch-link{display:inline-flex;align-items:center;gap:7px;color:#fff;background:var(--orange);font-weight:600;padding:10px 18px;border-radius:11px;font-size:14px;margin-top:18px;transition:background .15s}
.dispatch-link:hover{background:var(--orange-h)}
.callcard{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:6px 24px 10px;margin-bottom:26px}
.crow{padding:15px 0;border-top:1px solid var(--line2)}
.crow:first-child{border-top:none}
.r1{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.cneed{font-family:'Space Grotesk',sans-serif;font-size:14px;font-weight:700;color:var(--orange);flex:0 0 auto;min-width:44px}
.cont{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:16px;color:var(--navy);letter-spacing:-.015em}
.cloc{color:var(--slate);font-size:13.5px}
.cpay{margin-left:auto;color:var(--navy);font-size:14px;font-weight:700;flex:0 0 auto}
.cdetail{margin-top:6px;padding-left:56px;font-size:12.5px;color:var(--slate)}
.nocalls{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:30px 24px;margin-bottom:26px;color:var(--slate);font-size:15px}
.nocalls b{color:var(--navy);font-family:'Space Grotesk',sans-serif}
.outlook-lead{font-size:15.5px;line-height:1.62;color:var(--charcoal);font-weight:500;padding:4px 0 14px}
.ocall-count{font-family:'Space Grotesk',sans-serif;font-size:11.5px;font-weight:700;color:var(--orange);text-transform:uppercase;letter-spacing:.05em;padding:10px 0 4px;border-top:1px solid var(--line2)}
.ocall{padding:11px 0;border-top:1px solid var(--line2);font-size:14.5px;line-height:1.5;color:var(--charcoal)}
.ocall b{font-family:'Space Grotesk',sans-serif;font-weight:700;color:var(--navy)}
.ocall-pay{color:var(--navy);font-weight:700}
.ocall-note{color:var(--slate)}
.ocall-dot{color:#cdd5e0;margin:0 1px}
.snap-card{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--orange);border-radius:16px;box-shadow:var(--shadow-lg);padding:28px 30px;font-size:15.5px;line-height:1.7;color:var(--charcoal)}
.snap-card p{margin:0 0 16px}.snap-card p:last-child{margin-bottom:0}
.snap-card b{color:var(--navy);font-family:'Space Grotesk',sans-serif;font-weight:700}
.snap-card p:first-child b{font-size:19px;display:inline-block;margin-bottom:4px}
.snap-date{font-size:12px;color:var(--slate);margin:16px 2px 0}
@media(max-width:600px){.snap-card{padding:22px 20px}}
.outlook{font-size:14.5px;color:var(--charcoal);line-height:1.62;max-width:74ch;margin:2px 0 26px}
.outlook .k{color:var(--orange);font-weight:700}
.faq{margin:6px 0 30px}
.faq h3{font-family:'Space Grotesk',sans-serif;font-size:15px;color:var(--navy);margin:16px 0 5px}
.faq p{font-size:14px;color:var(--charcoal);max-width:74ch}
.backbar{margin:8px 0 40px}
.backbtn{display:inline-flex;align-items:center;gap:8px;color:var(--navy);background:var(--card);border:1px solid var(--line);border-radius:11px;padding:11px 18px;font-weight:600;font-size:14px;box-shadow:var(--shadow);transition:.15s}
.backbtn:hover{border-color:var(--orange);color:var(--orange)}
footer{background:linear-gradient(180deg,#0b2a5c 0%,#05122b 100%);color:#9FB3D0;border-top:3px solid var(--orange)}
footer .inner{max-width:1040px;margin:0 auto;padding:30px 28px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;font-size:13px}
footer b{color:#fff;font-family:'Space Grotesk',sans-serif;font-weight:700}
.foot-updated{display:inline-flex;align-items:center;gap:8px;color:#9db3d6;font-size:13px;font-weight:500}
.fu-dot{width:8px;height:8px;border-radius:50%;background:#4ade80;box-shadow:0 0 0 3px rgba(74,222,128,.22)}
.foot-legal{max-width:1040px;margin:0 auto;padding:16px 28px 30px;border-top:1px solid rgba(255,255,255,.08);font-size:12px;line-height:1.6;color:#7E93B4}
.foot-legal p{margin:0 0 8px}
.foot-legal .credit{color:#cdd8ea}.foot-legal .credit b{color:var(--orange);font-weight:700}
.foot-legal .copyright{color:#63799a;margin-top:2px}
/* directory hub — collapsible + searchable */
.hub-search{width:100%;box-sizing:border-box;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 18px;font:400 16px Inter,sans-serif;color:var(--charcoal);box-shadow:var(--shadow);margin-bottom:22px}
.hub-search::placeholder{color:var(--slate)}
.hub-search:focus{outline:none;border-color:var(--orange);box-shadow:0 0 0 3px var(--orange-soft)}
.hub-country{margin-bottom:30px}
.hub-country-h{display:flex;align-items:center;gap:13px;background:linear-gradient(135deg,#0a2350 0%,#061b40 100%);border-left:4px solid var(--orange);border-radius:12px;padding:16px 20px;margin-bottom:14px;box-shadow:0 6px 20px rgba(7,37,84,.14)}
.hc-flag{font-size:22px;line-height:1}
.hc-name{font:700 20px 'Space Grotesk',sans-serif;color:#fff;letter-spacing:-.02em}
.hc-meta{margin-left:auto;display:flex;gap:8px;font-size:12px;font-weight:600}
.hc-chip{background:rgba(255,255,255,.12);color:#cdd8ea;padding:5px 12px;border-radius:999px;font-family:'Space Grotesk',sans-serif}
.hc-chip.hot{background:var(--orange);color:#fff}
.hub-state{background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);margin-bottom:8px;overflow:hidden}
.hub-state-h{width:100%;box-sizing:border-box;display:flex;align-items:center;gap:14px;padding:15px 16px;background:none;border:none;cursor:pointer;font-family:inherit;text-align:left;transition:background .12s}
.hub-state-h:hover{background:#fbfcfe}
.hs-name{font:700 16px 'Space Grotesk',sans-serif;color:var(--navy);letter-spacing:-.01em}
.hs-meta{margin-left:auto;display:flex;align-items:center;gap:12px;font-size:12.5px;color:var(--slate)}
.hs-oc{background:var(--orange);color:#fff;font-weight:700;padding:2px 9px;border-radius:999px;font-family:'Space Grotesk',sans-serif}
.hs-chev{color:var(--slate);flex:0 0 auto;transition:transform .28s cubic-bezier(.4,0,.2,1)}
.hub-state.open .hs-chev{transform:rotate(180deg);color:var(--orange)}
.hub-state.open .hub-state-h{border-bottom:1px solid var(--line2)}
.hub-state-body{display:grid;grid-template-rows:0fr;transition:grid-template-rows .3s cubic-bezier(.4,0,.2,1)}
.hub-state.open .hub-state-body{grid-template-rows:1fr}
.hub-state-in{overflow:hidden;min-height:0}
.hub-local{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-top:1px solid var(--line2);text-decoration:none;transition:background .1s}
.hub-local:first-child{border-top:none}
.hub-local:hover{background:#fffdfb}
.hl-name{font-size:14.5px;color:var(--charcoal);font-weight:500}
.hub-local:hover .hl-name{color:var(--orange)}
.hl-cc{font-size:12.5px;color:var(--slate);flex:0 0 auto}
.hl-cc.hot{color:#fff;background:var(--orange);font-weight:700;padding:2px 9px;border-radius:999px;font-family:'Space Grotesk',sans-serif}
.hub-empty{text-align:center;color:var(--slate);padding:40px;font-size:15px}
@media(max-width:600px){h1.lede{font-size:32px}.cpay{margin-left:0;flex-basis:100%;margin-top:2px}.cdetail{padding-left:0}header{padding-top:40px;padding-bottom:38px}footer .inner{flex-direction:column;align-items:flex-start}}
`;

/* hard-hat favicon (same mark as the homepage), base64 PNG */
const FAVICON_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAARXUlEQVR4nOWbe5hdVXXAf3ufc+5j7tyZTJLJzCQkIMhDCALyVp5VQF4+ED5C/RSoFqkobf3k84HUlk/sV2sppVJti2KNFuujpljlMxJBQ4BoCJCXSSBhwmTynGQed+Y+z96rf+xzzr0zeTB3Evi0ru8795x7zn6stfZaa6+19t6KBhARBaCUEhHpBt4DvBc4CZgdFVP8boNE923AWuBHwCKl1I5G+vatJaIbnj8rIv3y/wf6ReSz+6NVxS+UUlZEpgMPA5dG321Dud/1kZ8IQl0aYoIXAzcopfbGNCuJxAKYDjwKnAnUAJ/fP6IPBAKEQAD8Brgc2AugRMTHjfTPgHfgiA9eM0xEGi73TilQSiXXawgxbY8BlwFaK6VC4A5eF+IdoVprPM/D993leR5a69eaeHC01XC03qGUCpWIzALWADOjQpPGQkRQKEAQSAiQqBERwb1S0bOiXK7w2/Wb2Lipl917BvH8gFkzpnH8MUdxwvFH4wd+Uja+gyCiiB5BRT0mEtQU42K7MADM94FrgE6cGugD1ZpIeL01OcB7B9YKxoR4ns/2HTu59NqPsfa3L0G5DFac/GtBpXKcd97pPPrd+8hmM4RhiOd54/BOmp8wicX9TpIRKqK1E7gmZkCjxTxsYIzB9320dnytVGps3NwLgU/Q0hEhLiitqY2W2LJlC1rr5IrbiJ8PI8T0XqOBk3FcmXovDaxzog/WWnzfZ3SsyNf/4/ts37GbuUf0cPSR86BSw5qQ0ISExmCNRdWqHP/GuWSzGdZt2MzC//xvrHFSYIw53MOjI1RP1kB3A+5TAxXfFFYErRWe5/Ht//oJZ1y4gA/f9HEee+IpfN9j1sw81KokroWAUoKYkDk9PYjA93/0KB98/0c499KbeeyJZ/B9H0HGqdghQkxrt6ZZ3h6gtAKMtWitKZXKfPCWz/CBGz/Bht5+vFwnS5Y+C8CsjmlgrZvyJJZEx4jZs7tQCp546jm89jn8+rl1XPKuD3PnX98bqYE6nEwAkENydhQqMYLxyA8NjfCeG27nl0uexu+cjgJqYcjSp5YD0N3TkzCxPnMosJauGW2Uy1VWrt2M8T38lI+Ixxe/8AB9O/byzX+5OzKEcrimTNW03o+z+tFz7NhUqzWuvekOfvmLZ0h1zcAYQ2gMKhXQu2UHfVu3M70jD8aCUo6BgjMaIszqnMmzz69hpH8rOhVgjMUKBD3dLHzwu9z2yS/ieRprD58UHBbzKiJ4nsen7/4nlvzkFwSzZlCrhcTG1gsC7MgYy1e8wLS2PIgLMZwERD8KsimfJ5evglDQkf+AQFitEXR18rUHFvJv3/wBvu9hjD0gPs1A0wxQDRqjUFhr8TyPXz65gvu+shC/cwZhrUZCoUTei1Isf24dIqaxMUA5OVIQGsPylWsg8BNRlyhyNdai21u546576d3SH0nCoTOheQloUD2JdNEay51/+1Un2lD385WKrDeQTrHy+TXsGSyA7ydi78pbCNJs6dvOuo2bIZVCrHUSEv2ItehUipHde/mbL33N2YDDoAnNMyCx3GCMs/q/evpZlj35G7y2PMaaaIarRzpWBFIpNr2yk00v9UIQjLckAqQ8nl+9nm07BiDlj7f2kddrQoNqa+V7ixaz+eU+PN+rS8EUjeIUbcD4zr7zg0ehWkMrcNGBSmKEKOEAQcCO3Xt5ZuVayGaw0VRIbASDFEt/vZqxcgW0l/Qh43oUvFRAcWCI7y36GeBmH+I+pgBTYECEigi+71EqlVmydAVkMhhrYdzYqqSOUlCpGV7ZuSdSjdhEKIiCqt7+3ZGFF1ANvn2SjokCpMBn8ePPAODFbvLrxYDGqQ/gxU1beKVvG6QD904mjpqrExs6pdU+6SVRClGgPB3RqZJ6Sikkmi5FnC2QTJo1Gzexd+8QWmvX7+ulAk6k6wzY1NuPKZbrI5GgHj81EBsTEX+XurlQsSooGuUmqaicSCDWgu+ze2CIl7f0ua+H4B1OQQKcZQ8jJ2fr1n6oVtw3EybNxrqf5F/FUZkQlyQN4j9JB4kUuZi/nnPQNkQpje9pVHmU7TsHHB6hmTITlDRZ00b+fgy7dw+wYuVqNrz0Chs3bWXV6vU8u34z5Wq1rsMiiGpwnCOJbew55sV47CLSrSWf9Tlr/gmc9Ob5HHtUN8cdcwRvO+cscq0tSfF6AmXy0BQDYlUbKYzx8yXLeOLp53lh3Ub6t+9icHCYYs1garVI31VEWEPiLxr1OGROzKRS+xKfGHdJbIFWGqUgG3h0TO9gbvdMzj79FC654AwuvuBsglTQNBMmzQA3bWlWrd3I9Td+gg0be52X5ynwtJu6bBS3W3HurrX153joZYKVbOxdxQZAO7UQXNuej/ONBbR2lwgYA8ap1tlnn8aPFt5Ld9dMBNCTZII/qVK41Jbvw8oX1rFh5XJo7QYJwXrgaQIfMi3t5LMpctk0uVyOXGsLbbkMuWyWbCZLEHikUh5BkMLz/TpTYptSCwlrhkq1RrlSplSuUChWKIyOURwdY6xUZqRUpVQsUi1XImaGYDXLH1vKK1u309PdiTXWDczhZIAf5edueN/lFEa+zMBQkSO6ptMzu4vOGR1Mn5ZnZudM2vO5Cbm8wwdiLYWxEjt37GJgcJg9g8Ps2LaDvm27OeHYIznrLSdHgdnkbXvTRvBg0L91O0MjoxTGiowURhkaHqNQGKVYLFGsVKlUq5TLVSrVGmFonNOjQCtNEHikUz7pVIpMJkUmlSKbydCab6Etn6O9LU9bPse0fI558+YcLpQnLwFQnwG+t2gxP37k52zbW6Atq/nhd77CiufWcuGVN1EVD1spO/204gKkRNSJ9F6N1/9xjkLDf6Wd7isgCED7dM/IsXLZI3QFY9QeuBbdNh3xO1AX/ynBCRc6e9NEmqM5BoiggSW/Ws63H3oY0jmOOHoOtdAw/01vZPbcI9i8eSteSzapo1TdnVERYtKQD4gflAKldWQnLTRkm0QErTW1wRFOefOZ9HROw/RvI+hb7tJqBeC4M2EKDGjOEYownndED35LG960NggyjI0WaWnJcskFZ6HGRpNkhgiEoaEWGmq1kGq5TLVYohY6J8qEhjB0meFazVAtlqmWy9RqIbXovQsvxDHFGK54x9sAMNUSKpWBTA5p9aEjVovm/IApRYOtLRlCazEoRkcLlCtlAP7ovNMRrRHlYUZGsGMFMCGBhmzap729lVldHQSBj0gcLTqPKJvWdHd1MK1jGtlMmkBZqFWxxVFMqYoVhZcLuPCtpwPg2SoSlkEsSoWQaZsKKc2pQDy15nPZKFqDarVKuexc4fPPOY0Zc7vZ09vPnXd9jCsvOZ9UKkWuJUM6nSKbzZJOBVx09c2sWv0iOteCQhEODnHFZe/koa/eQ2G0SKVSoVIqUyyVqdZCvvHwj/n3+x/ilPPP4MTjj3FmolZE2chgeBoy7eORfC0YEEO+NQdao7RHtVJmbKwEQE9PF8fMm8MpJxzLFz53+wHray9KRkfBDyiCVJp8a861PQFOP+0kfvHYUk498ViCdJoQ8MrDboFLLOgUpPetNxlokgGOu+3T2kH7KIQwtJQqUTAkwl9+ZAGnn+bm4zAMG+IGFfn/DdFOAhYb1qI68VJYPeuUSgV868EvMTY25oIjpaAYM0AgSEOm9bVnQF0FchD4zqqHlqGRsQhZw4Jrr3LMsILvT2g+XpaMnxsNVsP+AK3rGYM43n/r2ae6dk2I9nykPOqCSGsRP4NKJOB1UIHWlgxenLm1IUNDQ8k3Y0zD1DcemSQeHOf/Tw5pY6ybKuOV4NJw5EVbCFrBzza0N3lochZwrbe2tpCJM0DWUiiMAg6fZKPD/oxRkk9tSJdM0g/VWo1rV4rDkURZSOdRQaY5UuJ2mykc05TLtZDJpLFRlFcYK7oPB/OqYw8vXgjZt/VxfbwqFIci7AXVkncRo4zLP00KpuQHtGTT5LJZx30hsQGHsMyYVB0nIAcpqEqDiTst2faoXvNhTXMMiIYnk07T1ppzfr7WDA2NNn4+MN77pnxgorV4tUGMOykN1Y1qZtqEJPrkoTkVIEqHBz75fIsLdrRmZHi4ocT+QZI5P3lRRziZHl+FiXFKSgQpFRz2AqqlfcqLRE2rQLwS09U500V8Gvq27wQ4aCrqwEtZ4w3hwaQ4SZmXCzC6E1Q0iXXMfvXKB4Dms8JRJ8e9YQ6qWkHlWlm14RX27BnC83Q9O7sfXGSf+a9x4ePV7UecJWbnBhjsBz/t1l67Tojaad4GTXll6Pxz34J4Hn6QYtfmXn7++DLAzdf7iDv7G5wGFYBGbdgHEsbFKrDqESiHYENobYMjz4gqvw4M8LRGcAyYfdQcTKkE6Qz3f+OHyXqf2g8ZB0QtUY0o9m/8ljBFRT6/RkZ2I099E1rTUK7AUefC9CNdQrb5/R5TkAANYRjS3p7npuuvxhZGSU2fxtOPL+MbC3+I73uE1oyvIxPFn2i0XmXExhlNl+hQP70btWsrBGk3YVx0a2Sdp7ZXYArL48pJgQgfv+UGZsydjRkt4rXl+eRd/8j6F3sJfH/8Dg4VL3M1UJQ4gw3rBuyfJcqGKC+A1T+FJ74G+RyMjMBxb4WTr4qkY2qJ2ObXBpWz6MZYurtmcs+df4YZKeBnMgwPj/G+9/85e/YOHWAbS7zVTdUpVYDSiN3fNjgF1iBegGxdgzx4o1MDa1FBgLr2XucBxnmBKcAUZgF39zyNMYaP3HQd77rucio795DpyLNu7Yu8e8HHGSmMRUwYrw6e5+GnggarqMEa0oEXrQQ3MMHWUJ4PuzYh978LigMu9B0pwVWfg6PPBhO6hZIpwhRq1hF0e4SEh/75bk487U2UB/aS6ZzBsmXPccU1t7Jz1x5833cpcHEG8uXePvq39KFSKbeuYS0qnWb9S1soFUsuhBZxhHkB0rcK/uEy1NDL0JJHhgtw7jVwxV2uzBQM30QGNOU9NC54Kq0QsUzvaOOR79zHvHmzKQ8VyHROY9mTy7n48htZv/FllwMENmzYxBkXXMf2XcN4mTRWjNtP3J5nxdPPc+GVH2RkeMSpgh8gq3+G/N3bYe8maGmHkQLMvwh180LALbhOdV9ABBLvmZ18jQlGS2uNCQ3HHD2Pxf/zIEfN7aG8a4BMVye/famP8y//EIv+dwm+5zFz5nT+eMF7QXmEhQJ+EOAHKWoDA+Q7O7jhfVeSasmB5yGL70M9cDUqHESyrTA4DCdehLptEaRboszQIe/yU4jI9uhgkZ3U8SNrxVqb3OOrVquJiMiml7fI/HPeK2RPkvSR5wkzThWyb5TPfv7epIlFP35M3nDi24XsSUL2RDn34utl1QtrXPNjg2IeuE7sjYi9LS329rzYG5HwvqvElgtiRcSGtXF9x1cTEBfejogsjl6Ek625384bmDAwOCxXXvtRQb9Bgp4zJT33XKH1ZLnk3bfIhg2bRERkcGhEFtx8h3ziM38v1ajtyuolYj9/stgPIeb2vNhbAjEfQOzDfyHWGte3Cffbf5MMCCNSFiMit0YvzaSqWivWmAMiEYaOj8YY+fRffVlonS+kjhda3iTQKbQcL/d8+esyOjpWb3Nom9S+9VEx1yNmAWL/BEf4ba1invjXiHBz0H6bZEBM661TOjIjjZsQIjc2CmZRirpLrBQ/WbyUFb9ZhUoHaE9TrQmV0THefcWFnHPWKc69X/MoasPjqHxH5NBFa/+nXo2a95a6m9vY54TQWjh4NNpYOroPAPNjgj4VcaS6X35NEYyZnFAdvJFJaWYzENP4KeC1PzbnokO32Nk4dJ7XcEos3k0yEbQ+5Hl+AuxzbO4P/uCkjg4SK6XUHuCduOOlAfWM2/jtn78/INTxVziaFgPvjGhVSil3iDg6N6yVUnuVUpcBd+JOX2vqB4x+30BRx38bcKdS6rLGc8NxoQTkD/D4/P8BBQkjD4DKC88AAAAASUVORK5CYII=';
const FAVICON_LINK = `<link rel="icon" type="image/png" href="/favicon.png"><link rel="apple-touch-icon" href="/favicon.png">`;
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;450;500;600;700&display=swap" rel="stylesheet">`;
const GA_TAG = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-9FS52YDCPK"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-9FS52YDCPK');</script>`;

/* ============================ i18n / bilingual ============================ */
const LANGS = ['en', 'es'];
// Pages that currently have a fully-translated /es/ mirror. Add a key here the
// moment its Spanish version ships, and the toggle + nav + sitemap light up for it.
const TRANSLATED = new Set(['unionretirement', 'unionhistory', 'ibewhistory', 'uahistory', 'calculator', 'resources', 'jnctn', 'contact']);
// Spanish-formatted "updated" date for the footer
const PRETTY_DATE_ES = TODAY.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
// localized href: point at /es/<page> only if that page is actually translated,
// otherwise fall back to the English URL so nothing 404s mid-rollout.
function lhref(page, lang) {
  const useEs = lang === 'es' && TRANSLATED.has(page);
  if (page === '' || page === 'home') return useEs ? '/es' : '/';
  return (useEs ? '/es/' : '/') + page;
}
// reciprocal hreflang tags for a translated page (drop into <head>)
function hreflangTags(page) {
  const en = CANON + '/' + page;
  const es = CANON + '/es/' + page;
  return `<link rel="alternate" hreflang="en" href="${en}"><link rel="alternate" hreflang="es" href="${es}"><link rel="alternate" hreflang="x-default" href="${en}">`;
}
/* ========================================================================= */

/* On mobile the History dropdown starts collapsed; tapping it expands rather
   than navigating away. Desktop keeps its hover behaviour untouched. */
const NAV_JS = `<script id="nav-dd-js">(function(){function w(){return window.matchMedia('(max-width:640px)').matches;}
document.addEventListener('click',function(e){var a=e.target.closest?e.target.closest('.navdd>a'):null;if(!a||!w())return;
e.preventDefault();var dd=a.parentNode;dd.classList.toggle('open');},false);})();<\/script>`;

function topbar(active, lang, togglePath) {
  lang = lang || 'en';
  const on = p => active === p ? ' class="on"' : '';
  const T = lang === 'es'
    ? { board:'Tablero', daily:'Reporte Diario', calc:'Calculadora de Pago', res:'Recursos', ret:'Jubilación Sindical', hist:'Historia', uh:'Historia Sindical', ibew:'Historia del IBEW', ua:'Historia del UA', contact:'Contacto', join:'Únete a JNCTN' }
    : { board:'Board', daily:'Daily Update', calc:'Pay Calculator', res:'Resources', ret:'Union Retirement', hist:'History', uh:'Union History', ibew:'IBEW History', ua:'UA History', contact:'Contact', join:'Join JNCTN' };
  // Segmented EN|ES control. Lives OUTSIDE <nav> so it stays visible on mobile
  // rather than collapsing into the hamburger menu.
  const tp = togglePath || (TRANSLATED.has(active) ? active : null);
  let toggle = '';
  if (tp) {
    const enHref = '/' + tp;
    const esHref = '/es/' + tp;
    toggle = `<div class="langtog" role="group" aria-label="Language / Idioma">`
      + `<a href="${enHref}" hreflang="en"${lang === 'en' ? ' class="on" aria-current="true"' : ''} aria-label="English">EN</a>`
      + `<a href="${esHref}" hreflang="es"${lang === 'es' ? ' class="on" aria-current="true"' : ''} aria-label="Español">ES</a>`
      + `</div>`;
  }
  return `<div class="topbar"><div class="inner">
<a class="brand" href="${lhref('', lang)}">Tramp<span class="b">Here</span>Bro</a>
${toggle}<button class="navtoggle" aria-label="Menu" onclick="document.querySelector('.topbar .nav').classList.toggle('open')"><span></span><span></span><span></span></button>
<nav class="nav"><a href="${lhref('', lang)}"${on('home')}>${T.board}</a><a href="${lhref('snapshot', lang)}"${on('snapshot')}>${T.daily}</a><a href="${lhref('calculator', lang)}"${on('calculator')}>${T.calc}</a><a href="${lhref('resources', lang)}"${on('resources')}>${T.res}</a><a href="${lhref('unionretirement', lang)}"${on('unionretirement')}>${T.ret}</a><span class="navdd"><a href="${lhref('unionhistory', lang)}"${on('unionhistory')}${on('ibewhistory')}>${T.hist}<svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></a><span class="ddmenu"><a href="${lhref('unionhistory', lang)}">${T.uh}</a><a href="${lhref('ibewhistory', lang)}">${T.ibew}</a><a href="${lhref('uahistory', lang)}">${T.ua}</a></span></span><a href="${lhref('contact', lang)}"${on('contact')}>${T.contact}</a><a href="${lhref('jnctn', lang)}" style="background:var(--orange);color:#fff;padding:6px 13px;border-radius:8px;font-weight:700;white-space:nowrap">${T.join}</a></nav>
</div></div>${NAV_JS}`;
}
function footer(lang) {
  lang = lang || 'en';
  const F = lang === 'es'
    ? { updated: 'Actualizado ' + esc(PRETTY_DATE_ES),
        histLink: 'Historia del Trabajo Organizado',
        disclaimer: 'TrampHereBro es una plataforma de información independiente. No tenemos afiliación con ningún sindicato, organización laboral, entidad gubernamental o grupo industrial. Toda la información se proporciona únicamente con fines educativos.',
        credit: 'Hecho con orgullo por Noah "<b>Spanky The Sparky</b>" — Oficial del IBEW',
        rights: 'Todos los derechos reservados.' }
    : { updated: 'Updated ' + esc(PRETTY_DATE),
        histLink: 'History of Organized Labor',
        disclaimer: 'TrampHereBro is an independent information platform. We have no affiliation with any union, labor organization, government entity, or industry group. All information is provided for educational purposes only.',
        credit: 'Proudly made by Noah "<b>Spanky The Sparky</b>" — IBEW Journeyman',
        rights: 'All rights reserved.' };
  return `<footer><div class="inner"><div><b>TrampHereBro</b></div>
<div class="foot-updated"><span class="fu-dot"></span>${F.updated}</div></div>
<div class="foot-legal"><p style="margin-bottom:10px"><a href="${lhref('unionhistory', lang)}" style="color:var(--orange);font-weight:600;text-decoration:none">${F.histLink}</a></p><p>${F.disclaimer}</p>
<p class="credit">${F.credit}</p><p class="copyright">© ${TODAY.getFullYear()} TrampHereBro. ${F.rights}</p></div></footer>`;
}

/* --------------------------- per-local page ------------------------------- */
function callDetail(c) {
  const bits = [];
  if (c.call_type) bits.push(esc(c.call_type));
  if (c.duration) bits.push(esc(c.duration));
  if (c.per_diem) bits.push('per diem ' + esc(c.per_diem));
  if (c.notes) bits.push(esc(String(c.notes).replace(/\s+/g,' ').slice(0, 120)));
  return bits.join(' · ');
}
function callRow(c, lang) {
  const es = lang === 'es';
  const cls = String(c.call_type || 'JW').replace(/inside\s*/i, '').trim() || 'JW';
  const parts = [];
  if (c.contractor) parts.push(`<b>${esc(c.contractor)}</b>`);
  if (c.num_needed) parts.push(`${c.num_needed} ${esc(cls)}`);
  const loc = [c.job_name, c.location].filter(Boolean).map(esc).join(' ');
  if (loc) parts.push(loc);
  if (c.duration) parts.push(esc(c.duration));
  const pay = (c.scale != null && c.scale !== '') ? '$' + Number(c.scale).toFixed(2) + '/hr'
            : (c.per_diem ? (es ? 'viáticos ' : 'per diem ') + esc(c.per_diem) : (es ? 'escala' : 'scale'));
  parts.push(`<span class="ocall-pay">${pay}</span>`);
  if (c.per_diem && c.scale != null && c.scale !== '') parts.push((es ? 'viáticos ' : 'per diem ') + esc(c.per_diem));
  if (c.notes) parts.push(`<span class="ocall-note">${esc(String(c.notes).replace(/\s+/g, ' ').slice(0, 90))}</span>`);
  return `<div class="ocall">${parts.join(' <span class="ocall-dot">·</span> ')}</div>`;
}

function jobPostingLd(local, c) {
  const n = localNumber(local.name);
  const TL = tradeOf(local).name;
  const title = (c.call_type || 'Journeyman') + ' — ' + TL + ' Local ' + (n || local.id);
  const org = c.contractor || (TL + ' Local ' + (n || local.id));
  const descParts = [
    (c.num_needed ? c.num_needed + ' hands needed. ' : ''),
    'Union job call dispatched through ' + TL + ' Local ' + (n || local.id) +
      (local.city ? ' (' + local.city + (local.state ? ', ' + local.state : '') + ')' : '') + '. ',
    (c.scale != null && c.scale !== '' ? 'Journeyman scale ' + money(c.scale) + '/hr. ' : ''),
    (c.per_diem ? 'Per diem ' + c.per_diem + '. ' : ''),
    (c.duration ? 'Duration: ' + c.duration + '. ' : ''),
    (c.notes ? String(c.notes).replace(/\s+/g,' ').slice(0, 200) : '')
  ].join('').trim() || 'Open IBEW union job call for traveling electricians.';

  const obj = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title,
    description: descParts,
    datePosted: ISO_DATE,
    validThrough: VALID_THROUGH,
    employmentType: 'FULL_TIME',
    industry: 'Electrical Construction',
    hiringOrganization: { '@type': 'Organization', name: org, sameAs: local.website || undefined },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: local.city || undefined,
        addressRegion: local.state || undefined,
        addressCountry: countryOf(local.state)
      }
    },
    directApply: false
  };
  if (c.scale != null && c.scale !== '' && !isNaN(Number(c.scale))) {
    obj.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: countryOf(local.state) === 'CA' ? 'CAD' : 'USD',
      value: { '@type': 'QuantitativeValue', value: Number(c.scale), unitText: 'HOUR' }
    };
  }
  return obj;
}

function localPage(local, calls, lang) {
  lang = lang || 'en';
  const es = lang === 'es';
  const n = localNumber(local.name);
  const T = tradeOf(local);
  const _sc = local.trade === 'LINEMAN' ? (LINEMAN_SCALE[localNumber(local.name)] || {}) : ((local.trade && local.trade !== 'IBEW') ? {} : (SCALE[localNumber(local.name)] || {}));
  if (_sc.scale) local.jw_scale = _sc.scale;
  if (_sc.hw) local.hw = _sc.hw;
  const label = T.name + ' Local ' + (n || local.id);
  const place = [local.city, local.state].filter(Boolean).join(', ');
  const slug = slugFor(local.name, local.id, local.trade);
  const urlEn = `${CANON}/locals/${slug}`;
  const urlEs = `${CANON}/es/locals/${slug}`;
  const url = es ? urlEs : urlEn;
  const home = es ? '/es' : '/';
  const localsHub = es ? '/es/locals' : '/locals';
  // Spanish label for the workers of this trade
  const workersEs = local.trade === 'LINEMAN' ? 'linemen' : (local.trade === 'UA' ? 'plomeros y pipefitters' : 'electricistas');
  const workers = es ? workersEs : T.workers;

  // "Send to a buddy" — text/email/copy share (baked per page)
  const _scall = calls.slice(0, 5).map(c => '• ' + [c.contractor, ((c.num_needed ? c.num_needed + ' ' : '') + (c.call_type || '')).trim(), c.location].filter(Boolean).join(' · ')).join('\n');
  const _sbody = calls.length
    ? (es
        ? `${label} — ${calls.length} llamada${calls.length > 1 ? 's' : ''} abierta${calls.length > 1 ? 's' : ''} en TrampHereBro:\n\n${_scall}${calls.length > 5 ? `\n…y ${calls.length - 5} más` : ''}\n\nVer todas las llamadas + info de despacho:\n${url}`
        : `${label} — ${calls.length} open call${calls.length > 1 ? 's' : ''} on TrampHereBro:\n\n${_scall}${calls.length > 5 ? `\n…and ${calls.length - 5} more` : ''}\n\nSee all calls + dispatch info:\n${url}`)
    : (es
        ? `${label} en TrampHereBro — despacho, escala e info de contacto:\n${url}`
        : `${label} on TrampHereBro — dispatch, scale & contact info:\n${url}`);
  const _ssub = es ? `Llamadas de trabajo de ${label} — TrampHereBro` : `${label} job calls — TrampHereBro`;
  const _sms = 'sms:?&body=' + encodeURIComponent(_sbody);
  const _mail = 'mailto:?subject=' + encodeURIComponent(_ssub) + '&body=' + encodeURIComponent(_sbody);
  const S = es
    ? { head: 'Manda este local a un compa', sub: 'Envía estas llamadas por mensaje o correo a alguien buscando trabajo.', txt: 'Mandar mensaje', mail: 'Enviar correo', copy: 'Copiar enlace', copied: 'Enlace copiado', upd: 'Actualizado' }
    : { head: 'Send this local to a buddy', sub: 'Text or email these calls to someone chasing work.', txt: 'Text it', mail: 'Email it', copy: 'Copy link', copied: 'Link copied', upd: 'Updated' };
  const shareBlock = `<div style="margin:22px 0;padding:18px 20px;background:var(--card);border:1px solid var(--line);border-radius:14px"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap"><div style="font-weight:800;color:var(--navy);font-size:15px">${S.head}</div><div data-ts="buddy" style="display:inline-flex;align-items:center;gap:7px;padding:7px 13px;background:rgba(255,107,0,.12);border:1px solid rgba(255,107,0,.55);border-radius:999px;color:var(--orange);font-size:12.5px;font-weight:800;white-space:nowrap"><span style="width:8px;height:8px;border-radius:50%;background:var(--orange)"></span>${S.upd} ${stampFor(calls)}</div></div><div style="color:var(--slate);font-size:13px;margin:4px 0 13px">${S.sub}</div><div style="display:flex;gap:10px;flex-wrap:wrap"><a href="${_sms}" style="display:inline-block;padding:11px 20px;border-radius:10px;background:var(--orange);color:#fff;font-weight:700;font-size:14px;text-decoration:none">${S.txt}</a><a href="${_mail}" style="display:inline-block;padding:11px 20px;border-radius:10px;background:var(--navy);color:#fff;font-weight:700;font-size:14px;text-decoration:none">${S.mail}</a><button type="button" onclick="if(navigator.clipboard){navigator.clipboard.writeText('${url}');this.textContent='${S.copied}'}" style="padding:11px 20px;border-radius:10px;background:#fff;color:var(--navy);border:1px solid var(--line);font-weight:700;font-size:14px;cursor:pointer">${S.copy}</button></div></div>`;
  const hands = calls.reduce((s, c) => s + (Number(c.num_needed) || 0), 0);
  const hasCalls = calls.length > 0;

  const title = es
    ? (hasCalls
        ? `Llamadas de Trabajo de ${label} — ${calls.length} Llamadas Abiertas, Escala y Despacho | TrampHereBro`
        : `Llamadas de Trabajo de ${label}, Escala de Oficial y Despacho${place ? ' — ' + place : ''} | TrampHereBro`)
    : (hasCalls
        ? `${label} Job Calls — ${calls.length} Open Calls, Scale & Dispatch | TrampHereBro`
        : `${label} Job Calls, Journeyman Scale & Dispatch${place ? ' — ' + place : ''} | TrampHereBro`);
  const desc = es
    ? (hasCalls
        ? `${calls.length} llamadas de trabajo abiertas en ${label} ahora mismo — ${hands} manos necesarias${local.jw_scale != null ? ', escala de oficial ' + money(local.jw_scale) + '/hr' : ''}. Contratista, viáticos e info de despacho para ${workers} viajeros. Actualizado ${PRETTY_DATE_ES}.`
        : `Llamadas de trabajo de ${label}${local.jw_scale != null ? ', escala de oficial (' + money(local.jw_scale) + '/hr),' : ','} contacto e información de despacho para ${workers} viajeros${place ? ' en ' + place : ''}. No hay llamadas abiertas ahora mismo — actualizado a diario.`)
    : (hasCalls
        ? `${calls.length} open ${label} job calls right now — ${hands} hands needed${local.jw_scale != null ? ', JW scale ' + money(local.jw_scale) + '/hr' : ''}. Contractor, per diem, and dispatch info for traveling ${T.workers}. Updated ${PRETTY_DATE}.`
        : `${label} job calls${local.jw_scale != null ? ', journeyman scale (' + money(local.jw_scale) + '/hr),' : ','} contact and dispatch info for traveling ${T.workers}${place ? ' in ' + place : ''}. No open calls posted right now — updated daily.`);

  // vitals
  const _ci = (local.trade && local.trade !== 'IBEW') ? {} : (CONTACT[localNumber(local.name)] || {});
  const cPhone = _ci.phone || local.phone || '';
  const cAddress = _ci.address || local.address || '';
  const cEmail = _ci.email || local.email || '';
  const cWebsite = _ci.website || local.website || '';
  const vit = (l, v, small) => `<div class="vit"><div class="l">${l}</div><div class="v${small ? ' small' : ''}">${v}</div></div>`;
  const _m = v => (v != null && v !== '' && !isNaN(Number(v))) ? '$' + Number(v).toFixed(2) : null;
  const _hr = '<span style="font-size:12px;color:var(--slate);font-weight:400">/hr</span>';
  const _scaleStr = _m(local.jw_scale);
  const _noPen = !_m(_sc.pension_def) && !_m(_sc.pension_dc) && !_m(_sc.nebf) && !_m(_sc.k401);
  const V = es
    ? { jw: 'Escala de Oficial', total: 'Paquete Total', hw: 'Salud y Bienestar', pdef: 'Pensión Definida', pdc: 'Pensión de Contribución', nebf: 'Pensión NEBF', k401: '401(k)', pen: 'Pensión', vac: 'Vacaciones', dues: 'Cuotas de Trabajo', books: 'Libros', bk1: 'Lib1', bk2: 'Lib2' }
    : { jw: 'Journeyman Scale', total: 'Total Package', hw: 'Health &amp; Welfare', pdef: 'Defined Pension', pdc: 'Contribution Pension', nebf: 'NEBF Pension', k401: '401(k)', pen: 'Pension', vac: 'Vacation', dues: 'Working Dues', books: 'Books', bk1: 'Bk1', bk2: 'Bk2' };
  const vitals = [
    _scaleStr ? vit(V.jw, _scaleStr + _hr) : '',
    _m(_sc.total) ? vit(V.total, _m(_sc.total) + _hr) : '',
    _m(local.hw) ? vit(V.hw, _m(local.hw)) : '',
    _m(_sc.pension_def) ? vit(V.pdef, _m(_sc.pension_def)) : '',
    _m(_sc.pension_dc) ? vit(V.pdc, _m(_sc.pension_dc)) : '',
    _m(_sc.nebf) ? vit(V.nebf, _m(_sc.nebf)) : '',
    _m(_sc.k401) ? vit(V.k401, _m(_sc.k401)) : '',
    (_noPen && local.pension != null) ? vit(V.pen, money(local.pension), true) : '',
    _sc.vacation ? vit(V.vac, esc(_sc.vacation), true) : '',
    _sc.dues ? vit(V.dues, esc(_sc.dues), true) : '',
    (local.book1 != null || local.book2 != null)
      ? vit(V.books, `${local.book1 != null ? V.bk1 + ' ' + esc(local.book1) : ''}${(local.book1 != null && local.book2 != null) ? ' · ' : ''}${local.book2 != null ? V.bk2 + ' ' + esc(local.book2) : ''}` || '—', true)
      : ''
  ].filter(Boolean).join('');
  const wageUpdated = _sc.updated
    ? `<div style="font-size:11.5px;color:var(--slate);margin-top:16px;padding-top:12px;border-top:1px solid var(--line2)">${es ? 'Paquete salarial actualizado por última vez' : 'Wage package last updated'} ${esc(_sc.updated)} · ${es ? 'Datos salariales vía' : 'Wage data via'} <a href="https://www.unionpayscales.com" target="_blank" rel="noopener" style="color:var(--slate);text-decoration:underline">unionpayscales.com</a></div>`
    : '';

  const _telHref = cPhone.replace(/[^\d+]/g, '');
  const _webShow = cWebsite.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const C = es
    ? { contact: 'Contacto', addr: 'Dirección', phone: 'Teléfono', email: 'Correo', web: 'Sitio Web' }
    : { contact: 'Contact', addr: 'Address', phone: 'Phone', email: 'Email', web: 'Website' };
  const contactItems = [
    cAddress ? vit(C.addr, esc(cAddress), true) : '',
    cPhone ? vit(C.phone, `<a href="tel:${esc(_telHref)}" style="color:inherit">${esc(cPhone)}</a>`, true) : '',
    cEmail ? vit(C.email, `<a href="mailto:${esc(cEmail)}" style="color:var(--orange);font-weight:600">${esc(cEmail)}</a>`, true) : '',
    cWebsite ? vit(C.web, `<a href="${esc(cWebsite)}" target="_blank" rel="noopener" style="color:var(--orange);font-weight:600">${esc(_webShow)}</a>`, true) : ''
  ].filter(Boolean).join('');
  const contactCard = contactItems ? `<div class="sec-h">${C.contact}</div><div class="vitcard"><div class="vitals">${contactItems}</div></div>` : '';

  const callsBlock = hasCalls
    ? `<div class="sec-h">${es ? 'Panorama de Trabajo' : 'Work Outlook'}</div><div class="callcard">`
      + (local._outlook ? `<p class="outlook-lead">${esc(local._outlook)}</p>` : '')
      + `<div class="ocall-count">${es ? `${calls.length} llamada${calls.length > 1 ? 's' : ''} abierta${calls.length > 1 ? 's' : ''} · ${hands} manos necesarias` : `${calls.length} open call${calls.length > 1 ? 's' : ''} · ${hands} hands needed`}</div>`
      + calls.map(c => callRow(c, lang)).join('')
      + `</div>`
    : `<div class="sec-h">${es ? 'Llamadas abiertas' : 'Open calls'}</div><div class="nocalls">${es
        ? `<b>No hay llamadas abiertas publicadas ahora mismo.</b><br>Este local no muestra llamadas abiertas en este momento. La escala y la información de despacho abajo siguen vigentes — vuelve a revisar, el tablero se actualiza a diario.`
        : `<b>No open calls posted right now.</b><br>This local isn't showing open calls at the moment. Scale and dispatch info below stays current — check back, the board is swept daily.`}</div>`;

  const _scaleLine = local.jw_scale != null
    ? (es ? ` La escala de oficial es de <span class="k">${money(local.jw_scale)}/hr</span>.` : ` Journeyman scale runs <span class="k">${money(local.jw_scale)}/hr</span>.`)
    : '';
  const outlook = es
    ? (hasCalls
        ? `${label}${place ? ' en ' + place : ''} tiene actualmente <span class="k">${calls.length} llamada${calls.length > 1 ? 's' : ''} de trabajo abierta${calls.length > 1 ? 's' : ''}</span> en los libros, necesitando alrededor de <span class="k">${hands} manos</span>.${_scaleLine} Las llamadas de abajo se extraen en vivo del despacho del local — firma el libro correspondiente y llama al salón para confirmar antes de salir.`
        : `${label}${place ? ' cubre ' + place : ''} y se monitorea aquí para ${workers} viajeros.${_scaleLine} No hay llamadas abiertas ahora mismo, pero esta página se actualiza a diario — guárdala y vuelve a revisar, o mira el <a href="${home}" style="color:var(--orange);font-weight:600">tablero en vivo</a> completo de todo el país.`)
    : (hasCalls
        ? `${label}${place ? ' out of ' + place : ''} currently has <span class="k">${calls.length} open job call${calls.length > 1 ? 's' : ''}</span> on the books, needing about <span class="k">${hands} hands</span>.${_scaleLine} Calls below are pulled live from the local's dispatch — sign the appropriate book and call the hall to confirm before you roll.`
        : `${label}${place ? ' covers ' + place : ''} and is tracked here for traveling ${T.workers}.${_scaleLine} No calls are open right now, but this page updates daily — bookmark it and check back, or watch the full <a href="${home}" style="color:var(--orange);font-weight:600">live board</a> for the whole country.`);

  // schema — always English-language facts, but localized names/urls
  const breadcrumb = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: es ? 'Inicio' : 'Home', item: CANON + (es ? '/es' : '/') },
      { '@type': 'ListItem', position: 2, name: es ? 'Locales' : 'Locals', item: CANON + localsHub },
      { '@type': 'ListItem', position: 3, name: label, item: url }
    ]
  };
  const faq = es ? {
    '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: 'es',
    mainEntity: [
      { '@type': 'Question', name: `¿${label} tiene llamadas de trabajo abiertas ahora mismo?`,
        acceptedAnswer: { '@type': 'Answer', text: hasCalls
          ? `Sí — ${label} tiene ${calls.length} llamada${calls.length > 1 ? 's' : ''} abierta${calls.length > 1 ? 's' : ''} necesitando alrededor de ${hands} manos al ${PRETTY_DATE_ES}. Los detalles están en esta página y se actualizan a diario.`
          : `No por el momento. ${label} no tiene llamadas abiertas publicadas al ${PRETTY_DATE_ES}. Esta página se revisa a diario, así que vuelve a consultarla para ver nuevas llamadas.` } },
      { '@type': 'Question', name: `¿Cuál es la escala de oficial en ${label}?`,
        acceptedAnswer: { '@type': 'Answer', text: local.jw_scale != null
          ? `La escala base de oficial en ${label} es de ${money(local.jw_scale)} por hora${local.hw != null ? ', más ' + money(local.hw) + ' de salud y bienestar' : ''}.`
          : `La escala de ${label} aún no está confirmada en esta página. Contacta al despacho del local para conocer las tarifas salariales actuales.` } }
    ]
  } : {
    '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: 'en',
    mainEntity: [
      { '@type': 'Question', name: `Does ${label} have open job calls right now?`,
        acceptedAnswer: { '@type': 'Answer', text: hasCalls
          ? `Yes — ${label} has ${calls.length} open call${calls.length > 1 ? 's' : ''} needing about ${hands} hands as of ${PRETTY_DATE}. Details are listed on this page and updated daily.`
          : `Not at the moment. ${label} has no open calls posted as of ${PRETTY_DATE}. This page is swept daily, so check back for new calls.` } },
      { '@type': 'Question', name: `What is the journeyman scale at ${label}?`,
        acceptedAnswer: { '@type': 'Answer', text: local.jw_scale != null
          ? `The journeyman base scale at ${label} is ${money(local.jw_scale)} per hour${local.hw != null ? ', plus ' + money(local.hw) + ' health & welfare' : ''}.`
          : `Scale for ${label} isn't confirmed on this page yet. Contact the local's dispatch for current wage rates.` } }
    ]
  };
  const jobLd = calls.map(c => { const o = jobPostingLd(local, c); o.inLanguage = lang; return o; });
  const ldBlocks = [breadcrumb, faq, ...jobLd]
    .map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n');

  const hrefAlts = `<link rel="alternate" hreflang="en" href="${urlEn}"><link rel="alternate" hreflang="es" href="${urlEs}"><link rel="alternate" hreflang="x-default" href="${urlEn}">`;
  const H = es
    ? { crumbHome: 'Tablero', crumbLocals: 'Locales', kick: `Llamadas de Trabajo de ${T.name} en Vivo`, h1b: 'Llamadas de Trabajo',
        oc: 'LLAMADAS ABIERTAS', hn: 'MANOS NECESARIAS', sc: 'ESCALA OFICIAL / HR', vitalsH: 'Datos del local',
        back1: '← Volver al tablero completo en vivo', back2: 'Todos los locales →' }
    : { crumbHome: 'Board', crumbLocals: 'Locals', kick: `Live ${T.name} Job Calls`, h1b: 'Job Calls',
        oc: 'OPEN CALLS', hn: 'HANDS NEEDED', sc: 'JW SCALE / HR', vitalsH: 'Local vitals',
        back1: '← Back to the full live board', back2: 'All locals →' };
  const hsub = es
    ? `${place ? esc(place) + ' · ' : ''}${local.trade && local.trade !== 'IBEW' ? 'Información de contacto y llamadas de trabajo para ' + workers + ' viajeros — actualizado a diario.' : 'Llamadas abiertas de electricista interior, escala de oficial y despacho — actualizado a diario.'}`
    : `${place ? esc(place) + ' · ' : ''}${local.trade && local.trade !== 'IBEW' ? 'Contact and job-call info for traveling ' + T.workers + ' — updated daily.' : 'Open inside-wireman calls, journeyman scale, and dispatch — updated daily.'}`;
  const faqQ1 = es ? `¿${esc(label)} tiene llamadas abiertas ahora mismo?` : `Does ${esc(label)} have open calls right now?`;
  const faqA1 = es
    ? (hasCalls ? `Sí — ${calls.length} llamada${calls.length > 1 ? 's' : ''} abierta${calls.length > 1 ? 's' : ''} necesitando ~${hands} manos al ${esc(PRETTY_DATE_ES)}, listadas arriba y actualizadas a diario.` : `No por ahora. No hay llamadas abiertas publicadas al ${esc(PRETTY_DATE_ES)}. Esta página se revisa a diario.`)
    : (hasCalls ? `Yes — ${calls.length} open call${calls.length > 1 ? 's' : ''} needing ~${hands} hands as of ${esc(PRETTY_DATE)}, listed above and updated daily.` : `Not right now. No open calls posted as of ${esc(PRETTY_DATE)}. This page is swept daily.`);
  const faqQ2 = es ? `¿Cuál es la escala de oficial en ${esc(label)}?` : `What's the journeyman scale at ${esc(label)}?`;
  const jwWord = es
    ? (local.trade === 'LINEMAN' ? 'La escala base de lineman oficial' : 'La escala base de oficial')
    : (local.trade === 'LINEMAN' ? 'Journeyman lineman' : (local.trade && local.trade !== 'IBEW' ? 'Journeyman' : 'Inside JW'));
  const faqA2 = local.jw_scale != null
    ? (es
        ? `${jwWord} es ${money(local.jw_scale)}/hr${local.hw != null ? `, más ${money(local.hw)} de salud y bienestar` : ''}.`
        : `${jwWord} base scale is ${money(local.jw_scale)}/hr${local.hw != null ? `, plus ${money(local.hw)} health &amp; welfare` : ''}.`)
    : (es
        ? `La escala aún no está confirmada aquí. Contacta al despacho del local para conocer las tarifas actuales.`
        : `Scale isn't confirmed here yet. Contact the local's dispatch for current rates.`);

  return `<!DOCTYPE html><html lang="${lang}"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
${hrefAlts}
<meta property="og:type" content="website"><meta property="og:site_name" content="TrampHereBro">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${CANON}/share-banner.png">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${CANON}/share-banner.png">
${FAVICON_LINK}
${FONTS}${GA_TAG}
<style>${CSS}</style>
${ldBlocks}
</head><body>
${topbar('', lang, 'locals/' + slug)}
<header><div class="hero-inner">
<div class="crumbs"><a href="${home}">${H.crumbHome}</a> › <a href="${localsHub}">${H.crumbLocals}</a> › ${esc(label)}</div>
<div class="kick"><span class="dot"></span>${H.kick}</div>
<h1 class="lede">${esc(label)} <b>${H.h1b}</b></h1>
<div class="hsub">${hsub}</div>
<div class="hstats">
<div class="hstat"><div class="n accent">${hasCalls ? calls.length : '0'}</div><div class="l">${H.oc}</div></div>
<div class="hstat"><div class="n">${hands}</div><div class="l">${H.hn}</div></div>
${local.jw_scale != null ? `<div class="hstat"><div class="n">${money(local.jw_scale)}</div><div class="l">${H.sc}</div></div>` : ''}
</div>
</div></header>
<main class="wrap">
${vitals ? `<div class="sec-h">${H.vitalsH}</div><div class="vitcard"><div class="vitals">${vitals}</div>${wageUpdated}</div>` : ''}
${contactCard}
${shareBlock}
${callsBlock}
<p class="outlook">${outlook}</p>
<div class="faq">
<h3>${faqQ1}</h3>
<p>${faqA1}</p>
<h3>${faqQ2}</h3>
<p>${faqA2}</p>
</div>
<div class="backbar"><a class="backbtn" href="${home}">${H.back1}</a> &nbsp; <a class="backbtn" href="${localsHub}">${H.back2}</a></div>
</main>
${footer(lang)}
</body></html>`;
}

/* ----------------------------- directory hub ------------------------------ */
function hubPage(rows, lang) {
  lang = lang || 'en';
  const es = lang === 'es';
  const HB = es
    ? { title: 'Todos los Locales del IBEW y UA — Llamadas de Trabajo, Escala Salarial y Directorio de Despacho | TrampHereBro', crumbHome: 'Tablero', crumbLocals: 'Locales', kick: 'Directorio de Locales', h1a: 'Todos los ', h1b: 'Locales', oc: 'LLAMADAS ABIERTAS', al: 'LOCALES ACTIVOS', lt: 'LOCALES MONITOREADOS', ph: 'Busca por número de local, ciudad o estado…', open: 'abiertas', locals: 'locales' }
    : { title: 'All IBEW & UA Locals — Job Calls, Wage Scale & Dispatch Directory | TrampHereBro', crumbHome: 'Board', crumbLocals: 'Locals', kick: 'Local Directory', h1a: 'All ', h1b: 'Locals', oc: 'OPEN CALLS', al: 'ACTIVE LOCALS', lt: 'LOCALS TRACKED', ph: 'Search by local number, city, or state…', open: 'open', locals: 'locals' };
  const home = es ? '/es' : '/';
  const hubUrl = CANON + (es ? '/es/locals' : '/locals');
  const byState = {};
  rows.forEach(r => { (byState[r.local.state] = byState[r.local.state] || []).push(r); });
  const totalCalls = rows.reduce((s, r) => s + r.calls.length, 0);
  const activeLocals = rows.filter(r => r.calls.length > 0).length;

  function stateBlock(st) {
    const list = byState[st].slice().sort((a, b) => (Number(localNumber(a.local.name)) || 1e9) - (Number(localNumber(b.local.name)) || 1e9));
    const oc = list.reduce((s, r) => s + r.calls.length, 0);
    const links = list.map(r => {
      const num = localNumber(r.local.name), slug = slugFor(r.local.name, r.local.id, r.local.trade), cc = r.calls.length;
      const s = `${num || ''} ${(r.local.city || '').toLowerCase()} ${stateName(st).toLowerCase()} ${st.toLowerCase()}`;
      return `<a class="hub-local" href="${es ? '/es' : ''}/locals/${slug}" data-s="${esc(s)} ${(r.local.trade||'ibew').toLowerCase()}"><span class="hl-name">${tradeOf(r.local).name} ${num || r.local.id}${r.local.city ? ' · ' + esc(r.local.city) : ''}</span><span class="hl-cc${cc > 0 ? ' hot' : ''}">${cc > 0 ? cc + ' ' + HB.open : '—'}</span></a>`;
    }).join('');
    return `<div class="hub-state" data-state="${st}"><button class="hub-state-h" onclick="toggleState(this)" aria-expanded="false"><span class="hs-name">${esc(stateName(st))}</span><span class="hs-meta">${oc > 0 ? `<span class="hs-oc">${oc} ${HB.open}</span>` : ''}<span>${list.length} ${list.length > 1 ? HB.locals : (es ? 'local' : 'local')}</span></span><svg class="hs-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></button><div class="hub-state-body"><div class="hub-state-in">${links}</div></div></div>`;
  }

  const byCountry = { 'United States': [], 'Canada': [] };
  Object.keys(byState).forEach(st => { byCountry[CA_PROVINCES.has(st) ? 'Canada' : 'United States'].push(st); });
  const FLAG = { 'United States': '\uD83C\uDDFA\uD83C\uDDF8', 'Canada': '\uD83C\uDDE8\uD83C\uDDE6' };
  const body = ['United States', 'Canada'].filter(c => byCountry[c].length).map(c => {
    const sts = byCountry[c].sort((a, b) => stateName(a).localeCompare(stateName(b)));
    const locN = sts.reduce((s, st) => s + byState[st].length, 0);
    const ocN = sts.reduce((s, st) => s + byState[st].reduce((x, r) => x + r.calls.length, 0), 0);
    return `<div class="hub-country"><div class="hub-country-h"><span class="hc-flag">${FLAG[c]}</span><span class="hc-name">${esc(c)}</span><span class="hc-meta">${ocN > 0 ? `<span class="hc-chip hot">${ocN} ${HB.open}</span>` : ''}<span class="hc-chip">${locN} ${HB.locals}</span></span></div>${sts.map(stateBlock).join('')}</div>`;
  }).join('');

  const title = HB.title;
  const desc = es
    ? `Directorio de ${rows.length} locales del IBEW y UA con conteos de llamadas de trabajo en vivo, escala de oficial e información de contacto para trabajadores viajeros. ${totalCalls} llamadas abiertas en ${activeLocals} locales activos. Actualizado ${PRETTY_DATE_ES}.`
    : `Directory of ${rows.length} IBEW and UA locals with live job-call counts, journeyman scale and contact info for traveling tradesmen. ${totalCalls} open calls across ${activeLocals} active locals. Updated ${PRETTY_DATE}.`;
  return `<!DOCTYPE html><html lang="${lang}"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${hubUrl}">
<link rel="alternate" hreflang="en" href="${CANON}/locals"><link rel="alternate" hreflang="es" href="${CANON}/es/locals"><link rel="alternate" hreflang="x-default" href="${CANON}/locals">
<meta property="og:type" content="website"><meta property="og:site_name" content="TrampHereBro">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${CANON}/locals"><meta property="og:image" content="${CANON}/share-banner.png">
<meta name="twitter:card" content="summary_large_image">
${FAVICON_LINK}
${FONTS}${GA_TAG}
<style>${CSS}</style>
</head><body>
${topbar('', lang, 'locals')}
<header><div class="hero-inner">
<div class="crumbs"><a href="${home}">${HB.crumbHome}</a> › ${HB.crumbLocals}</div>
<div class="kick"><span class="dot"></span>${HB.kick}</div>
<h1 class="lede">${HB.h1a}<b>${HB.h1b}</b></h1>
<div class="hsub">Every local we track. Search or tap a state to see its locals, live call counts, and wage info.</div>
<div class="hstats">
<div class="hstat"><div class="n accent">${totalCalls}</div><div class="l">${HB.oc}</div></div>
<div class="hstat"><div class="n">${activeLocals}</div><div class="l">${HB.al}</div></div>
<div class="hstat"><div class="n">${rows.length}</div><div class="l">${HB.lt}</div></div>
</div>
</div></header>
<main class="wrap">
<input class="hub-search" type="search" placeholder="${HB.ph}" oninput="filterHub(this.value)" aria-label="Search locals">
<div id="hubwrap">${body}</div>
<div class="hub-empty" id="hubEmpty" hidden>No locals match that search.</div>
<div class="backbar" style="margin-top:30px"><a class="backbtn" href="/">← Back to the live board</a></div>
</main>
<script>
function toggleState(btn){var s=btn.parentElement;var open=s.classList.toggle('open');btn.setAttribute('aria-expanded',open);}
function filterHub(q){q=(q||'').trim().toLowerCase();var any=false;
  document.querySelectorAll('#hubwrap .hub-country').forEach(function(rg){var rv=false;
    rg.querySelectorAll('.hub-state').forEach(function(st){var m=0;
      st.querySelectorAll('.hub-local').forEach(function(a){var hit=!q||a.getAttribute('data-s').indexOf(q)>-1;a.style.display=hit?'':'none';if(hit)m++;});
      st.style.display=m?'':'none';if(m){rv=true;any=true;if(q){st.classList.add('open');}else{st.classList.remove('open');}}
    });
    rg.style.display=rv?'':'none';
  });
  document.getElementById('hubEmpty').hidden=any;
}
</script>
${footer(lang)}
</body></html>`;
}

function sitemap(rows) {
  // hreflang alternate links for a translated page key (e.g. 'unionretirement')
  const alts = key => {
    if (!TRANSLATED.has(key)) return '';
    const en = CANON + '/' + key, es = CANON + '/es/' + key;
    return `<xhtml:link rel="alternate" hreflang="en" href="${en}"/><xhtml:link rel="alternate" hreflang="es" href="${es}"/><xhtml:link rel="alternate" hreflang="x-default" href="${en}"/>`;
  };
  const entry = (loc, key) =>
    `  <url><loc>${loc}</loc>${key !== undefined ? alts(key) : ''}<lastmod>${ISO_DATE}</lastmod><changefreq>daily</changefreq></url>`;
  const lines = [];
  CORE_PAGES.forEach(p => lines.push(entry(CANON + '/' + p, p)));
  // Spanish homepage: hand-built entry since '' isn't a normal page key
  const homeAlts = `<xhtml:link rel="alternate" hreflang="en" href="${CANON}/"/><xhtml:link rel="alternate" hreflang="es" href="${CANON}/es"/><xhtml:link rel="alternate" hreflang="x-default" href="${CANON}/"/>`;
  lines.push(`  <url><loc>${CANON}/es</loc>${homeAlts}<lastmod>${ISO_DATE}</lastmod><changefreq>daily</changefreq></url>`);
  // Spanish mirrors of translated core pages get their own sitemap entries
  CORE_PAGES.forEach(p => { if (TRANSLATED.has(p)) lines.push(entry(CANON + '/es/' + p, p)); });
  // locals hub (en + es, reciprocal alternates)
  const hubAlts = `<xhtml:link rel="alternate" hreflang="en" href="${CANON}/locals"/><xhtml:link rel="alternate" hreflang="es" href="${CANON}/es/locals"/><xhtml:link rel="alternate" hreflang="x-default" href="${CANON}/locals"/>`;
  lines.push(`  <url><loc>${CANON}/locals</loc>${hubAlts}<lastmod>${ISO_DATE}</lastmod><changefreq>daily</changefreq></url>`);
  lines.push(`  <url><loc>${CANON}/es/locals</loc>${hubAlts}<lastmod>${ISO_DATE}</lastmod><changefreq>daily</changefreq></url>`);
  // every local page, both languages, each carrying reciprocal alternates
  rows.forEach(r => {
    const s = slugFor(r.local.name, r.local.id, r.local.trade);
    const en = `${CANON}/locals/${s}`, esU = `${CANON}/es/locals/${s}`;
    const a = `<xhtml:link rel="alternate" hreflang="en" href="${en}"/><xhtml:link rel="alternate" hreflang="es" href="${esU}"/><xhtml:link rel="alternate" hreflang="x-default" href="${en}"/>`;
    lines.push(`  <url><loc>${en}</loc>${a}<lastmod>${ISO_DATE}</lastmod><changefreq>daily</changefreq></url>`);
    lines.push(`  <url><loc>${esU}</loc>${a}<lastmod>${ISO_DATE}</lastmod><changefreq>daily</changefreq></url>`);
  });
  const body = lines.join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${body}\n</urlset>\n`;
}

/* -------------------------------- main ------------------------------------ */

/* --------------------- homepage map/board sync ---------------------------- */
// rough state/province centroids — fallback pin if geocoding a new local fails
const STATE_CENTROIDS = {
  AL:[32.8,-86.8],AK:[64.2,-149.5],AZ:[34.3,-111.7],AR:[34.8,-92.4],CA:[37.2,-119.3],
  CO:[39.0,-105.5],CT:[41.6,-72.7],DE:[39.0,-75.5],FL:[28.6,-82.4],GA:[32.6,-83.4],
  HI:[20.3,-156.4],ID:[44.4,-114.6],IL:[40.0,-89.2],IN:[39.9,-86.3],IA:[42.0,-93.5],
  KS:[38.5,-98.4],KY:[37.5,-85.3],LA:[31.0,-92.0],ME:[45.4,-69.2],MD:[39.0,-76.8],
  MA:[42.3,-71.8],MI:[44.3,-85.4],MN:[46.3,-94.3],MS:[32.7,-89.7],MO:[38.4,-92.5],
  MT:[46.9,-110.0],NE:[41.5,-99.8],NV:[39.3,-116.6],NH:[43.7,-71.6],NJ:[40.1,-74.7],
  NM:[34.4,-106.1],NY:[42.9,-75.6],NC:[35.6,-79.4],ND:[47.5,-100.5],OH:[40.3,-82.8],
  OK:[35.6,-97.5],OR:[44.0,-120.5],PA:[40.9,-77.8],RI:[41.7,-71.5],SC:[33.9,-80.9],
  SD:[44.4,-100.2],TN:[35.9,-86.4],TX:[31.5,-99.3],UT:[39.3,-111.7],VT:[44.1,-72.7],
  VA:[37.5,-78.9],WA:[47.4,-120.5],WV:[38.6,-80.6],WI:[44.6,-89.9],WY:[43.0,-107.6],
  DC:[38.9,-77.0],AB:[53.9,-116.6],BC:[53.7,-124.0],MB:[53.8,-98.8],NB:[46.5,-66.4],
  NL:[53.1,-57.7],NS:[45.0,-63.0],ON:[50.0,-85.0],PE:[46.4,-63.2],QC:[52.0,-72.0],
  SK:[54.0,-106.0],YT:[63.0,-135.0],NT:[64.8,-124.8],NU:[70.3,-83.1]
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function geocodeOne(city, state) {
  if (!city && !state) return null;
  const q = encodeURIComponent([city, state, countryOf(state) === 'CA' ? 'Canada' : 'USA'].filter(Boolean).join(', '));
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + q,
      { headers: { 'User-Agent': 'TrampHereBro/1.0 (https://www.trampherebro.com)' } });
    if (!r.ok) return null;
    const j = await r.json();
    if (Array.isArray(j) && j[0]) {
      const la = Number(j[0].lat), lo = Number(j[0].lon);
      if (Number.isFinite(la) && Number.isFinite(lo)) return { lat: +la.toFixed(4), lng: +lo.toFixed(4) };
    }
  } catch (e) { /* offline / rate-limited — fall back */ }
  return null;
}
async function resolveCoords(rows) {
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(COORDS_CACHE, 'utf8')); } catch (e) { cache = {}; }
  const coords = {}; let geocoded = 0, fell = 0;
  for (const r of rows) {
    const id = String(r.local.id);
    const cached = cache[id];
    if (cached && cached.lat != null && cached.lng != null) { coords[id] = { lat: cached.lat, lng: cached.lng }; continue; }
    // new local — geocode it (throttled to respect Nominatim's 1 req/sec policy)
    await sleep(1100);
    let c = await geocodeOne(r.local.city, r.local.state);
    if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) { geocoded++; }
    else { c = null; const ctr = STATE_CENTROIDS[r.local.state]; if (ctr) { c = { lat: ctr[0], lng: ctr[1] }; fell++; } }
    if (c) { coords[id] = c; cache[id] = { lat: c.lat, lng: c.lng, city: r.local.city || '', state: r.local.state || '', name: r.local.name }; }
  }
  try { fs.writeFileSync(COORDS_CACHE, JSON.stringify(cache, null, 0)); } catch (e) {}
  if (geocoded || fell) console.log(`  geocoded ${geocoded} new local(s), ${fell} via state fallback`);
  return coords;
}
/* Build es/index.html from the freshly-synced English homepage.
   Runs AFTER syncHomepageMap so the Spanish board carries live data
   (map locals, stat counts, daily snapshot) rather than a frozen copy. */
function makeSpanishHome() {
  let h;
  try { h = fs.readFileSync(INDEX_HTML, 'utf8'); } catch (e) { return false; }

  // --- head: lang, canonical, hreflang, title/description ---
  h = h.replace('<html lang="en">', '<html lang="es">');
  h = h.replace(
    '<title>TrampHereBro — Live Union Job Calls: IBEW, Lineman & UA</title>',
    '<title>TrampHereBro — Ofertas de Trabajo Sindical en Vivo: IBEW, Lineman y UA</title>'
  );
  h = h.replace(
    /<meta name="description" content="[^"]*"/,
    '<meta name="description" content="Ofertas de trabajo sindical en vivo de los salones sindicales de todo el país — llamadas abiertas, manos necesarias, escala de pago y números de libro. Gratis y actualizado a diario. Hecho por un viajero, para viajeros."'
  );
  h = h.replace(
    /<link rel="canonical" href="[^"]*"\s*\/?>/,
    '<link rel="canonical" href="' + CANON + '/es"><link rel="alternate" hreflang="en" href="' + CANON + '/"><link rel="alternate" hreflang="es" href="' + CANON + '/es"><link rel="alternate" hreflang="x-default" href="' + CANON + '/">'
  );
  h = h.replace(/<meta property="og:url" content="[^"]*"/, '<meta property="og:url" content="' + CANON + '/es"');

  // --- nav: labels, localized hrefs, EN toggle pill ---
  const esNav = '<nav class="nav"><a href="/es" class="on">Tablero de Trabajo</a>' +
    '<a href="/snapshot">Reporte Diario</a>' +
    '<a href="/es/calculator">Calculadora de Pago</a>' +
    '<a href="/es/resources">Recursos</a>' +
    '<a href="/es/unionretirement">Jubilación Sindical</a>' +
    '<span class="navdd"><a href="/es/unionhistory">Historia<svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg></a>' +
    '<span class="ddmenu"><a href="/es/unionhistory">Historia Sindical</a><a href="/es/ibewhistory">Historia del IBEW</a><a href="/es/uahistory">Historia del UA</a></span></span>' +
    '<a href="/es/contact">Contacto</a>' +
    '<a href="/es/jnctn" style="background:var(--orange);color:#fff;padding:6px 13px;border-radius:8px;font-weight:700;white-space:nowrap">Únete a JNCTN</a></nav>';
  h = h.replace(/<nav class="nav">[\s\S]*?<\/nav>/, esNav);
  h = placeLangTog(h, 'home', 'es');
  // brand + logo link back to the Spanish home
  h = h.replace('<a href="/" aria-label="TrampHereBro home"', '<a href="/es" aria-label="TrampHereBro inicio"');

  // --- hero ---
  h = h.replace('>Live · Union Labor Local Dispatch Nationwide<', '>En Vivo · Despacho Sindical de Locales a Nivel Nacional<');
  h = h.replace('Find the work <b>before</b> you call the hall.', 'Encuentra el trabajo <b>antes</b> de llamar al salón.');
  h = h.replace('>Real-time union job calls, scale, and book numbers<', '>Ofertas de trabajo sindical, escala y números de libro en tiempo real<');

  // --- stat labels (values are injected live; only the labels change) ---
  h = h.replace('<div class="l">Open calls</div>', '<div class="l">Llamadas abiertas</div>');
  h = h.replace('<div class="l">Hands needed</div>', '<div class="l">Manos necesarias</div>');
  h = h.replace('<div class="l">Active locals</div>', '<div class="l">Locales activos</div>');
  h = h.replace('<div class="l">Locals tracked</div>', '<div class="l">Locales monitoreados</div>');

  // --- trust line + trade chips + CTAs ---
  h = h.replace(
    "Updated daily at 5:30 PM EST. Always confirm with the local. <span style=\"color:var(--orange);font-weight:700\">Let's get trampin.</span>",
    'Actualizado a diario a las 5:30 PM EST. Siempre confirma con el local. <span style="color:var(--orange);font-weight:700">A viajar.</span>'
  );
  h = h.replace('data-trade="IBEW">IBEW Indoor<', 'data-trade="IBEW">IBEW Interior<');
  h = h.replace('data-trade="UA">UA Plumbers<', 'data-trade="UA">UA Plomeros<');
  h = h.replace('<div class="trade soon">Ironworkers <span>SOON</span></div>', '<div class="trade soon">Ironworkers <span>PRONTO</span></div>');
  h = h.replace('>Browse the board <svg', '>Explorar el tablero <svg');
  h = h.replace('>Trampin Snapshot <svg', '>Reporte Trampin <svg');

  // --- board controls ---
  h = h.replace('placeholder="Search local, city, contractor, or data center"', 'placeholder="Busca local, ciudad, contratista o centro de datos"');
  h = h.replace('data-f="all">All work<', 'data-f="all">Todo el trabajo<');
  h = h.replace('>Top Trampin Spots in current need<', '>Mejores Lugares para Viajar con Necesidad Actual<');
  h = h.replace('>Hotspots <span class="sub-c">locals with 50+ open calls</span>', '>Puntos Calientes <span class="sub-c">locales con más de 50 llamadas abiertas</span>');
  h = h.replace('>Browse locals <span class="sub-c" id="browse-c"></span>', '>Explorar locales <span class="sub-c" id="browse-c"></span>');
  h = h.replace('>View all locals →<', '>Ver todos los locales →<');
  h = h.replace('data-c="United States">USA<', 'data-c="United States">EE.UU.<');
  h = h.replace('data-c="Canada">Canada<', 'data-c="Canada">Canadá<');
  h = h.replace('>Explore locals on the map <span class="sub-c">tap a pin for calls, scale &amp; contact</span>', '>Explora los locales en el mapa <span class="sub-c">toca un pin para ver llamadas, escala y contacto</span>');
  h = h.replace('>IBEW — open calls<', '>IBEW — llamadas abiertas<');
  h = h.replace('>IBEW — tracked<', '>IBEW — monitoreados<');

  // --- snapshot section chrome (the daily prose itself stays English: it is live AI-written copy) ---
  h = h.replace(/>Today's Trampin Snapshot</g, '>Reporte Trampin de Hoy<');
  h = h.replace('>See the full daily update →<', '>Ver el reporte diario completo →<');

  // --- footer ---
  h = h.replace('The Union Job Board', 'El Tablero de Trabajo Sindical');
  h = h.replace(
    'TrampHereBro is an independent information platform. We have no affiliation with any union, labor organization, government entity, or industry group. All information is provided for educational purposes only.',
    'TrampHereBro es una plataforma de información independiente. No tenemos afiliación con ningún sindicato, organización laboral, entidad gubernamental o grupo industrial. Toda la información se proporciona únicamente con fines educativos.'
  );
  h = h.replace('Proudly made by Noah "<b>Spanky The Sparky</b>" — IBEW Journeyman', 'Hecho con orgullo por Noah "<b>Spanky The Sparky</b>" — Oficial del IBEW');
  h = h.replace('All rights reserved.', 'Todos los derechos reservados.');

  const ES_DIR = path.join(SITE_DIR, 'es');
  if (!fs.existsSync(ES_DIR)) fs.mkdirSync(ES_DIR, { recursive: true });
  fs.writeFileSync(path.join(ES_DIR, 'index.html'), h);
  return true;
}

/* ---- hand-authored static pages (index, resources, jnctn, contact) ----
   These files aren't generated by a page function, so we build their Spanish
   twins FROM the English source on every build. Edit the English file and the
   Spanish one follows automatically on the next run. */

// These pages carry their OWN inline CSS, so the toggle styles must be injected.
const LANGTOG_CSS = `<style id="langtog-css">
.topbar .inner{gap:12px}
.topbar .brand,.topbar .inner>a:first-child{order:1}
.topbar .nav{order:2;margin-left:auto;gap:17px}
.topbar .nav a{white-space:nowrap}
.langtog{order:3;display:inline-flex;align-items:stretch;border:1.5px solid var(--line,#e2e8f0);border-radius:8px;overflow:hidden;flex-shrink:0;line-height:1}
.langtog a{display:flex;align-items:center;padding:7px 10px;font-size:12.5px;font-weight:700;color:var(--slate,#64748b);text-decoration:none;letter-spacing:.03em;background:#fff;transition:background .15s,color .15s}
.langtog a+a{border-left:1.5px solid var(--line,#e2e8f0)}
.langtog a.on{background:var(--orange,#FF6B00);color:#fff}
.langtog a:not(.on):hover{background:rgba(7,37,84,.06);color:var(--navy,#072554)}
.topbar .navtoggle{order:4}
@media(max-width:1120px) and (min-width:641px){.topbar .inner{padding-left:16px;padding-right:16px}.topbar .nav{gap:13px}.topbar .nav a{font-size:13px}}
@media(max-width:640px){
.langtog{margin-left:auto;order:3}.topbar .navtoggle{margin-left:0;order:4}.topbar .nav{margin-left:0}.nav .langtog{display:none}
.navdd>a{justify-content:space-between}
.navdd .caret{display:inline-block!important;width:12px;height:12px;flex-shrink:0;transition:transform .2s}
.navdd.open>a .caret{transform:rotate(180deg)}
.navdd .ddmenu{display:none!important}
.navdd.open .ddmenu{display:block!important}
}
</style>`;

/* Mobile: History starts collapsed and expands on tap instead of navigating. */
const NAV_JS_STATIC = `<script id="nav-dd-js">(function(){function w(){return window.matchMedia('(max-width:640px)').matches;}
document.addEventListener('click',function(e){var a=e.target.closest?e.target.closest('.navdd>a'):null;if(!a||!w())return;
e.preventDefault();a.parentNode.classList.toggle('open');},false);})();<\/script>`;

// Segmented EN|ES control for the static pages
function langTogHtml(key, lang) {
  const enHref = key === 'home' ? '/' : '/' + key;
  const esHref = key === 'home' ? '/es' : '/es/' + key;
  return `<div class="langtog" role="group" aria-label="Language / Idioma">`
    + `<a href="${enHref}" hreflang="en"${lang === 'en' ? ' class="on" aria-current="true"' : ''} aria-label="English">EN</a>`
    + `<a href="${esHref}" hreflang="es"${lang === 'es' ? ' class="on" aria-current="true"' : ''} aria-label="Español">ES</a>`
    + `</div>`;
}

// Strip any previously-injected pill that lived INSIDE the nav, plus old css block
function stripOldToggle(html) {
  return html
    .replace(/<a href="\/(es\/)?[a-z-]*"\s+hreflang="(es|en)"[^>]*style="display:inline-flex;align-items:center;justify-content:center;min-width:36px[^"]*">(ES|EN)<\/a>/g, '')
    .replace(/<div class="langtog"[\s\S]*?<\/div>/g, '')
    .replace(/<style id="langtog-css">[\s\S]*?<\/style>/g, '')
    .replace(/<script id="nav-dd-js">[\s\S]*?<\/script>/g, '');
}

// Place the toggle as a SIBLING of <nav> (never inside it) + inject its CSS.
function placeLangTog(html, key, lang) {
  let o = stripOldToggle(html);
  if (!o.includes('id="langtog-css"')) o = o.replace('</head>', LANGTOG_CSS + '</head>');
  if (!o.includes('id="nav-dd-js"')) o = o.replace('</body>', NAV_JS_STATIC + '</body>');
  const tog = langTogHtml(key, lang);
  // insert before the hamburger if there is one, otherwise before <nav>
  if (/<button class="navtoggle"/.test(o)) o = o.replace(/<button class="navtoggle"/, tog + '<button class="navtoggle"');
  else o = o.replace(/<nav class="nav">/, tog + '<nav class="nav">');
  return o;
}

// Spanish nav for the static pages (no toggle inside — it's a sibling now)
function esStaticNav(activeKey) {
  const on = k => activeKey === k ? ' class="on"' : '';
  return '<nav class="nav"><a href="/es"' + on('home') + '>Tablero de Trabajo</a>' +
    '<a href="/snapshot">Reporte Diario</a>' +
    '<a href="/es/calculator"' + on('calculator') + '>Calculadora de Pago</a>' +
    '<a href="/es/resources"' + on('resources') + '>Recursos</a>' +
    '<a href="/es/contact"' + on('contact') + '>Contacto</a>' +
    '<a href="/es/jnctn" style="background:var(--orange);color:#fff;padding:6px 13px;border-radius:8px;font-weight:700;white-space:nowrap">Únete a JNCTN</a></nav>';
}

// Keep the English original's hreflang + toggle current (idempotent every build)
function addEnglishToggle(html, key) {
  let o = html;
  if (!o.includes('hreflang="es" href=')) {
    const enU = key === 'home' ? CANON + '/' : `${CANON}/${key}`;
    const esU = key === 'home' ? CANON + '/es' : `${CANON}/es/${key}`;
    const tags = `<link rel="alternate" hreflang="en" href="${enU}"><link rel="alternate" hreflang="es" href="${esU}"><link rel="alternate" hreflang="x-default" href="${enU}">`;
    o = o.replace(/(<link rel="canonical" href="[^"]*"\s*\/?>)/, '$1' + tags);
  }
  return placeLangTog(o, key, 'en');
}

function makeSpanishStatic(key, pairs, meta) {
  const file = path.join(SITE_DIR, key + '.html');
  let h;
  try { h = fs.readFileSync(file, 'utf8'); } catch (e) { return false; }

  // keep the English original's toggle + hreflang current
  const enOut = addEnglishToggle(h, key);
  if (enOut !== h) { fs.writeFileSync(file, enOut); }
  h = enOut;

  // now build the Spanish twin
  h = h.replace('<html lang="en">', '<html lang="es">');
  h = h.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${CANON}/es/${key}">`);
  h = h.replace(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${CANON}/es/${key}"`);
  h = h.replace(/<nav class="nav">[\s\S]*?<\/nav>/, esStaticNav(key));
  h = placeLangTog(h, key, 'es');
  h = h.replace('<a href="/" aria-label="TrampHereBro home"', '<a href="/es" aria-label="TrampHereBro inicio"');

  // metadata lives in FOUR places: <title>, og:title, twitter:title, and JSON-LD.
  if (meta) {
    if (meta.titleEn && meta.titleEs) h = h.split(meta.titleEn).join(meta.titleEs);
    if (meta.schemaNameEn && meta.schemaNameEs) h = h.split(meta.schemaNameEn).join(meta.schemaNameEs);
    if (meta.descEn && meta.descEs) h = h.split(meta.descEn).join(meta.descEs);
  }

  // shared chrome
  h = h.replace('>Live · updated daily<', '>En vivo · actualizado a diario<');
  h = h.replace('The Union Job Board', 'El Tablero de Trabajo Sindical');
  h = h.replace('All rights reserved.', 'Todos los derechos reservados.');
  h = h.replace('Proudly made by Noah "<b>Spanky The Sparky</b>" — IBEW Journeyman', 'Hecho con orgullo por Noah "<b>Spanky The Sparky</b>" — Oficial del IBEW');
  // page-specific strings
  for (const [from, to] of pairs) h = h.split(from).join(to);

  const ES_DIR = path.join(SITE_DIR, 'es');
  if (!fs.existsSync(ES_DIR)) fs.mkdirSync(ES_DIR, { recursive: true });
  fs.writeFileSync(path.join(ES_DIR, key + '.html'), h);
  return true;
}

const META_RESOURCES = {
  titleEn: 'Resources for Traveling Union Electricians | TrampHereBro',
  titleEs: 'Recursos para Electricistas Sindicales Viajeros | TrampHereBro',
  schemaNameEn: 'Resources for Traveling Union Tradespeople',
  schemaNameEs: 'Recursos para Trabajadores Sindicales Viajeros',
  descEn: 'Tools for the traveling brotherhood — find a union local, look up journeyman pay scales, chase apprenticeships, and stay plugged into trades news. Union Pathways, Union Pay Scales &amp; Spanky the Sparky.',
  descEs: 'Herramientas para la hermandad viajera — encuentra un local sindical, consulta las escalas de pago de oficial, busca aprendizajes y mantente al tanto de las noticias de los oficios. Union Pathways, Union Pay Scales y Spanky the Sparky.'
};
const META_JNCTN = {
  titleEn: 'Join JNCTN — Digital Trade Credentials | TrampHereBro',
  titleEs: 'Únete a JNCTN — Credenciales Digitales del Oficio | TrampHereBro',
  schemaNameEn: 'Join JNCTN — Digital Trade Credentials',
  schemaNameEs: 'Únete a JNCTN — Credenciales Digitales del Oficio',
  descEn: 'JNCTN is a secure digital wallet for your trade credentials — OSHA, licenses, training, and medical cards, verified and ready to share. Show up job-ready at every call. Free for workers.',
  descEs: 'JNCTN es una cartera digital segura para tus credenciales del oficio — OSHA, licencias, capacitación y tarjetas médicas, verificadas y listas para compartir. Preséntate listo para trabajar en cada llamada. Gratis para los trabajadores.'
};

const ES_RESOURCES = [
  ['>Resources for the road<', '>Recursos para el camino<'],
  ['The tools every traveling hand needs — find a local, check the scale, chase down apprenticeships, and stay plugged into what’s moving in the trades.',
   'Las herramientas que todo trabajador viajero necesita — encuentra un local, revisa la escala, busca aprendizajes y mantente al tanto de lo que se mueve en los oficios.'],
  ['<span class="rvisit">Visit <svg', '<span class="rvisit">Visitar <svg'],
  ['Everything union trades in one place. Find a local anywhere in the country, explore apprenticeship and career paths, understand your benefits, and dig into the history of the labor movement — across IBEW, plumbers, ironworkers, operators, carpenters and more.',
   'Todo sobre los oficios sindicales en un solo lugar. Encuentra un local en cualquier parte del país, explora los caminos de aprendizaje y carrera, entiende tus beneficios, y profundiza en la historia del movimiento obrero — del IBEW, plomeros, ironworkers, operadores, carpinteros y más.'],
  ['>Find a local<', '>Encuentra un local<'],
  ['>Apprenticeships<', '>Aprendizajes<'],
  ['>Benefits<', '>Beneficios<'],
  ['>Trade history<', '>Historia del oficio<'],
  ['Trades content built for the field. The Spark the Trade podcast, straight-talk coverage of labor news, the data-center boom, organizing, and what’s actually happening on the job — from a journeyman who’s been on the tools.',
   'Contenido de los oficios hecho para el campo. El podcast Spark the Trade, cobertura directa de noticias laborales, el auge de los centros de datos, la organización sindical, y lo que realmente pasa en el trabajo — de un oficial que ha estado con las herramientas en la mano.'],
  ['>Podcast<', '>Podcast<'],
  ['>Labor news<', '>Noticias laborales<'],
  ['>Data centers<', '>Centros de datos<'],
  ['Know your worth before you take the call. Look up journeyman and apprentice pay scales by trade and local across the country — electricians, linemen, telecom and more — so you can compare the check before you travel.',
   'Conoce tu valor antes de aceptar la llamada. Consulta las escalas de pago de oficial y aprendiz por oficio y local en todo el país — electricistas, linemen, telecom y más — para que compares el cheque antes de viajar.'],
  ['>Wage lookup<', '>Consulta de salarios<'],
  ['>By local<', '>Por local<'],
  ['>All trades<', '>Todos los oficios<'],
];

const ES_JNCTN = [
  ['Official partner · TrampHereBro × JNCTN', 'Socio oficial · TrampHereBro × JNCTN'],
  ['>Your credentials,<', '>Tus credenciales,<'],
  ['>verified<', '>verificadas<'],
  ['and ready — wherever the work takes you.', 'y listas — dondequiera que te lleve el trabajo.'],
  ['TrampHereBro gets you to the call. JNCTN gets you on the job. Carry your OSHA, licenses, training, and medical cards in one secure digital wallet, and prove you’re work-ready in seconds — no folder of dog-eared paper cards required.',
   'TrampHereBro te lleva a la llamada. JNCTN te pone en el trabajo. Lleva tu OSHA, licencias, capacitación y tarjetas médicas en una sola cartera digital segura, y demuestra que estás listo para trabajar en segundos — sin necesidad de una carpeta de tarjetas de papel maltratadas.'],
  ['Free to download · iOS &amp; Android · No cost to workers', 'Descarga gratuita · iOS y Android · Sin costo para los trabajadores'],
  ['>What is JNCTN?<', '>¿Qué es JNCTN?<'],
  ['JNCTN (“junction”) is a secure, cloud-based platform for creating, managing, and verifying digital credentials. Founded in 2016 and built on the global W3C Verifiable Credentials standard, it lets workers own their qualifications in a personal digital wallet and share them — on their terms — with contractors, union halls, and utilities. It’s already trusted across the energy industry in the U.S. and New Zealand, and it’s a natural fit for the traveling brotherhood.',
   'JNCTN (“junction”, que significa empalme) es una plataforma segura, basada en la nube, para crear, administrar y verificar credenciales digitales. Fundada en 2016 y construida sobre el estándar global W3C de Credenciales Verificables, permite que los trabajadores sean dueños de sus calificaciones en una cartera digital personal y las compartan — bajo sus propios términos — con contratistas, salones sindicales y compañías de servicios públicos. Ya es de confianza en toda la industria energética en EE.UU. y Nueva Zelanda, y encaja de manera natural con la hermandad viajera.'],
  ['>Why it matters for tramps<', '>Por qué importa para los viajeros<'],
  ['>Own your data<', '>Sé dueño de tus datos<'],
  ['Your credentials live in your wallet. You decide what to share and who sees it — consent-based, every single time.',
   'Tus credenciales viven en tu cartera. Tú decides qué compartir y quién lo ve — basado en tu consentimiento, cada vez.'],
  ['>Verified on the spot<', '>Verificadas al instante<'],
  ['Halls and contractors confirm your quals instantly. Less time in the office, faster onto the job.',
   'Los salones y contratistas confirman tus calificaciones al instante. Menos tiempo en la oficina, más rápido al trabajo.'],
  ['>No more paper<', '>Se acabó el papeleo<'],
  ['OSHA, licenses, med cards, training certs — all in your phone. Nothing to lose, forget, or dig for.',
   'OSHA, licencias, tarjetas médicas, certificados de capacitación — todo en tu teléfono. Nada que perder, olvidar o andar buscando.'],
  ['>Works offline<', '>Funciona sin conexión<'],
  ['Peer-to-peer validation means you can prove credentials even with no signal on a remote site.',
   'La validación entre dispositivos significa que puedes comprobar tus credenciales incluso sin señal en un sitio remoto.'],
  ['>Bank-grade security<', '>Seguridad de nivel bancario<'],
  ['Industry-standard cryptography on the W3C credential standard. Your data is protected and tamper-proof.',
   'Criptografía estándar de la industria sobre el estándar de credenciales W3C. Tus datos están protegidos y son a prueba de manipulación.'],
  ['>Built for the trades<', '>Hecho para los oficios<'],
  ['Designed with unions and training providers for high-risk, regulated work — exactly where you operate.',
   'Diseñado junto con sindicatos y centros de capacitación para trabajo regulado de alto riesgo — exactamente donde tú operas.'],
  ['>How it works<', '>Cómo funciona<'],
  ['>Download &amp; build your wallet<', '>Descarga y arma tu cartera<'],
  ['Grab the free app, create your account, and add your credentials — or have your local or training provider issue them straight to you.',
   'Descarga la app gratuita, crea tu cuenta y agrega tus credenciales — o pide que tu local o centro de capacitación te las emita directamente.'],
  ['>Get verified<', '>Hazte verificar<'],
  ['Issuers confirm your credentials, turning them into trusted, tamper-proof digital records employers can rely on.',
   'Los emisores confirman tus credenciales, convirtiéndolas en registros digitales confiables y a prueba de manipulación en los que los empleadores pueden confiar.'],
  ['>Share &amp; get to work<', '>Comparte y ponte a trabajar<'],
  ['Roll into a new hall, share exactly what’s needed with a tap or a secure link, and get dispatched faster.',
   'Llega a un salón nuevo, comparte exactamente lo necesario con un toque o un enlace seguro, y consigue despacho más rápido.'],
  ['Free for workers. Get job-ready today.', 'Gratis para los trabajadores. Ponte listo para trabajar hoy.'],
  ['>Download on the<', '>Descárgala en el<'],
  ['>Get it on<', '>Consíguela en<'],
  ['Visit jnctn-inc.com →', 'Visita jnctn-inc.com →'],
];

const META_CONTACT = {
  titleEn: 'Contact TrampHereBro — Add a Hall, Partnerships & More',
  titleEs: 'Contacta a TrampHereBro — Agrega un Salón, Alianzas y Más',
  schemaNameEn: 'Contact TrampHereBro',
  schemaNameEs: 'Contacta a TrampHereBro',
  descEn: 'Get in touch with TrampHereBro. Add a union hall with public job calls, report a site issue, discuss a partnership, or send a general inquiry.',
  descEs: 'Ponte en contacto con TrampHereBro. Agrega un salón sindical con llamadas de trabajo públicas, reporta un problema del sitio, habla de una alianza, o envía una consulta general.'
};

const ES_CONTACT = [
  ['Add a hall, report a correction, or reach out about partnerships.', 'Agrega un salón, reporta una corrección, o comunícate sobre alianzas.'],
  ['<div class="kick"><span class="dot"></span>Contact</div>', '<div class="kick"><span class="dot"></span>Contacto</div>'],
  ['>Let’s get<', '>Vamos a<'],
  ['>trampin’<', '>viajar<'],
  ['A hall to add, a busted link, a partnership, or a question — drop us a line. Every message gets read.',
   'Un salón que agregar, un enlace roto, una alianza, o una pregunta — escríbenos. Cada mensaje se lee.'],
  // form fields
  ['>Name<', '>Nombre<'],
  ['>Email<', '>Correo<'],
  ['>Subject<', '>Asunto<'],
  ['>Choose a topic…<', '>Elige un tema…<'],
  ['>Add a Hall<', '>Agregar un Salón<'],
  ['>Issues With Site<', '>Problemas con el Sitio<'],
  ['>Partnership<', '>Alianza<'],
  ['>General Inquiry<', '>Consulta General<'],
  ['>Message<', '>Mensaje<'],
  ['<button type="submit" class="cd-submit">Send message <svg', '<button type="submit" class="cd-submit">Enviar mensaje <svg'],
  // form JS feedback — a Spanish visitor must not get English confirmations
  ["'Sending\\u2026'", "'Enviando\\u2026'"],
  ["'Sending…'", "'Enviando…'"],
  ["'Thanks \\u2014 your message is on its way.'", "'Gracias \\u2014 tu mensaje va en camino.'"],
  ['Thanks — your message is on its way.', 'Gracias — tu mensaje va en camino.'],
  ["'Something went wrong. Try again or email directly.'", "'Algo salió mal. Intenta de nuevo o escríbenos directamente por correo.'"],
  ['Something went wrong. Try again or email directly.', 'Algo salió mal. Intenta de nuevo o escríbenos directamente por correo.'],
  ["'Network error. Please try again.'", "'Error de red. Por favor intenta de nuevo.'"],
  ['Network error. Please try again.', 'Error de red. Por favor intenta de nuevo.'],
  // cards
  ['>Add a hall<', '>Agregar un salón<'],
  ['Send a public dispatch link and we’ll add the local.', 'Envía un enlace público de despacho y agregamos el local.'],
  ['>Partnerships<', '>Alianzas<'],
  ['Building for the trades? We’re open to the right partners.', '¿Construyes para los oficios? Estamos abiertos a los socios correctos.'],
  ['>Follow along<', '>Síguenos<'],
  ['"Updated daily"', '"Actualizado a diario"'],
];

function syncHomepageMap(rows, coords, snapText, snapTextLine) {
  // Ensure the English homepage advertises its Spanish twin (idempotent: safe on every build)
  const ensureEnglishHomeToggle = html => {
    let o = html;
    if (!o.includes('hreflang="es" href=')) {
      const tags = `<link rel="alternate" hreflang="en" href="${CANON}/"><link rel="alternate" hreflang="es" href="${CANON}/es"><link rel="alternate" hreflang="x-default" href="${CANON}/">`;
      o = o.replace(/(<link rel="canonical" href="[^"]*"\s*\/?>)/, '$1' + tags);
    }
    return placeLangTog(o, 'home', 'en');
  };
  return syncHomepageMapInner(rows, coords, snapText, snapTextLine, ensureEnglishHomeToggle);
}

function syncHomepageMapInner(rows, coords, snapText, snapTextLine, postFix) {
  let html;
  try { html = fs.readFileSync(INDEX_HTML, 'utf8'); } catch (e) { return false; }
  if (!html.includes('/*MAPLOCALS_START*/') || !html.includes('/*MAPLOCALS_END*/')) return false;
  const arr = rows
    .filter(r => { const c = coords[String(r.local.id)]; return c && Number.isFinite(c.lat) && Number.isFinite(c.lng); })
    .map(r => ({
      id: r.local.id, name: r.local.name,
      city: r.local.city || '', state: r.local.state || '',
      lat: coords[String(r.local.id)].lat, lng: coords[String(r.local.id)].lng,
      trade: r.local.trade || 'IBEW', active: false
    }));
  const block = '/*MAPLOCALS_START*/\nconst MAPLOCALS = ' + JSON.stringify(arr) + ';\n/*MAPLOCALS_END*/';
  let out = html.replace(/\/\*MAPLOCALS_START\*\/[\s\S]*?\/\*MAPLOCALS_END\*\//, block);

  // Bake live stats into raw HTML so crawlers/AI see real numbers (JS still updates them live)
  const openCalls = rows.reduce((s, r) => s + r.calls.length, 0);
  const hands = rows.reduce((s, r) => s + r.calls.reduce((x, c) => x + (Number(c.num_needed) || 0), 0), 0);
  const activeLocals = rows.filter(r => r.calls.length > 0).length;
  const setStat = (id, val) => { out = out.replace(new RegExp('(id="' + id + '">)[^<]*'), '$1' + val); };
  setStat('s-calls', openCalls);
  setStat('s-pos', hands);
  setStat('s-active', activeLocals);
  setStat('s-tracked', arr.length);

  // Bake the daily snapshot onto the homepage (server-rendered, crawlable)
  if (snapText && out.includes('<!--HS_START-->')) {
    const snaps = { IBEW: snapshotMd(snapText) };
    const kicks = { IBEW: "Today's Trampin Snapshot" };
    if (snapTextLine) { snaps.LINEMAN = snapshotMd(snapTextLine); kicks.LINEMAN = "Today's Trampin Snapshot"; }
    const safeJson = o => JSON.stringify(o).replace(/<\/script/gi, '<\\/script');
    const snapHtml = `<section class="homesnap" id="homesnap"><div class="homesnap-inner"><div class="hs-kick"><span class="hs-dot"></span><span id="hs-kick-label">Today's Trampin Snapshot</span> · ${esc(PRETTY_DATE)}</div><div class="hs-body" id="hs-body">${snapshotMd(snapText)}</div><button class="hs-toggle" onclick="document.getElementById('homesnap').classList.toggle('collapsed')"></button><a class="hs-more" href="/snapshot">See the full daily update →</a></div></section><script>window.SNAPS=${safeJson(snaps)};window.SNAP_KICK=${safeJson(kicks)};</script>`;
    out = out.replace(/<!--HS_START-->[\s\S]*?<!--HS_END-->/, '<!--HS_START-->' + snapHtml + '<!--HS_END-->');
  }

  if (typeof postFix === 'function') out = postFix(out);
  fs.writeFileSync(INDEX_HTML, out);
  return arr.length;
}

/* -------------------- AI Work Outlook (cached) ---------------------------- */
function callsHash(calls) {
  const key = calls.map(c => [c.contractor, c.num_needed, c.call_type, c.job_name, c.location, c.scale, c.per_diem].join('|')).sort().join('~');
  let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return String(h);
}
async function generateOutlook(local, calls) {
  if (!ANTHROPIC_KEY) return null;
  const n = localNumber(local.name);
  const label = 'IBEW Local ' + (n || local.id);
  const hands = calls.reduce((s, c) => s + (Number(c.num_needed) || 0), 0);
  const lines = calls.map(c => `- ${c.contractor || 'contractor'} needs ${c.num_needed || '?'} ${c.call_type || 'JW'} at ${[c.job_name, c.location].filter(Boolean).join(' ') || 'a project'}${c.scale ? ' ($' + c.scale + '/hr)' : ''}${c.per_diem ? ', per diem ' + c.per_diem : ''}${c.notes ? ' — ' + String(c.notes).replace(/\s+/g, ' ').slice(0, 80) : ''}`).join('\n');
  const prompt = `Write a single-sentence "work outlook" for a traveling IBEW inside wireman looking at the open job calls at ${label}. There are ${calls.length} open calls needing about ${hands} hands.\n\nCalls:\n${lines}\n\nWrite ONE direct sentence (max 30 words) a fellow tradesman would find useful: total calls and hands, plus the dominant type of work (data center, industrial, hospital, commercial, etc.) inferred from the contractors and job names. No preamble, no quotation marks — just the sentence.`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: OUTLOOK_MODEL, max_tokens: 120, messages: [{ role: 'user', content: prompt }] })
    });
    if (!r.ok) { console.log('  outlook API ' + r.status + ' for ' + label); return null; }
    const j = await r.json();
    const txt = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
    return txt ? txt.replace(/^["']|["']$/g, '') : null;
  } catch (e) { return null; }
}


/* -------------------- Paycheck Calculator page -------------------------- */
function calculatorPage(rows, lang) {
  lang = lang || 'en';
  const es = lang === 'es';
  const K = es
    ? { crumb:'Calculadora de Pago', kick:'Calculadora de Pago', h1a:"¿Cuánto ", h1b:'realmente', h1c:' paga?',
        hsub:'Ajusta tus horas, horas extra y viáticos, y mira lo que gana cada local del IBEW en ese escenario — ordenado, para que sepas dónde está el dinero. Elige tu local de casa para ver cuánto más ganarías en el camino.',
        hours:'Horas / semana:', weeks:'Semanas trabajadas', otRate:'Tasa de horas extra',
        ot15:'1.5&times; (tiempo y medio)', ot2:'2&times; (tiempo doble)', perDiem:'Viáticos ($/día)',
        homeLocal:'Tu local de casa', pickPh:'Escribe un número de local o ciudad…', clear:'Limpiar',
        trade:'Oficio', ibew:'IBEW Interior', lineman:'IBEW Lineman', rankBy:'Ordenar por',
        totalPkg:'Paquete total', takeHome:'Salario neto', filterPh:'Filtra por número de local, ciudad o estado…',
        note:'<b>Salario neto</b> = horas regulares a escala + horas sobre 40 a tu tasa de horas extra elegida + viáticos (×7 días). <b>Beneficios</b> = el paquete completo (Salud y Bienestar + pensiones + NEBF) pagado por cada hora trabajada. <b>Paquete total</b> = ambos combinados. Las cifras son estimados basados en datos publicados de escala y paquete (vía unionpayscales.com); siempre confirma los términos exactos con el salón. El ajuste por costo de vida viene pronto.' }
    : { crumb:'Pay Calculator', kick:'Paycheck Calculator', h1a:"What's it ", h1b:'really', h1c:' pay?',
        hsub:'Set your hours, overtime and per diem, then see what every IBEW local grosses for that scenario — ranked, so you know where the money is. Pick your home local to see how much more you\u2019d make on the road.',
        hours:'Hours / week:', weeks:'Weeks worked', otRate:'Overtime rate',
        ot15:'1.5&times; (time &amp; a half)', ot2:'2&times; (double time)', perDiem:'Per diem ($/day)',
        homeLocal:'Your home local', pickPh:'Type a local number or city…', clear:'Clear',
        trade:'Trade', ibew:'IBEW Indoor', lineman:'IBEW Lineman', rankBy:'Rank by',
        totalPkg:'Total package', takeHome:'Take-home wages', filterPh:'Filter by local number, city, or state…',
        note:'<b>Take-home wages</b> = regular hours at scale + hours over 40 at your chosen OT rate + per diem (\u00d77 days). <b>Benefits</b> = the full package (H&amp;W + pensions + NEBF) paid flat on every hour worked. <b>Total package</b> = both combined. Figures are estimates from published scale &amp; package data (via unionpayscales.com); always confirm exact terms with the hall. Cost-of-living adjustment coming soon.' };
  // labels the client-side JS reads
  const JSL = es
    ? { hw:'Salud y Bienestar', pd:'Pensión Definida', pdc:'Anualidad / Pensión DC', nebf:'NEBF', k401:'401(k)', vac:'Vacaciones',
        other:'Otras prestaciones (capacitación, etc.)', yourPick:'tu selección', hrsWk:'hrs/semana', wks:'semanas', hrsYr:'horas al año',
        wagesSec:'Salario (a tu cheque)', regular:'Regular', overtime:'Horas extra', perDiem:'Viáticos',
        takeHome:'Salario neto', benSec:'Beneficios pagados a tu nombre', totalBen:'Beneficios totales', grand:'Valor del paquete total',
        noMatch:'Ningún local coincide con esa búsqueda.', showLess:'Ver menos \u25b2', showAll1:'Ver los ', showAll2:' locales \u25bc',
        mnTotal:'paquete total (salario + beneficios)', mnWages:'salario neto',
        hlA:'A <b>', hlB:' hrs/semana</b> durante <b>', hlC:' semanas</b>, por <b>', hlD:'</b>: mejor local <b>IBEW ', hlE:'</b> con <b>', hlF:'/año</b> — <b>', hlG:'</b> más que el más bajo.',
        beat1:' <b>', beat2:'</b> locales ganan más que tu local de casa.',
        wagesLbl:'salario', benefitsLbl:'beneficios', totalLbl:'total', scaleLbl:'/hr escala', benLbl:'/hr beneficios', yr:'/año', nomatch2:'Sin coincidencias' }
    : { hw:'Health & Welfare', pd:'Defined Pension', pdc:'Annuity / DC Pension', nebf:'NEBF', k401:'401(k)', vac:'Vacation',
        other:'Other fringes (training, etc.)', yourPick:'your pick', hrsWk:'hrs/week', wks:'weeks', hrsYr:'hours a year',
        wagesSec:'Wages (to your check)', regular:'Regular', overtime:'Overtime', perDiem:'Per diem',
        takeHome:'Take-home wages', benSec:'Benefits paid on your behalf', totalBen:'Total benefits', grand:'Total package value',
        noMatch:'No locals match that search.', showLess:'Show less \u25b2', showAll1:'Show all ', showAll2:' locals \u25bc',
        mnTotal:'total package (wages + benefits)', mnWages:'take-home wages',
        hlA:'At <b>', hlB:' hrs/week</b> over <b>', hlC:' weeks</b>, by <b>', hlD:'</b>: top local <b>IBEW ', hlE:'</b> at <b>', hlF:'/yr</b> — <b>', hlG:'</b> more than the lowest.',
        beat1:' <b>', beat2:'</b> locals out-earn your home local.',
        wagesLbl:'wages', benefitsLbl:'benefits', totalLbl:'total', scaleLbl:'/hr scale', benLbl:'/hr benefits', yr:'/yr', nomatch2:'No match' };
  const urlPath = (es ? '/es/' : '/') + 'calculator';
  const localsPrefix = es ? '/es/locals/' : '/locals/';
  const buildPay = (trade, src) => rows.filter(r => (r.local.trade || 'IBEW') === trade).map(r => {
    const n = localNumber(r.local.name);
    const sc = src[n] || {};
    const scale = sc.scale ? Number(sc.scale) : (r.local.jw_scale != null ? Number(r.local.jw_scale) : null);
    if (!scale || !n) return null;
    const total = sc.total ? Number(sc.total) : null;
    const numf = v => { const x = parseFloat(String(v == null ? '' : v).replace(/[^0-9.]/g, '')); return isFinite(x) ? x : 0; };
    const hw = numf(sc.hw), pd = numf(sc.pension_def), pdc = numf(sc.pension_dc), nebf = numf(sc.nebf), k401 = numf(sc.k401), vac = numf(sc.vacation);
    const itemsSum = hw + pd + pdc + nebf + k401 + vac;
    let ben = Math.max(itemsSum, (total && total > scale) ? (total - scale) : 0);
    ben = Math.round(ben * 100) / 100;
    return { n: Number(n), c: r.local.city || '', s: r.local.state || '', scale: scale, ben: ben, hw: hw, pd: pd, pdc: pdc, nebf: nebf, k401: k401, vac: vac };
  }).filter(Boolean).sort((a, b) => b.scale - a.scale);
  const payIbew = buildPay('IBEW', SCALE);
  const payLine = buildPay('LINEMAN', LINEMAN_SCALE);

  const title = es ? 'Calculadora de Pago del IBEW — Compara el Pago de los Locales Sindicales | TrampHereBro' : 'IBEW Paycheck Calculator — Compare Union Local Pay | TrampHereBro';
  const desc = es
    ? `Compara el salario neto entre ${payIbew.length} locales interiores del IBEW y ${payLine.length} locales de lineman del IBEW. Ajusta tus horas, horas extra y viáticos, y mira qué local paga más. Gratis y actualizado a diario.`
    : `Compare take-home pay across ${payIbew.length} IBEW inside and ${payLine.length} IBEW lineman locals. Set your hours, overtime and per diem, and see which local pays most. Free and updated daily.`;
  const DATA_IBEW = JSON.stringify(payIbew);
  const DATA_LINE = JSON.stringify(payLine);

  const CALC_CSS = `
  .calc-controls{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);padding:20px 22px;margin-bottom:14px}
  .calc-ctl{display:flex;flex-direction:column;gap:7px}
  .calc-ctl label{font:600 12px/1 'Space Grotesk',sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--slate)}
  .calc-ctl label b{color:var(--orange);font-size:14px}
  .calc-ctl input[type=number],.calc-ctl select,.calc-baseline select{font:400 16px Inter,sans-serif;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--charcoal);width:100%;box-sizing:border-box}
  .calc-ctl input[type=range]{width:100%;accent-color:var(--orange)}
  .calc-baseline{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px;background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:14px 18px}
  .calc-baseline label{font:600 13px 'Space Grotesk',sans-serif;color:var(--navy)}
  .calc-baseline select{max-width:340px}
  .calc-headline{font-size:16px;line-height:1.6;color:var(--charcoal);background:linear-gradient(135deg,#0a2350,#061b40);color:#EAF0FA;border-left:4px solid var(--orange);border-radius:14px;padding:18px 22px;margin-bottom:16px}
  .calc-headline b{color:#fff;font-family:'Space Grotesk',sans-serif}
  .calc-search{width:100%;box-sizing:border-box;font:400 16px Inter,sans-serif;padding:13px 16px;border:1px solid var(--line);border-radius:12px;background:var(--card);box-shadow:var(--shadow);margin-bottom:14px}
  .calc-board{display:flex;flex-direction:column;gap:0;background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);overflow:hidden}
  .calc-rankby{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}
  .calc-rankby span{font:600 12px/1 'Space Grotesk',sans-serif;letter-spacing:.04em;text-transform:uppercase;color:var(--slate)}
  .calc-rankby .rb{font:600 13px Inter,sans-serif;padding:8px 15px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--slate);cursor:pointer}
  .calc-rankby .rb.on{background:var(--navy);color:#fff;border-color:var(--navy)}
  .calc-rankby .tb{font:600 13px Inter,sans-serif;padding:8px 15px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--slate);cursor:pointer}
  .calc-rankby .tb.on{background:var(--orange);color:#0a1226;border-color:var(--orange)}
  .calc-sub{display:block;font:400 12px Inter,sans-serif;color:var(--slate);margin-top:2px}
  .calc-sub2{display:block;font:400 11.5px Inter,sans-serif;color:var(--slate);margin-top:1px}
  .calc-row{display:grid;grid-template-columns:44px 1fr auto auto;align-items:center;gap:14px;padding:13px 18px;border-top:1px solid var(--line2);text-decoration:none;color:var(--charcoal);transition:background .1s}
  .calc-row:first-child{border-top:none}
  .calc-row:hover{background:#fffdfb}
  .calc-row.me{background:#fff6ef}
  .calc-rank{font:700 14px 'Space Grotesk',sans-serif;color:var(--slate);text-align:center}
  .calc-name{font-weight:600;font-size:14.5px;color:var(--navy)}
  .calc-scale{font-size:13px;color:var(--slate);white-space:nowrap}
  .calc-annual{font:700 15px 'Space Grotesk',sans-serif;color:var(--navy);white-space:nowrap}
  .calc-delta{font:700 12.5px 'Space Grotesk',sans-serif;padding:3px 9px;border-radius:999px;white-space:nowrap}
  .calc-delta.pos{background:#dcfce7;color:#15803d}
  .calc-delta.neg{background:#fee2e2;color:#b91c1c}
  .calc-note{font-size:12px;color:var(--slate);margin:14px 2px 0;line-height:1.5}
  .calc-picker{position:relative;flex:1;min-width:220px;max-width:420px}
  .calc-picker input{width:100%;box-sizing:border-box;font:400 16px Inter,sans-serif;padding:10px 34px 10px 14px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--charcoal)}
  .calc-clear{position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;font-size:22px;line-height:1;color:var(--slate);cursor:pointer;display:none;padding:2px 6px}
  .calc-picker.has .calc-clear{display:block}
  .calc-picker-list{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 12px 28px rgba(7,37,84,.16);max-height:270px;overflow-y:auto;z-index:30;display:none}
  .calc-picker-list.open{display:block}
  .calc-picker-list button{display:block;width:100%;text-align:left;background:none;border:none;padding:11px 14px;font:400 14px Inter,sans-serif;color:var(--charcoal);cursor:pointer;border-top:1px solid var(--line2)}
  .calc-picker-list button:first-child{border-top:none}
  .calc-picker-list button:hover{background:#fffdfb;color:var(--orange)}
  .calc-detail{background:linear-gradient(135deg,#0a2350,#061b40);color:#EAF0FA;border-radius:16px;box-shadow:var(--shadow-lg);padding:22px 24px;margin-bottom:16px}
  .calc-detail h3{font:700 18px 'Space Grotesk',sans-serif;color:#fff;margin:0 0 3px}
  .calc-detail .cd-scn{font-size:12.5px;color:#9db3d6;margin-bottom:12px}
  .calc-detail .cd-sec{font:700 11px 'Space Grotesk',sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--orange);margin:15px 0 5px}
  .calc-detail .cd-line{display:flex;justify-content:space-between;gap:12px;padding:5px 0;font-size:13.5px;border-bottom:1px solid rgba(255,255,255,.07)}
  .calc-detail .cd-line span:last-child{font-family:'Space Grotesk',sans-serif;font-weight:600;color:#fff;white-space:nowrap}
  .calc-detail .cd-line.cd-tot{border-bottom:none;border-top:1px solid rgba(255,255,255,.22);margin-top:3px;padding-top:9px}
  .calc-detail .cd-line.cd-tot span{color:#fff;font-size:14.5px;font-weight:700}
  .calc-detail .cd-grand{background:var(--orange);color:#fff;border-radius:10px;padding:12px 15px;margin-top:15px;display:flex;justify-content:space-between;font:700 16px 'Space Grotesk',sans-serif}
  .calc-more{display:flex;justify-content:center;margin-top:14px}
  .calc-morebtn{font:600 14px Inter,sans-serif;padding:11px 24px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--navy);cursor:pointer;box-shadow:var(--shadow)}
  .calc-morebtn:hover{border-color:var(--orange);color:var(--orange)}
  @media(max-width:720px){.calc-controls{grid-template-columns:1fr 1fr}}
  @media(max-width:560px){.calc-controls{grid-template-columns:1fr}.calc-row{grid-template-columns:32px 1fr auto;gap:8px;row-gap:4px;padding:12px 14px}.calc-annual{grid-column:3;grid-row:1;text-align:right}.calc-delta{grid-column:3;grid-row:2;justify-self:end}.calc-name{grid-column:2;grid-row:1}}
  `;

  return `<!DOCTYPE html><html lang="${lang}"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${CANON}${urlPath}">
${hreflangTags('calculator')}<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebApplication","name":"Union Paycheck Calculator","url":"${CANON}/calculator","applicationCategory":"FinanceApplication","operatingSystem":"Web","offers":{"@type":"Offer","price":"0","priceCurrency":"USD"},"description":"Free tool to compare union journeyman pay scale, benefits, and take-home across IBEW, lineman, and UA locals nationwide."}</script>
<meta property="og:type" content="website"><meta property="og:site_name" content="TrampHereBro">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${CANON}${urlPath}"><meta property="og:image" content="${CANON}/share-banner.png">
<meta name="twitter:card" content="summary_large_image">
${FAVICON_LINK}
${FONTS}${GA_TAG}
<style>${CSS}${CALC_CSS}</style>
</head><body>
${topbar('calculator', lang)}
<header><div class="hero-inner">
<div class="crumbs"><a href="${es ? '/es' : '/'}">${es ? 'Tablero' : 'Board'}</a> › ${K.crumb}</div>
<div class="kick"><span class="dot"></span>${K.kick}</div>
<h1 class="lede">${K.h1a}<b>${K.h1b}</b>${K.h1c}</h1>
<div class="hsub">${K.hsub}</div>
</div></header>
<main class="wrap">
<div class="calc-controls">
<div class="calc-ctl"><label>${K.hours} <b id="c-hours-v">50</b></label><input type="range" id="c-hours" min="40" max="72" value="50"></div>
<div class="calc-ctl"><label>${K.weeks}</label><input type="number" id="c-weeks" value="50" min="1" max="52"></div>
<div class="calc-ctl"><label>${K.otRate}</label><select id="c-ot"><option value="1.5">${K.ot15}</option><option value="2">${K.ot2}</option></select></div>
<div class="calc-ctl"><label>${K.perDiem}</label><input type="number" id="c-pd" value="0" min="0" step="5"></div>
</div>
<div class="calc-baseline"><label>${K.homeLocal}</label><div class="calc-picker"><input type="text" id="c-basein" placeholder="${K.pickPh}" autocomplete="off"><button type="button" id="c-baseclear" class="calc-clear" title="${K.clear}">&times;</button><div class="calc-picker-list" id="c-baselist"></div></div><input type="hidden" id="c-base" value=""></div><div class="calc-detail" id="c-detail" hidden></div>
<div class="calc-rankby"><span>${K.trade}</span><button type="button" class="tb on" data-t="IBEW">${K.ibew}</button><button type="button" class="tb" data-t="LINEMAN">${K.lineman}</button></div>
<div class="calc-rankby"><span>${K.rankBy}</span><button type="button" class="rb on" data-rb="total">${K.totalPkg}</button><button type="button" class="rb" data-rb="wages">${K.takeHome}</button></div>
<div class="calc-headline" id="c-headline"></div>
<input class="calc-search" id="c-search" type="search" placeholder="${K.filterPh}">
<div class="calc-board" id="c-board"></div><div class="calc-more" id="c-more"></div>
<div class="calc-note">${K.note}</div>
</main>
<script>
var L = ${JSON.stringify(JSL)};
var LOCALS_PREFIX = ${JSON.stringify(localsPrefix)};
var PAY_IBEW = ${DATA_IBEW};
var PAY_LINEMAN = ${DATA_LINE};
var curTrade = 'IBEW';
var PAY = PAY_IBEW;
var $ = function(id){ return document.getElementById(id); };
function fmt(n){ return '$' + Math.round(n).toLocaleString(); }
function detailHtml(p, hrs, wks, mult, pd, reg, ot){
  var totHrs = hrs*wks, regHrs = reg*wks, otHrs = ot*wks;
  var regW = reg*p.scale*wks, otW = ot*p.scale*mult*wks, pdW = pd*7*wks, wages = regW+otW+pdW;
  var comps = [[L.hw,p.hw],[L.pd,p.pd],[L.pdc,p.pdc],[L.nebf,p.nebf],[L.k401,p.k401],[L.vac,p.vac]].filter(function(x){return x[1]>0;});
  var itemsSum = 0; comps.forEach(function(x){ itemsSum += x[1]; });
  var benTotal = p.ben*totHrs, otherPerHr = Math.max(0, p.ben - itemsSum);
  var lines = comps.map(function(x){ return '<div class="cd-line"><span>'+x[0]+' ($'+x[1].toFixed(2)+'/hr)</span><span>'+fmt(x[1]*totHrs)+'</span></div>'; }).join('');
  if(otherPerHr > 0.01){ lines += '<div class="cd-line"><span>'+L.other+'</span><span>'+fmt(otherPerHr*totHrs)+'</span></div>'; }
  return '<h3>IBEW '+p.n+(p.c?' \u00b7 '+p.c+', '+p.s:'')+' \u2014 '+L.yourPick+'</h3>'
    +'<div class="cd-scn">'+hrs+' '+L.hrsWk+' \u00b7 '+wks+' '+L.wks+' \u00b7 '+Math.round(totHrs).toLocaleString()+' '+L.hrsYr+'</div>'
    +'<div class="cd-sec">'+L.wagesSec+'</div>'
    +'<div class="cd-line"><span>'+L.regular+' ('+Math.round(regHrs).toLocaleString()+' hrs @ $'+p.scale.toFixed(2)+')</span><span>'+fmt(regW)+'</span></div>'
    +(otHrs>0?'<div class="cd-line"><span>'+L.overtime+' ('+Math.round(otHrs).toLocaleString()+' hrs @ $'+(p.scale*mult).toFixed(2)+')</span><span>'+fmt(otW)+'</span></div>':'')
    +(pdW>0?'<div class="cd-line"><span>'+L.perDiem+'</span><span>'+fmt(pdW)+'</span></div>':'')
    +'<div class="cd-line cd-tot"><span>'+L.takeHome+'</span><span>'+fmt(wages)+'</span></div>'
    +'<div class="cd-sec">'+L.benSec+' ('+Math.round(totHrs).toLocaleString()+' hrs)</div>'+lines
    +'<div class="cd-line cd-tot"><span>'+L.totalBen+'</span><span>'+fmt(benTotal)+'</span></div>'
    +'<div class="cd-grand"><span>'+L.grand+'</span><span>'+fmt(wages+benTotal)+'</span></div>';
}
var rankBy = 'total', expanded = false;
function toggleExpand(){ expanded = !expanded; compute(); }
function compute(){
  var hrs = +$('c-hours').value, wks = +$('c-weeks').value || 50, mult = +$('c-ot').value, pd = +$('c-pd').value || 0;
  var reg = Math.min(hrs, 40), ot = Math.max(hrs - 40, 0);
  $('c-hours-v').textContent = hrs;
  var base = $('c-base').value, key = rankBy;
  var _det=$('c-detail'), _bp=null; if(base){ for(var _i=0;_i<PAY.length;_i++){ if(PAY[_i].n==base){ _bp=PAY[_i]; break; } } } if(_bp){ _det.hidden=false; _det.innerHTML=detailHtml(_bp,hrs,wks,mult,pd,reg,ot); } else { _det.hidden=true; _det.innerHTML=''; }
  var list = PAY.map(function(p){
    var wages = (reg*p.scale + ot*p.scale*mult)*wks + pd*7*wks;
    var benefits = (p.ben||0) * hrs * wks;
    return { p:p, wages:wages, benefits:benefits, total: wages+benefits };
  });
  var baseVal = null;
  if(base){ for(var i=0;i<list.length;i++){ if(list[i].p.n==base){ baseVal = list[i][key]; break; } } }
  list.sort(function(a,b){ return a.p.n - b.p.n; });
  var q = ($('c-search').value || '').toLowerCase();
  var out = [];
  for(var j=0;j<list.length;j++){
    var r = list[j];
    if(q && (''+r.p.n).indexOf(q)===-1 && r.p.c.toLowerCase().indexOf(q)===-1 && r.p.s.toLowerCase().indexOf(q)===-1) continue;
    var delta = '';
    if(baseVal!=null && r.p.n!=base){ var d = r[key] - baseVal; delta = '<span class="calc-delta ' + (d>=0?'pos':'neg') + '">' + (d>=0?'+':'\u2212') + fmt(Math.abs(d)) + L.yr + '</span>'; }
    var sec = key==='total' ? (L.wagesLbl + ' ' + fmt(r.wages) + ' \u00b7 ' + L.benefitsLbl + ' ' + fmt(r.benefits)) : ('+ ' + fmt(r.benefits) + ' ' + L.benefitsLbl + ' = ' + fmt(r.total) + ' ' + L.totalLbl);
    out.push('<a class="calc-row' + (base==r.p.n?' me':'') + '" href="' + LOCALS_PREFIX + (curTrade==='LINEMAN'?'lineman':'ibew') + '-local-' + r.p.n + '"><span class="calc-rank">' + (j+1) + '</span><span class="calc-name">IBEW ' + r.p.n + (r.p.c? ' \u00b7 ' + r.p.c + ', ' + r.p.s : '') + '<span class="calc-sub">$' + r.p.scale.toFixed(2) + L.scaleLbl + ' \u00b7 $' + (r.p.ben||0).toFixed(2) + '/hr benefits</span></span><span class="calc-annual">' + fmt(r[key]) + L.yr + '<span class="calc-sub2">' + sec + '</span></span>' + delta + '</a>');
  }
  var _total = out.length, _N = 12, _showAll = q || expanded;
  $('c-board').innerHTML = (_showAll ? out : out.slice(0, _N)).join('') || '<div style="padding:30px;text-align:center;color:var(--slate)">'+L.noMatch+'</div>';
  $('c-more').innerHTML = (!q && _total > _N) ? '<button type="button" class="calc-morebtn" onclick="toggleExpand()">' + (expanded ? L.showLess : L.showAll1 + _total + L.showAll2) + '</button>' : '';
  var _byPay = list.slice().sort(function(a,b){ return b[key] - a[key]; }); var top = _byPay[0], bot = _byPay[_byPay.length-1];
  if(top){
    var mn = key==='total' ? L.mnTotal : L.mnWages;
    var hl = L.hlA + hrs + L.hlB + wks + L.hlC + mn + L.hlD + top.p.n + (top.p.c? ' (' + top.p.c + ', ' + top.p.s + ')':'') + L.hlE + fmt(top[key]) + L.hlF + fmt(top[key] - bot[key]) + L.hlG;
    if(baseVal!=null){ var beat = 0; for(var k=0;k<list.length;k++){ if(list[k][key] > baseVal) beat++; } hl += L.beat1 + beat + L.beat2; }
    $('c-headline').innerHTML = hl;
  }
}
(function(){
  var bin=$('c-basein'), blist=$('c-baselist'), bhid=$('c-base'), pick=document.querySelector('.calc-picker'), bclr=$('c-baseclear');
  function draw(q){ q=(q||'').toLowerCase(); var m=PAY.slice().sort(function(a,b){return a.n-b.n;}).filter(function(p){ return !q || (''+p.n).indexOf(q)>-1 || p.c.toLowerCase().indexOf(q)>-1 || p.s.toLowerCase().indexOf(q)>-1; }).slice(0,40);
    blist.innerHTML = m.length ? m.map(function(p){ return '<button type="button" data-n="'+p.n+'">IBEW '+p.n+(p.c?' \u00b7 '+p.c+', '+p.s:'')+'</button>'; }).join('') : '<button type="button" disabled style="color:#94a3b8">'+L.nomatch2+'</button>';
    blist.classList.add('open'); }
  bin.addEventListener('focus',function(){ draw(bin.value); });
  bin.addEventListener('input',function(){ draw(bin.value); });
  blist.addEventListener('click',function(e){ var b=e.target.closest('button[data-n]'); if(!b)return; var n=b.getAttribute('data-n'); var p; for(var i=0;i<PAY.length;i++){ if(PAY[i].n==n){p=PAY[i];break;} } bhid.value=n; bin.value='IBEW '+n+(p&&p.c?' \u00b7 '+p.c:''); blist.classList.remove('open'); pick.classList.add('has'); compute(); });
  bclr.addEventListener('click',function(){ bhid.value=''; bin.value=''; pick.classList.remove('has'); blist.classList.remove('open'); compute(); });
  document.addEventListener('click',function(e){ if(!pick.contains(e.target)) blist.classList.remove('open'); });
})();
['c-hours','c-weeks','c-ot','c-pd','c-search','c-base'].forEach(function(id){ var el=$(id); if(el){ el.addEventListener('input',compute); el.addEventListener('change',compute); } });
Array.prototype.forEach.call(document.querySelectorAll('.calc-rankby .rb'), function(btn){ btn.addEventListener('click', function(){ Array.prototype.forEach.call(document.querySelectorAll('.calc-rankby .rb'), function(b){ b.classList.remove('on'); }); btn.classList.add('on'); rankBy = btn.getAttribute('data-rb'); compute(); }); });
Array.prototype.forEach.call(document.querySelectorAll('.calc-rankby .tb'), function(btn){ btn.addEventListener('click', function(){ Array.prototype.forEach.call(document.querySelectorAll('.calc-rankby .tb'), function(b){ b.classList.remove('on'); }); btn.classList.add('on'); curTrade = btn.getAttribute('data-t'); PAY = (curTrade==='LINEMAN') ? PAY_LINEMAN : PAY_IBEW; var bh=$('c-base'), bi=$('c-basein'), pk=document.querySelector('.calc-picker'); if(bh)bh.value=''; if(bi)bi.value=''; if(pk)pk.classList.remove('has'); expanded=false; compute(); }); });
compute();
</script>
${footer(lang)}
</body></html>`;
}

/* -------------------- Daily Snapshot (whole-board brief) ------------------ */
function boardDigest(rows) {
  const withCalls = rows.filter(r => r.calls.length);
  const stats = {
    totalCalls: withCalls.reduce((s, r) => s + r.calls.length, 0),
    totalHands: withCalls.reduce((s, r) => s + r.calls.reduce((x, c) => x + (Number(c.num_needed) || 0), 0), 0),
    activeLocals: withCalls.length
  };
  const agg = withCalls.map(r => {
    const n = localNumber(r.local.name);
    const hands = r.calls.reduce((x, c) => x + (Number(c.num_needed) || 0), 0);
    const scales = r.calls.map(c => Number(c.scale)).filter(x => !isNaN(x));
    const maxScale = scales.length ? Math.max(...scales) : (Number(r.local.jw_scale) || 0);
    const top = r.calls.slice().sort((a, b) => (Number(b.num_needed) || 0) - (Number(a.num_needed) || 0)).slice(0, 4)
      .map(c => `${c.contractor || 'contractor'} (${c.num_needed || '?'} ${c.call_type || 'JW'}, ${[c.job_name, c.location].filter(Boolean).join(' ') || 'project'}${c.scale ? ', $' + c.scale : ''}${c.per_diem ? ', PD ' + c.per_diem : ''}${c.notes ? ', ' + String(c.notes).replace(/\s+/g, ' ').slice(0, 50) : ''})`).join('; ');
    return { label: 'LU-' + (n || r.local.id), place: [r.local.city, r.local.state].filter(Boolean).join(', '), calls: r.calls.length, hands, maxScale, book1: r.local.book1, top };
  });
  const picked = new Map();
  agg.slice().sort((a, b) => b.hands - a.hands).slice(0, 14).forEach(x => picked.set(x.label, x));
  agg.slice().sort((a, b) => b.maxScale - a.maxScale).slice(0, 6).forEach(x => picked.set(x.label, x));
  const digest = [...picked.values()].map(x => `${x.label} ${x.place} — ${x.calls} calls, ~${x.hands} hands, top scale $${x.maxScale.toFixed(2)}${x.book1 != null ? ', Book1 ' + x.book1 : ''}. ${x.top}`).join('\n');
  return { digest, stats };
}
async function generateSnapshot(rows, trade) {
  if (!ANTHROPIC_KEY) return null;
  trade = trade || 'IBEW';
  const tRows = rows.filter(r => (r.local.trade || 'IBEW') === trade);
  const { digest, stats } = boardDigest(tRows);
  if (!stats.totalCalls) return null;
  const dayname = TODAY.toLocaleDateString('en-US', { weekday: 'long' });
  const CFG = trade === 'LINEMAN' ? { title: 'Trampin the IBEW Lineman Locals', who: 'traveling outside linemen', proj: 'transmission lines, substations, distribution rebuilds, storm restoration, and utility/data-center work' } : { title: 'Trampin the IBEW Indoor Locals', who: 'traveling inside wiremen', proj: 'data centers, refineries, steel mills, hospitals' };
  const prompt = `You are writing today's "${CFG.title}" for TrampHereBro — a daily intel briefing for ${CFG.who} deciding where to chase work. You know this trade cold. Today is ${dayname}, ${PRETTY_DATE}.\n\nBoard-wide right now: ${stats.totalCalls} open calls across ${stats.activeLocals} locals, about ${stats.totalHands} hands needed.\n\nStandout locals (live from union dispatch — each line gives the local, its total calls and hands, top scale, book depth, then specific calls with contractor, project, pay, per diem, schedule and requirements):\n${digest}\n\nWrite a punchy, SPECIFIC editorial snapshot of ~240-300 words in the voice of a sharp journeyman who's actually in the work — not a generic recap. Lead with a bold title line exactly: **${CFG.title} — ${dayname}, ${PRETTY_DATE}**. Then feature the 5-6 most notable locals as tight paragraphs, ordered by a mix of top pay and biggest boards. For EACH featured local, be concrete with the data: bold the local header like **LU-494 Milwaukee, WI**; bold the exact standout pay (e.g. **$62.73/hr**) and call out over-scale premiums, per diem, and OT specifics (e.g. "all OT double time", "5-10s + Sat"); name the actual contractors and projects (${CFG.proj}). Where the data shows book depth, work it in (e.g. "Book 1 nearly clear at 5 out"). Skip locals with thin data. Close with ONE sentence on the market trend — where the hands are going and what's driving it. No preamble, no sign-off. Use ONLY facts from the data above; never invent pay, projects, or numbers.`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: SNAPSHOT_MODEL, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] })
    });
    if (!r.ok) { console.log('  snapshot API ' + r.status); return null; }
    const j = await r.json();
    const txt = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    return txt || null;
  } catch (e) { return null; }
}
function snapshotMd(t) {
  return esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').split(/\n\s*\n/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

function snapTradeBlock(text, textLine){
  var trades = [['IBEW','IBEW Inside Wiremen', text]];
  if (textLine) trades.push(['LINEMAN','IBEW Lineman', textLine]);
  var panels = trades.map(function(t,i){
    return '<div class="snap-card" data-trade-snap="'+t[0]+'"'+(i===0?'':' style="display:none"')+'>'+snapshotMd(t[2])+'</div>';
  }).join('');
  if (trades.length < 2) return panels;
  var opts = trades.map(function(t){ return '<option value="'+t[0]+'">'+esc(t[1])+'</option>'; }).join('');
  var picker = '<div style="margin:0 0 18px;display:flex;align-items:center;gap:10px;flex-wrap:wrap"><label for="tradeSel" style="font-weight:700;color:var(--navy);font-size:14px">Viewing:</label><select id="tradeSel" style="padding:9px 13px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--navy);font-weight:600;font-size:14px;font-family:inherit">'+opts+'</select></div>';
  var script = '<script>(function(){var s=document.getElementById("tradeSel");if(!s)return;s.addEventListener("change",function(){var v=this.value;var els=document.querySelectorAll("[data-trade-snap]");for(var i=0;i<els.length;i++){els[i].style.display=els[i].getAttribute("data-trade-snap")===v?"":"none";}});})();</scr'+'ipt>';
  return picker + panels + script;
}

function historyPage(lang) {
  lang = lang || 'en';
  const EN = {
    title: 'The History of Organized Labor | TrampHereBro',
    desc: 'The 40-hour week, the weekend, workplace safety, overtime — every benefit workers carry today was won by organized labor. A timeline of the labor movement, built for the traveling trades.',
    crumb: 'History', kick: 'The Fight Behind the Trade',
    h1a: 'The History of ', h1b: 'Organized Labor',
    hsub: 'Every hand on the road today stands on ground that was fought for. Here’s how it was won — and why the book you sign still matters.',
    lead: 'The 40-hour work week. The weekend. Workplace safety. Overtime. Health coverage. A pension you can retire on. <b>Every one of these was fought for — and won — by workers who organized.</b> None of it was handed down. It was bargained for at the table, walked for on the line, and in more cases than anyone should have to remember, bled for on the job.',
    stats: [['150+','Years fighting for workers'],['16M+','Workers repped by unions'],['~18%','Union wage premium'],['$0','To join an apprenticeship']],
    tlSecA: 'A ', tlSecAccent: 'Timeline', tlSecB: ' of the Labor Movement',
    tlSub: 'From the first trade societies to the laws that still protect you on the job today.',
    wonSecA: 'What ', wonSecAccent: 'Unions Won', wonSecB: ' for Every American',
    wonSub: 'Union or not, your life is better because organized workers refused to take less.',
    closeHa: 'You’re part of ', closeHb: 'that story', closeHc: ' now.',
    closeP: 'Every call you chase, every book you sign, every mile you tramp — you’re carrying a 150-year tradition of skilled hands looking out for each other. That’s the brotherhood and sisterhood that makes the road possible.',
    closeA: 'See who’s hiring →',
    TL: [
      ['1794','The First American Trade Union','The Federal Society of Journeymen Cordwainers — shoemakers — organizes in Philadelphia, widely counted as the first sustained trade union in the country. Skilled hands, banding together for fair pay. Sound familiar?'],
      ['1869','The Knights of Labor','One of the first major labor organizations, and radical for its day — it opened its ranks broadly across skill, race, and gender when almost nothing else did.'],
      ['1886','Haymarket & the 8-Hour Day','Workers across the country walked for the eight-hour day. The events at Chicago’s Haymarket became a rallying point that pushed the eight-hour standard around the world — the workday you clock today.'],
      ['1886','The AFL Is Founded','Samuel Gompers builds the American Federation of Labor, organizing skilled craft workers into trade unions — the craft-union model the building trades still run on.'],
      ['1911','The Triangle Shirtwaist Fire','146 garment workers, most of them young immigrant women, died when locked exits trapped them inside a burning factory. The outrage drove landmark fire-code and workplace-safety reform.'],
      ['1935','The Wagner Act','The National Labor Relations Act guarantees private-sector workers the right to organize, join a union, and bargain collectively. The legal backbone of everything that followed.'],
      ['1938','The Fair Labor Standards Act','The federal minimum wage. The 40-hour week. Time-and-a-half overtime. Hard limits on child labor. One law, and unions put it there.'],
      ['1947','Taft-Hartley','Congress rolls back parts of the Wagner Act, restricting certain union tactics. A reminder that the fight never really ends — it just changes shape.'],
      ['1955','The AFL-CIO Merger','The two largest labor federations merge into one, consolidating the national voice of American labor.'],
      ['1970','OSHA','The Occupational Safety and Health Act creates enforceable federal safety standards. Those rules — the ones that gripe you on a Monday morning safety brief — are why more of us make it home.'],
      ['Today','The Building Trades Right Now','Registered apprenticeships, project labor agreements, and a data-center and energy boom driving record demand for skilled union hands. The road’s as busy as it’s been in a generation — and you’re on it.'],
    ],
    WON: [
      ['The weekend','Two days off wasn’t a gift. It was won.'],
      ['The 8-hour day','Before the fight, 12–16 hour days were normal.'],
      ['Overtime pay','Time-and-a-half past 40 — codified in 1938.'],
      ['Workplace safety','OSHA, fire codes, and the right to refuse unsafe work.'],
      ['Child labor laws','Kids belong in school, not in the mill.'],
      ['Employer health & pensions','Benefits bargained at the table, not begged for.'],
    ]
  };
  const ES = {
    title: 'La Historia del Trabajo Organizado | TrampHereBro',
    desc: 'La semana de 40 horas, el fin de semana, la seguridad laboral, las horas extra — cada beneficio que los trabajadores tienen hoy lo ganó el movimiento obrero organizado. Una cronología del movimiento obrero, hecha para los oficios viajeros.',
    crumb: 'Historia', kick: 'La Lucha Detrás del Oficio',
    h1a: 'La Historia del ', h1b: 'Trabajo Organizado',
    hsub: 'Cada trabajador en el camino hoy pisa terreno que se conquistó con lucha. Así se ganó — y por qué el libro que firmas todavía importa.',
    lead: 'La semana laboral de 40 horas. El fin de semana. La seguridad laboral. Las horas extra. La cobertura de salud. Una pensión con la que puedes jubilarte. <b>Cada una de estas se luchó — y se ganó — por trabajadores que se organizaron.</b> Nada de esto se regaló. Se negoció en la mesa, se marchó en la línea de piquete, y en más casos de los que nadie debería tener que recordar, se pagó con sangre en el trabajo.',
    stats: [['150+','Años luchando por los trabajadores'],['16M+','Trabajadores representados por sindicatos'],['~18%','Ventaja salarial sindical'],['$0','Para entrar a un aprendizaje']],
    tlSecA: 'Una ', tlSecAccent: 'Cronología', tlSecB: ' del Movimiento Obrero',
    tlSub: 'Desde las primeras sociedades de oficio hasta las leyes que aún te protegen en el trabajo hoy.',
    wonSecA: 'Lo que los ', wonSecAccent: 'Sindicatos Ganaron', wonSecB: ' para Todos',
    wonSub: 'Seas sindicalizado o no, tu vida es mejor porque los trabajadores organizados se negaron a aceptar menos.',
    closeHa: 'Ahora eres parte de ', closeHb: 'esa historia', closeHc: '.',
    closeP: 'Cada llamada que persigues, cada libro que firmas, cada milla que recorres — cargas con una tradición de 150 años de manos calificadas que se cuidan entre sí. Esa es la hermandad que hace posible el camino.',
    closeA: 'Mira quién está contratando →',
    TL: [
      ['1794','El Primer Sindicato Obrero de EE.UU.','La Sociedad Federal de Zapateros Oficiales — los cordwainers — se organiza en Filadelfia, ampliamente reconocida como el primer sindicato obrero sostenido del país. Manos con oficio, uniéndose por un pago justo. ¿Te suena?'],
      ['1869','Los Caballeros del Trabajo','Una de las primeras grandes organizaciones obreras, y radical para su época — abrió sus filas ampliamente sin importar el oficio, la raza o el género, cuando casi nada más lo hacía.'],
      ['1886','Haymarket y la Jornada de 8 Horas','Trabajadores de todo el país marcharon por la jornada de ocho horas. Los sucesos de Haymarket, en Chicago, se convirtieron en un punto de unión que impulsó el estándar de las ocho horas en todo el mundo — la jornada que registras hoy.'],
      ['1886','Se Funda la AFL','Samuel Gompers construye la Federación Americana del Trabajo (AFL), organizando a los trabajadores calificados de oficio en sindicatos — el modelo de sindicato de oficio sobre el que aún funcionan los oficios de la construcción.'],
      ['1911','El Incendio de Triangle Shirtwaist','146 trabajadores de la costura, en su mayoría mujeres jóvenes inmigrantes, murieron cuando las salidas cerradas con llave las dejaron atrapadas dentro de una fábrica en llamas. La indignación impulsó reformas históricas de códigos contra incendios y de seguridad laboral.'],
      ['1935','La Ley Wagner','La Ley Nacional de Relaciones Laborales garantiza a los trabajadores del sector privado el derecho a organizarse, afiliarse a un sindicato y negociar colectivamente. La columna vertebral legal de todo lo que siguió.'],
      ['1938','La Ley de Normas Justas de Trabajo','El salario mínimo federal. La semana de 40 horas. El pago de horas extra a tiempo y medio. Límites estrictos al trabajo infantil. Una sola ley — y los sindicatos la pusieron ahí.'],
      ['1947','Taft-Hartley','El Congreso revierte partes de la Ley Wagner, restringiendo ciertas tácticas sindicales. Un recordatorio de que la lucha nunca termina del todo — solo cambia de forma.'],
      ['1955','La Fusión AFL-CIO','Las dos federaciones laborales más grandes se fusionan en una sola, consolidando la voz nacional del movimiento obrero estadounidense.'],
      ['1970','OSHA','La Ley de Seguridad y Salud Ocupacional crea normas federales de seguridad de cumplimiento obligatorio. Esas reglas — las mismas de las que te quejas en la charla de seguridad del lunes por la mañana — son la razón por la que más de nosotros llegamos a casa.'],
      ['Hoy','Los Oficios de la Construcción Hoy','Aprendizajes registrados, acuerdos laborales de proyecto (PLA), y un auge de centros de datos y energía que impulsa una demanda récord de manos sindicales calificadas. El camino está tan activo como no lo estaba en una generación — y tú estás en él.'],
    ],
    WON: [
      ['El fin de semana','Dos días libres no fueron un regalo. Se ganaron.'],
      ['La jornada de 8 horas','Antes de la lucha, las jornadas de 12 a 16 horas eran normales.'],
      ['El pago de horas extra','Tiempo y medio después de 40 horas — codificado en 1938.'],
      ['La seguridad laboral','OSHA, los códigos contra incendios, y el derecho a rechazar trabajo inseguro.'],
      ['Las leyes contra el trabajo infantil','Los niños pertenecen a la escuela, no a la fábrica.'],
      ['Salud y pensiones del empleador','Beneficios negociados en la mesa, no mendigados.'],
    ]
  };
  const D = lang === 'es' ? ES : EN;
  const title = D.title;
  const desc = D.desc;
  const urlPath = (lang === 'es' ? '/es/' : '/') + 'unionhistory';
  const HS = `
  .h-lead{font-size:18px;line-height:1.7;margin:0 0 8px}.h-lead b{color:var(--navy)}
  .h-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:30px 0 44px}
  .h-stat{background:var(--card);border:1px solid var(--line);border-top:3px solid var(--orange);border-radius:12px;padding:18px 12px;text-align:center}
  .h-stat .n{font-family:'Space Grotesk',sans-serif;font-size:29px;font-weight:700;color:var(--navy);line-height:1}
  .h-stat .l{font-size:11.5px;color:var(--slate);margin-top:7px;font-weight:500}
  .h-sect{font-family:'Space Grotesk',sans-serif;font-size:25px;color:var(--navy);font-weight:700;margin:8px 0 4px;letter-spacing:-.01em}
  .h-sect .accent{color:var(--orange)}
  .h-sub{color:var(--slate);font-size:14px;margin-bottom:24px}
  .h-tl{border-left:2px solid var(--line);margin-left:8px}
  .h-i{position:relative;padding:0 0 26px 28px}
  .h-i:before{content:'';position:absolute;left:-7px;top:4px;width:12px;height:12px;border-radius:50%;background:var(--orange);border:2px solid var(--bg)}
  .h-y{font-family:'Space Grotesk',sans-serif;font-weight:700;color:var(--orange);font-size:15px}
  .h-e{font-weight:700;color:var(--navy);font-size:16px;margin:2px 0 4px}
  .h-d{color:var(--charcoal);font-size:14.5px;line-height:1.6}
  .h-won{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:22px}
  .h-w{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
  .h-w .h{font-weight:700;color:var(--navy);font-size:14.5px;margin-bottom:3px}
  .h-w .d{color:var(--slate);font-size:13px}
  .h-close{background:var(--navy);color:#fff;border-radius:16px;padding:30px 32px;margin-top:44px;text-align:center}
  .h-close h3{font-family:'Space Grotesk',sans-serif;font-size:22px;margin-bottom:10px}.h-close h3 b{color:var(--orange)}
  .h-close p{color:#c6d6ef;font-size:15px;max-width:560px;margin:0 auto 18px;line-height:1.6}
  .h-close a{display:inline-block;background:var(--orange);color:#fff;text-decoration:none;font-weight:700;padding:11px 22px;border-radius:10px;font-size:14px}
  @media(max-width:640px){.h-stats{grid-template-columns:repeat(2,1fr)}.h-won{grid-template-columns:1fr}}`;
  const tl = D.TL.map(t => `<div class="h-i"><div class="h-y">${t[0]}</div><div class="h-e">${esc(t[1])}</div><div class="h-d">${esc(t[2])}</div></div>`).join('');
  const won = D.WON.map(w => `<div class="h-w"><div class="h">${esc(w[0])}</div><div class="d">${esc(w[1])}</div></div>`).join('');
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${CANON}${urlPath}">
${hreflangTags('unionhistory')}
<meta property="og:type" content="article"><meta property="og:site_name" content="TrampHereBro">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${CANON}${urlPath}"><meta property="og:image" content="${CANON}/share-banner.png">
<meta name="twitter:card" content="summary_large_image">
${FAVICON_LINK}
${FONTS}${GA_TAG}
<style>${CSS}${HS}</style>
</head><body>
${topbar('unionhistory', lang)}
<header><div class="hero-inner">
<div class="crumbs"><a href="${lhref('', lang)}">${lang === 'es' ? 'Tablero' : 'Board'}</a> \u203a ${D.crumb}</div>
<div class="kick"><span class="dot"></span>${D.kick}</div>
<h1 class="lede">${D.h1a}<b>${D.h1b}</b></h1>
<div class="hsub">${D.hsub}</div>
</div></header>
<main class="wrap">
<p class="h-lead">${D.lead}</p>
<div class="h-stats">${D.stats.map(s => `<div class="h-stat"><div class="n">${s[0]}</div><div class="l">${esc(s[1])}</div></div>`).join('')}</div>
<div class="h-sect">${D.tlSecA}<span class="accent">${D.tlSecAccent}</span>${D.tlSecB}</div>
<div class="h-sub">${D.tlSub}</div>
<div class="h-tl">${tl}</div>
<div class="h-sect" style="margin-top:40px">${D.wonSecA}<span class="accent">${D.wonSecAccent}</span>${D.wonSecB}</div>
<div class="h-sub">${D.wonSub}</div>
<div class="h-won">${won}</div>
<div class="h-close"><h3>${D.closeHa}<b>${D.closeHb}</b>${D.closeHc}</h3><p>${D.closeP}</p><a href="${lhref('', lang)}">${D.closeA}</a></div>
</main>
${footer(lang)}
</body></html>`;
}

function ibewHistoryPage(lang) {
  lang = lang || 'en';
  const EN = {
    title: 'The History of the IBEW — Wired for the Long Haul | TrampHereBro',
    desc: 'From a boarding-house room above a St. Louis dance hall in 1891 to over 900,000 members today. Henry Miller, the founding, the Reid-Murphy split, the Council on Industrial Relations, the AT&T breakup, and the data-center boom — the story of the Brotherhood.',
    crumb: 'IBEW History', kick: 'Wired for the Long Haul',
    h1a: 'The History of the ', h1b: 'IBEW',
    hsub: 'From a boarding-house room above a St. Louis dance hall to nearly a million members — the story of the Brotherhood you carry a card in.',
    lead: 'In 1891, a traveling lineman named <b>Henry Miller</b> rode the rails city to city — tools and a spare shirt in a carpetbag — organizing electrical workers wherever he found them. That November, ten delegates representing 286 members met in a rented room above Stolley’s Dance Hall in a poor section of St. Louis and founded what became the <b>International Brotherhood of Electrical Workers</b>. It was a humble start for a trade so dangerous that Miller himself would be dead within five years — killed by a fall after an electric shock. But the Brotherhood he built is now the largest electrical union in the world.',
    stats: [['1891','Founded in St. Louis'],['900K+','Members today'],['10','Founding delegates'],['130+','Years of the Brotherhood']],
    pull: '“No man could have done more for our union in its first years than he did.” — J.T. Kelly, first Secretary, on Henry Miller',
    tlSecA: 'A ', tlSecAccent: 'Timeline', tlSecB: ' of the Brotherhood',
    tlSub: 'From ten men in a rented room to the trade powering the modern grid.',
    closeHa: 'You carry ', closeHb: 'that card', closeHc: ' now.',
    closeP: 'Every hot day in the ditch, every night shift at the data center, every mile you tramp to the next call — you’re part of a 130-year line that runs straight back to ten men in a rented room who refused to take less. Wire it up, brother.',
    closeA: 'See who’s hiring →',
    TL: [
      ['1890','The Spark in St. Louis','Electricians working the St. Louis Exposition, tired of long dangerous days for meager pay, charter AFL Federal Labor Union No. 5221 with help from the AFL. A young lineman, Henry Miller, is elected president — but he knows a single local isn’t enough.'],
      ['1891','The Brotherhood Is Born','On November 21, ten delegates representing 286 members convene in St. Louis and found the National Brotherhood of Electrical Workers. They work day and night for a week drafting the first constitution and the emblem you still see — a fist grasping lightning bolts. Miller is elected first Grand President.'],
      ['1896','Miller Falls','Henry Miller dies at 38 after an electric shock causes him to fall from a pole. He gave the trade its union and, in the end, his life to the same dangers the Brotherhood was built to fight.'],
      ['1899','“International”','As locals charter across Canada as well as the U.S., the union becomes the International Brotherhood of Electrical Workers — the name it carries today.'],
      ['1908','The Reid-Murphy Split','A bitter internal war — rooted in the old tension between wiremen and linemen — fractures the Brotherhood into two rival IBEWs for six years. At one point the breakaway faction claimed three-quarters of all organized electrical workers. It nearly ended the union.'],
      ['1912','Made Whole Again','A court declares the breakaway 1908 convention illegal, and the Brotherhood reunites. The near-death experience left a lasting lesson about the cost of division.'],
      ['1919-20','The Council on Industrial Relations','Membership explodes from 23,500 in 1913 to over 148,000 by 1919. The IBEW and electrical contractors create the Council on Industrial Relations — a joint body to settle disputes without strikes, a labor-management model that still runs today. Headquarters moves to Washington, D.C.'],
      ['1941','National Apprenticeship Standards','The IBEW helps set national apprenticeship standards — the earn-while-you-learn training model that made the union electrician synonymous with skill and safety.'],
      ['1980s','The AT&T Breakup','The court-ordered breakup of the Bell System guts tens of thousands of IBEW telecom jobs almost overnight — one of the hardest blows the Brotherhood ever absorbed, and a hard lesson in adapting to a changing industry.'],
      ['Today','Wired for What’s Next','Over 900,000 members across the U.S., Canada, and beyond. The data-center and clean-energy boom is driving the biggest demand for skilled electrical labor in a generation — and the Brotherhood is chasing one million members again. The road’s wide open, and you’re on it.'],
    ]
  };
  const ES = {
    title: 'La Historia del IBEW — Conectados para el Largo Camino | TrampHereBro',
    desc: 'Desde un cuarto de pensión sobre un salón de baile en San Luis en 1891 hasta más de 900,000 miembros hoy. Henry Miller, la fundación, la división Reid-Murphy, el Consejo de Relaciones Industriales, la disolución de AT&T, y el auge de los centros de datos — la historia de la Hermandad.',
    crumb: 'Historia del IBEW', kick: 'Conectados para el Largo Camino',
    h1a: 'La Historia del ', h1b: 'IBEW',
    hsub: 'Desde un cuarto de pensión sobre un salón de baile en San Luis hasta casi un millón de miembros — la historia de la Hermandad cuya tarjeta cargas.',
    lead: 'En 1891, un lineman viajero llamado <b>Henry Miller</b> recorría los rieles de ciudad en ciudad — con sus herramientas y una camisa de repuesto en un maletín — organizando a los trabajadores eléctricos dondequiera que los encontraba. Ese noviembre, diez delegados que representaban a 286 miembros se reunieron en un cuarto rentado sobre el Salón de Baile Stolley, en una zona pobre de San Luis, y fundaron lo que se convirtió en la <b>Hermandad Internacional de Trabajadores Eléctricos (IBEW)</b>. Fue un comienzo humilde para un oficio tan peligroso que el propio Miller estaría muerto en cinco años — por una caída tras una descarga eléctrica. Pero la Hermandad que construyó es hoy el sindicato eléctrico más grande del mundo.',
    stats: [['1891','Fundada en San Luis'],['900K+','Miembros hoy'],['10','Delegados fundadores'],['130+','Años de la Hermandad']],
    pull: '“Ningún hombre pudo haber hecho más por nuestro sindicato en sus primeros años de lo que él hizo.” — J.T. Kelly, primer Secretario, sobre Henry Miller',
    tlSecA: 'Una ', tlSecAccent: 'Cronología', tlSecB: ' de la Hermandad',
    tlSub: 'Desde diez hombres en un cuarto rentado hasta el oficio que impulsa la red eléctrica moderna.',
    closeHa: 'Ahora tú cargas ', closeHb: 'esa tarjeta', closeHc: '.',
    closeP: 'Cada día caluroso en la zanja, cada turno de noche en el centro de datos, cada milla que recorres hacia la próxima llamada — eres parte de una línea de 130 años que llega directo hasta diez hombres en un cuarto rentado que se negaron a aceptar menos. A conectar, hermano.',
    closeA: 'Mira quién está contratando →',
    TL: [
      ['1890','La Chispa en San Luis','Electricistas que trabajaban en la Exposición de San Luis, cansados de jornadas largas y peligrosas por una paga miserable, forman la Unión Federal del Trabajo No. 5221 de la AFL con ayuda de la AFL. Un joven lineman, Henry Miller, es elegido presidente — pero sabe que un solo local no basta.'],
      ['1891','Nace la Hermandad','El 21 de noviembre, diez delegados que representan a 286 miembros se reúnen en San Luis y fundan la Hermandad Nacional de Trabajadores Eléctricos. Trabajan día y noche durante una semana redactando la primera constitución y el emblema que aún ves — un puño sujetando rayos. Miller es elegido primer Gran Presidente.'],
      ['1896','Cae Miller','Henry Miller muere a los 38 años tras una descarga eléctrica que lo hace caer de un poste. Le dio al oficio su sindicato y, al final, su vida a los mismos peligros que la Hermandad fue construida para combatir.'],
      ['1899','“Internacional”','A medida que se forman locales en Canadá además de EE.UU., el sindicato se convierte en la Hermandad Internacional de Trabajadores Eléctricos — el nombre que lleva hoy.'],
      ['1908','La División Reid-Murphy','Una amarga guerra interna — con raíces en la vieja tensión entre wiremen y linemen — fractura la Hermandad en dos IBEW rivales durante seis años. En un punto, la facción separatista afirmaba tener tres cuartas partes de todos los trabajadores eléctricos organizados. Estuvo a punto de acabar con el sindicato.'],
      ['1912','De Nuevo Unida','Un tribunal declara ilegal la convención separatista de 1908, y la Hermandad se reúne. La experiencia cercana a la muerte dejó una lección duradera sobre el costo de la división.'],
      ['1919-20','El Consejo de Relaciones Industriales','La membresía explota de 23,500 en 1913 a más de 148,000 para 1919. El IBEW y los contratistas eléctricos crean el Consejo de Relaciones Industriales — un cuerpo conjunto para resolver disputas sin huelgas, un modelo de relación obrero-patronal que aún funciona hoy. La sede se traslada a Washington, D.C.'],
      ['1941','Normas Nacionales de Aprendizaje','El IBEW ayuda a establecer normas nacionales de aprendizaje — el modelo de aprender-mientras-ganas que hizo del electricista sindical un sinónimo de destreza y seguridad.'],
      ['Años 80','La Disolución de AT&T','La disolución ordenada por un tribunal del sistema Bell elimina decenas de miles de empleos de telecomunicaciones del IBEW casi de la noche a la mañana — uno de los golpes más duros que la Hermandad jamás absorbió, y una dura lección sobre adaptarse a una industria cambiante.'],
      ['Hoy','Conectados para lo que Viene','Más de 900,000 miembros en EE.UU., Canadá y más allá. El auge de los centros de datos y la energía limpia impulsa la mayor demanda de mano de obra eléctrica calificada en una generación — y la Hermandad va de nuevo tras el millón de miembros. El camino está abierto de par en par, y tú estás en él.'],
    ]
  };
  const D = lang === 'es' ? ES : EN;
  const title = D.title;
  const desc = D.desc;
  const urlPath = (lang === 'es' ? '/es/' : '/') + 'ibewhistory';
  const HS = `
  .h-lead{font-size:18px;line-height:1.7;margin:0 0 8px}.h-lead b{color:var(--navy)}
  .h-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:30px 0 30px}
  .h-stat{background:var(--card);border:1px solid var(--line);border-top:3px solid var(--orange);border-radius:12px;padding:18px 12px;text-align:center}
  .h-stat .n{font-family:'Space Grotesk',sans-serif;font-size:28px;font-weight:700;color:var(--navy);line-height:1}
  .h-stat .l{font-size:11.5px;color:var(--slate);margin-top:7px;font-weight:500}
  .h-pull{border-left:3px solid var(--orange);background:var(--card);padding:14px 18px;margin:22px 0 34px;border-radius:0 10px 10px 0;font-size:15px;font-style:italic;color:var(--navy)}
  .h-sect{font-family:'Space Grotesk',sans-serif;font-size:25px;color:var(--navy);font-weight:700;margin:8px 0 4px;letter-spacing:-.01em}
  .h-sect .accent{color:var(--orange)}
  .h-sub{color:var(--slate);font-size:14px;margin-bottom:24px}
  .h-tl{border-left:2px solid var(--line);margin-left:8px}
  .h-i{position:relative;padding:0 0 26px 28px}
  .h-i:before{content:'';position:absolute;left:-7px;top:4px;width:12px;height:12px;border-radius:50%;background:var(--orange);border:2px solid var(--bg)}
  .h-y{font-family:'Space Grotesk',sans-serif;font-weight:700;color:var(--orange);font-size:15px}
  .h-e{font-weight:700;color:var(--navy);font-size:16px;margin:2px 0 4px}
  .h-d{color:var(--charcoal);font-size:14.5px;line-height:1.6}
  .h-close{background:var(--navy);color:#fff;border-radius:16px;padding:30px 32px;margin-top:44px;text-align:center}
  .h-close h3{font-family:'Space Grotesk',sans-serif;font-size:22px;margin-bottom:10px}.h-close h3 b{color:var(--orange)}
  .h-close p{color:#c6d6ef;font-size:15px;max-width:580px;margin:0 auto 18px;line-height:1.6}
  .h-close a{display:inline-block;background:var(--orange);color:#fff;text-decoration:none;font-weight:700;padding:11px 22px;border-radius:10px;font-size:14px}
  @media(max-width:640px){.h-stats{grid-template-columns:repeat(2,1fr)}}`;
  const tl = D.TL.map(t => `<div class="h-i"><div class="h-y">${t[0]}</div><div class="h-e">${esc(t[1])}</div><div class="h-d">${esc(t[2])}</div></div>`).join('');
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${CANON}${urlPath}">
${hreflangTags('ibewhistory')}
<meta property="og:type" content="article"><meta property="og:site_name" content="TrampHereBro">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${CANON}${urlPath}"><meta property="og:image" content="${CANON}/share-banner.png">
<meta name="twitter:card" content="summary_large_image">
${FAVICON_LINK}
${FONTS}${GA_TAG}
<style>${CSS}${HS}</style>
</head><body>
${topbar('ibewhistory', lang)}
<header><div class="hero-inner">
<div class="crumbs"><a href="${lhref('', lang)}">${lang === 'es' ? 'Tablero' : 'Board'}</a> \u203a ${D.crumb}</div>
<div class="kick"><span class="dot"></span>${D.kick}</div>
<h1 class="lede">${D.h1a}<b>${D.h1b}</b></h1>
<div class="hsub">${D.hsub}</div>
</div></header>
<main class="wrap">
<p class="h-lead">${D.lead}</p>
<div class="h-stats">${D.stats.map(s => `<div class="h-stat"><div class="n">${s[0]}</div><div class="l">${esc(s[1])}</div></div>`).join('')}</div>
<div class="h-pull">${D.pull}</div>
<div class="h-sect">${D.tlSecA}<span class="accent">${D.tlSecAccent}</span>${D.tlSecB}</div>
<div class="h-sub">${D.tlSub}</div>
<div class="h-tl">${tl}</div>
<div class="h-close"><h3>${D.closeHa}<b>${D.closeHb}</b>${D.closeHc}</h3><p>${D.closeP}</p><a href="${lhref('', lang)}">${D.closeA}</a></div>
</main>
${footer(lang)}
</body></html>`;
}

function retirementPage(lang) {
  lang = lang || 'en';
  const STR = {
    en: {
      title: 'Union Retirement Explained — Pension vs Annuity vs 401(k) | TrampHereBro',
      desc: 'How union retirement actually works, in plain English. The difference between a multiemployer pension, a defined-contribution annuity, and a 401(k) — plus vesting, and why reciprocity matters when you travel. A clear guide for the trades.',
      crumb: 'Union Retirement', kick: 'Know What You’re Building',
      h1a: 'Union Retirement, ', h1b: 'Explained',
      hsub: 'Pension, annuity, 401(k) — most hands don’t fully get how it fits together until they’re close to hanging it up. Here’s the plain-English version.',
      lead: 'Here’s the big thing nobody explains on day one: <b>you don’t retire on one check — you retire on three.</b> Every hour you work, your contract puts money into separate buckets that stack together when you’re done. Understanding those three buckets is the whole game.',
      b1n: 'BUCKET 1', b1t: 'Pension', b1d: 'A monthly check for life',
      b2n: 'BUCKET 2', b2t: 'Annuity', b2d: 'A pot of money that’s yours',
      b3n: 'BUCKET 3', b3t: '401(k) / Savings', b3d: 'What you stack on top',
      note0: 'Three streams → <b>one retirement paycheck.</b> Tap each below to see how it works.',
      seca: 'The ', secb: 'Three Buckets', secs: 'Tap any one to expand the plain-English breakdown.',
      acc1s: '1. The Pension',
      acc1: '<p>Your pension is a <b>defined-benefit</b> plan — meaning it pays you a set monthly amount for the rest of your life once you retire, no matter how long you live. Most trades run a <b>multiemployer</b> (or “Taft-Hartley”) pension: it’s jointly run by the union and the contractors, funded by a set amount your employers pay in for every hour you work.</p><p>Because it follows your <b>hours</b> and not any one employer, you keep building the same pension whether you work for ten contractors or one. It’s governed by federal law (ERISA) and backstopped by a government insurer (the PBGC) if a fund ever runs into trouble.</p><p><b>Bottom line:</b> the more credited hours you bank over your career, the bigger that monthly check.</p>',
      acc2s: '2. The Annuity',
      acc2: '<p>The annuity is a <b>defined-contribution</b> plan — a pot of money that belongs to you. Your employers pay a set amount per hour into your individual account, it gets invested, and it grows over your career.</p><p>Unlike the pension (a monthly check), the annuity is a <b>balance</b> — a real number you can watch grow. When you retire you can typically take it as a lump sum, roll it over, or draw it down. It’s yours.</p>',
      acc3s: '3. The 401(k) &amp; Personal Savings',
      acc3: '<p>Many locals also offer a <b>401(k)</b> you can contribute to out of your own check, sometimes on top of the annuity. This is the bucket <b>you</b> control — what you choose to set aside. Combined with anything outside the trade (an IRA, a spouse’s plan), it’s the layer that’s fully in your hands.</p>',
      recTag: 'FOR TRAVELERS', recH: 'Reciprocity: Don’t Leave Your Hours on the Road',
      recP1: 'This is the one every tramp needs to understand. When you travel and work in another local’s jurisdiction, that local’s funds collect pension and annuity money on your hours. <b>Reciprocity</b> is the agreement that sends that money back to your <b>home</b> funds — so the hours you work on the road still build <b>your</b> pension.',
      recP2: 'It is <b>not always automatic.</b> Many funds require you to sign a reciprocity authorization, sometimes for each local you travel to. Miss it, and your money can sit in a fund you’ll never draw from. <b>Sign your reciprocity paperwork every time you go on the road</b> — it’s the difference between hours that count and hours that vanish.',
      stgSecA: 'What to Do at ', stgSecB: 'Each Stage', stgSecs: 'A quick gut-check for wherever you are in your career.',
      st1s: 'Apprentice', st1p: 'You’re already vesting. Learn the three buckets now, and start any 401(k) match you can — time is the one thing you can’t buy back later.',
      st2s: 'Journeyman', st2p: 'Track your credited hours. Sign reciprocity every time you travel. Check your annuity balance yearly — know your numbers.',
      st3s: 'Nearing Retirement', st3p: 'Request an estimate from your fund office. Understand your pension options (single vs. survivor) before you sign anything — they’re usually permanent.',
      guard: '<b>One important note:</b> this is a plain-English guide to how union retirement generally works — not financial advice, and the exact rules, contribution rates, and vesting schedules vary by fund. For your actual numbers and options, contact your <b>pension fund office</b> and read your plan’s <b>Summary Plan Description (SPD)</b>. When it’s time to retire, those are the people to talk to.',
      closeHa: 'You earned ', closeHb: 'every hour', closeHc: ' of it.',
      closeP: 'The work is hard on the body. The payoff is a retirement most people never get — a check for life, a pot of money, and savings on top. Know how it works, protect your hours, and it’ll be there when you hang up the tools.',
      closeA: 'Back to the board →'
    },
    es: {
      title: 'La Jubilación Sindical Explicada — Pensión vs Anualidad vs 401(k) | TrampHereBro',
      desc: 'Cómo funciona realmente la jubilación sindical, en palabras claras. La diferencia entre una pensión multipatronal, una anualidad de contribución definida y un 401(k) — además de la consolidación (vesting) y por qué la reciprocidad importa cuando viajas. Una guía clara para los oficios.',
      crumb: 'Jubilación Sindical', kick: 'Conoce lo que Estás Construyendo',
      h1a: 'La Jubilación Sindical, ', h1b: 'Explicada',
      hsub: 'Pensión, anualidad, 401(k) — la mayoría de los trabajadores no entienden del todo cómo encaja hasta que están cerca de colgar las herramientas. Aquí está la versión en palabras claras.',
      lead: 'Esto es lo grande que nadie te explica el primer día: <b>no te jubilas con un solo cheque — te jubilas con tres.</b> Cada hora que trabajas, tu contrato deposita dinero en cubetas separadas que se suman cuando terminas. Entender esas tres cubetas es todo el juego.',
      b1n: 'CUBETA 1', b1t: 'Pensión', b1d: 'Un cheque mensual de por vida',
      b2n: 'CUBETA 2', b2t: 'Anualidad', b2d: 'Un fondo de dinero que es tuyo',
      b3n: 'CUBETA 3', b3t: '401(k) / Ahorros', b3d: 'Lo que acumulas encima',
      note0: 'Tres flujos → <b>un solo cheque de jubilación.</b> Toca cada uno abajo para ver cómo funciona.',
      seca: 'Las ', secb: 'Tres Cubetas', secs: 'Toca cualquiera para ver el desglose en palabras claras.',
      acc1s: '1. La Pensión',
      acc1: '<p>Tu pensión es un plan de <b>beneficio definido</b> — es decir, te paga una cantidad mensual fija por el resto de tu vida una vez que te jubilas, sin importar cuánto vivas. La mayoría de los oficios manejan una pensión <b>multipatronal</b> (o “Taft-Hartley”): la administran en conjunto el sindicato y los contratistas, y se financia con una cantidad fija que tus empleadores aportan por cada hora que trabajas.</p><p>Como sigue tus <b>horas</b> y no a un solo empleador, sigues construyendo la misma pensión ya sea que trabajes para diez contratistas o para uno. Se rige por la ley federal (ERISA) y está respaldada por un asegurador del gobierno (la PBGC) si un fondo llegara a tener problemas.</p><p><b>En resumen:</b> entre más horas acreditadas acumules a lo largo de tu carrera, más grande será ese cheque mensual.</p>',
      acc2s: '2. La Anualidad',
      acc2: '<p>La anualidad es un plan de <b>contribución definida</b> — un fondo de dinero que te pertenece. Tus empleadores depositan una cantidad fija por hora en tu cuenta individual, se invierte, y crece a lo largo de tu carrera.</p><p>A diferencia de la pensión (un cheque mensual), la anualidad es un <b>saldo</b> — un número real que puedes ver crecer. Cuando te jubilas, normalmente puedes tomarlo como una suma global, transferirlo, o retirarlo poco a poco. Es tuyo.</p>',
      acc3s: '3. El 401(k) y los Ahorros Personales',
      acc3: '<p>Muchos locales también ofrecen un <b>401(k)</b> al que puedes contribuir de tu propio cheque, a veces además de la anualidad. Esta es la cubeta que <b>tú</b> controlas — lo que decides apartar. Combinada con cualquier cosa fuera del oficio (una IRA, el plan de tu cónyuge), es la capa que está totalmente en tus manos.</p>',
      recTag: 'PARA VIAJEROS', recH: 'Reciprocidad: No Dejes tus Horas en el Camino',
      recP1: 'Esta es la que todo viajero necesita entender. Cuando viajas y trabajas en la jurisdicción de otro local, los fondos de ese local recaudan el dinero de pensión y anualidad sobre tus horas. La <b>reciprocidad</b> es el acuerdo que envía ese dinero de vuelta a tus fondos de <b>casa</b> — para que las horas que trabajas en el camino sigan construyendo <b>tu</b> pensión.',
      recP2: '<b>No siempre es automática.</b> Muchos fondos requieren que firmes una autorización de reciprocidad, a veces por cada local al que viajas. Si se te pasa, tu dinero puede quedarse en un fondo del que nunca vas a cobrar. <b>Firma tu papeleo de reciprocidad cada vez que salgas al camino</b> — es la diferencia entre horas que cuentan y horas que desaparecen.',
      stgSecA: 'Qué Hacer en ', stgSecB: 'Cada Etapa', stgSecs: 'Una revisión rápida para donde sea que estés en tu carrera.',
      st1s: 'Aprendiz', st1p: 'Ya estás consolidando (vesting). Aprende las tres cubetas ahora, y comienza cualquier aportación equivalente (match) de 401(k) que puedas — el tiempo es lo único que no puedes recuperar después.',
      st2s: 'Oficial', st2p: 'Lleva la cuenta de tus horas acreditadas. Firma la reciprocidad cada vez que viajas. Revisa el saldo de tu anualidad cada año — conoce tus números.',
      st3s: 'Cerca de la Jubilación', st3p: 'Pide un estimado a la oficina de tu fondo. Entiende tus opciones de pensión (individual vs. de sobreviviente) antes de firmar nada — normalmente son permanentes.',
      guard: '<b>Una nota importante:</b> esta es una guía en palabras claras sobre cómo funciona en general la jubilación sindical — no es asesoría financiera, y las reglas exactas, las tasas de contribución y los calendarios de consolidación (vesting) varían según el fondo. Para tus números y opciones reales, comunícate con la <b>oficina de tu fondo de pensión</b> y lee la <b>Descripción Resumida del Plan (SPD)</b>. Cuando llegue el momento de jubilarte, esas son las personas con quienes debes hablar.',
      closeHa: 'Te ganaste ', closeHb: 'cada hora', closeHc: '.',
      closeP: 'El trabajo es duro para el cuerpo. La recompensa es una jubilación que la mayoría de la gente nunca obtiene — un cheque de por vida, un fondo de dinero, y ahorros encima. Entiende cómo funciona, protege tus horas, y estará ahí cuando cuelgues las herramientas.',
      closeA: 'Volver al tablero →'
    }
  };
  const L = STR[lang] || STR.en;
  const title = L.title;
  const desc = L.desc;
  const urlPath = (lang === 'es' ? '/es/' : '/') + 'unionretirement';
  const HS = `
  .r-lead{font-size:18px;line-height:1.7;margin-bottom:28px}.r-lead b{color:var(--navy)}
  .r-stack{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px}
  .r-st{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 14px;text-align:center}
  .r-st .num{font-family:'Space Grotesk',sans-serif;font-size:12px;font-weight:700;color:var(--orange);letter-spacing:.05em}
  .r-st .t{font-weight:700;color:var(--navy);font-size:15px;margin:6px 0 4px}
  .r-st .d{font-size:12.5px;color:var(--slate)}
  .r-note0{text-align:center;color:var(--slate);font-size:13px;margin-bottom:34px}.r-note0 b{color:var(--orange)}
  .r-sec{font-family:'Space Grotesk',sans-serif;font-size:24px;color:var(--navy);font-weight:700;margin:0 0 4px}.r-sec .a{color:var(--orange)}
  .r-secs{color:var(--slate);font-size:14px;margin-bottom:18px}
  .r-acc{border:1px solid var(--line);border-radius:12px;background:var(--card);margin-bottom:10px;overflow:hidden}
  .r-acc summary{list-style:none;cursor:pointer;padding:16px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-weight:700;color:var(--navy);font-size:15.5px}
  .r-acc summary::-webkit-details-marker{display:none}
  .r-acc summary .chev{width:18px;height:18px;transition:transform .2s;color:var(--orange);flex-shrink:0}
  .r-acc[open] summary .chev{transform:rotate(180deg)}
  .r-acc .body{padding:0 18px 17px;color:var(--charcoal);font-size:14.5px;line-height:1.7}
  .r-acc .body p{margin-bottom:10px}.r-acc .body p:last-child{margin-bottom:0}.r-acc .body b{color:var(--navy)}
  .r-recip{background:linear-gradient(135deg,#fff7f0,#fff);border:1px solid rgba(255,107,0,.35);border-left:4px solid var(--orange);border-radius:14px;padding:22px 24px;margin:30px 0}
  .r-recip .tag{display:inline-block;background:var(--orange);color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;letter-spacing:.04em;margin-bottom:10px}
  .r-recip h3{font-family:'Space Grotesk',sans-serif;color:var(--navy);font-size:20px;margin-bottom:8px}
  .r-recip p{font-size:15px;line-height:1.7;margin-bottom:10px}.r-recip p:last-child{margin-bottom:0}.r-recip b{color:var(--orange)}
  .r-stages{display:grid;gap:10px;margin-top:6px}
  .r-stage{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;border-left:3px solid var(--orange)}
  .r-stage .s{font-weight:700;color:var(--navy);font-size:14.5px}.r-stage .p{color:var(--slate);font-size:13.5px;margin-top:2px}
  .r-guard{background:#f1f5f9;border-radius:10px;padding:14px 16px;font-size:13.5px;color:var(--slate);margin-top:26px}.r-guard b{color:var(--navy)}
  .r-close{background:var(--navy);color:#fff;border-radius:16px;padding:28px 30px;margin-top:34px;text-align:center}
  .r-close h3{font-family:'Space Grotesk',sans-serif;font-size:21px;margin-bottom:9px}.r-close h3 b{color:var(--orange)}
  .r-close p{color:#c6d6ef;font-size:14.5px;max-width:540px;margin:0 auto 16px;line-height:1.6}
  .r-close a{display:inline-block;background:var(--orange);color:#fff;text-decoration:none;font-weight:700;padding:11px 22px;border-radius:10px;font-size:14px}
  @media(max-width:640px){.r-stack{grid-template-columns:1fr}}`;
  const CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>';
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${CANON}${urlPath}">
${hreflangTags('unionretirement')}
<meta property="og:type" content="article"><meta property="og:site_name" content="TrampHereBro">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${CANON}${urlPath}"><meta property="og:image" content="${CANON}/share-banner.png">
<meta name="twitter:card" content="summary_large_image">
${FAVICON_LINK}
${FONTS}${GA_TAG}
<style>${CSS}${HS}</style>
</head><body>
${topbar('unionretirement', lang)}
<header><div class="hero-inner">
<div class="crumbs"><a href="${lhref('', lang)}">${lang === 'es' ? 'Tablero' : 'Board'}</a> \u203a ${L.crumb}</div>
<div class="kick"><span class="dot"></span>${L.kick}</div>
<h1 class="lede">${L.h1a}<b>${L.h1b}</b></h1>
<div class="hsub">${L.hsub}</div>
</div></header>
<main class="wrap">
<p class="r-lead">${L.lead}</p>
<div class="r-stack">
<div class="r-st"><div class="num">${L.b1n}</div><div class="t">${L.b1t}</div><div class="d">${L.b1d}</div></div>
<div class="r-st"><div class="num">${L.b2n}</div><div class="t">${L.b2t}</div><div class="d">${L.b2d}</div></div>
<div class="r-st"><div class="num">${L.b3n}</div><div class="t">${L.b3t}</div><div class="d">${L.b3d}</div></div>
</div>
<div class="r-note0">${L.note0}</div>
<div class="r-sec">${L.seca}<span class="a">${L.secb}</span></div>
<div class="r-secs">${L.secs}</div>
<details class="r-acc" open><summary>${L.acc1s} ${CHEV}</summary>
<div class="body">${L.acc1}</div></details>
<details class="r-acc"><summary>${L.acc2s} ${CHEV}</summary>
<div class="body">${L.acc2}</div></details>
<details class="r-acc"><summary>${L.acc3s} ${CHEV}</summary>
<div class="body">${L.acc3}</div></details>
<div class="r-recip">
<div class="tag">${L.recTag}</div>
<h3>${L.recH}</h3>
<p>${L.recP1}</p>
<p>${L.recP2}</p>
</div>
<div class="r-sec">${L.stgSecA}<span class="a">${L.stgSecB}</span></div>
<div class="r-secs">${L.stgSecs}</div>
<div class="r-stages">
<div class="r-stage"><div class="s">${L.st1s}</div><div class="p">${L.st1p}</div></div>
<div class="r-stage"><div class="s">${L.st2s}</div><div class="p">${L.st2p}</div></div>
<div class="r-stage"><div class="s">${L.st3s}</div><div class="p">${L.st3p}</div></div>
</div>
<div class="r-guard">${L.guard}</div>
<div class="r-close"><h3>${L.closeHa}<b>${L.closeHb}</b>${L.closeHc}</h3><p>${L.closeP}</p><a href="${lhref('', lang)}">${L.closeA}</a></div>
</main>
${footer(lang)}
</body></html>`;
}

function uaHistoryPage(lang) {
  lang = lang || 'en';
  const EN = {
    title: 'The History of the UA — Plumbers & Pipefitters Union History | TrampHereBro',
    desc: 'How the United Association was built, in plain English. From its 1889 Washington founding and the Steamfitters War to the 1936 federal apprenticeship, Veterans in Piping, and today’s LNG and data-center boom — the story of the pipe trades for the traveling brotherhood.',
    keywords: 'UA history, United Association history, plumbers union history, pipefitters union history, pipe trades, steamfitters, union apprenticeship, traveling pipefitter',
    crumb: 'UA History', kick: 'The Pipe Trades’ Long Brotherhood',
    h1a: 'The History of the ', h1b: 'UA',
    hsub: 'From a war between plumbers and steamfitters to the trade building the LNG terminals and data centers — the story of the United Association.',
    lead: 'In 1889, delegates from a handful of feuding local pipe-trades unions met in Washington, D.C., and founded the <b>United Association of Journeymen Plumbers, Gas Fitters, Steam Fitters, and Steam Fitters’ Helpers</b>. The goal was simple and enormous: bind every pipe-trades local in North America into one body that could standardize the craft, protect traveling members, and bargain on equal footing with employers. It would take two decades and a brutal jurisdictional war to secure — but once it did, the UA became one of the most durable building-trades unions on the continent.',
    stats: [['1889','Founded in Washington, D.C.'],['396K+','Members today'],['~274','Local unions'],['130+','Years of the trade']],
    pull: '“Every fitting, every weld, every line that moves water, steam, or gas through a building — a UA hand put it there.”',
    tlSecA: 'A ', tlSecAccent: 'Timeline', tlSecB: ' of the Pipe Trades',
    tlSub: 'From feuding city locals to the backbone of the energy build-out.',
    closeHa: 'You keep it ', closeHb: 'flowing', closeHc: '.',
    closeP: 'Every mile you tramp to the next call, you’re part of a 130-year brotherhood that started with feuding city locals and built the pipe that runs a continent. Water, steam, gas, and now the energy of the future — the pipe trades move it all.',
    closeA: 'See who’s hiring →',
    ldHeadline: 'The History of the UA — Plumbers & Pipefitters Union History',
    TL: [
      ['Pre-1889','Three Crafts, Many Wars','Plumbers, steamfitters, and gas fitters organized city by city as America laid its first sewer systems and piped in gas and steam heat. Independent locals, no national body, and constant friction over who did which work.'],
      ['1889','The United Association Is Born','Delegates meet in Washington, D.C., and charter the United Association of Journeymen Plumbers, Gas Fitters, Steam Fitters, and Steam Fitters’ Helpers — uniting every pipe-trades local under one national banner: standardized craft, protected travelers, shared apprenticeship.'],
      ['1890s-1900s','P.J. Quinlan & the Steamfitters’ War','A bitter jurisdictional fight between plumbers and steamfitters nearly tore the young union apart. It took the intervention of the American Federation of Labor — and leaders like P.J. Quinlan — to finally settle who controlled pipe work and bind the crafts together for good.'],
      ['1936','Federal Apprenticeship Standards','The UA helps establish federally recognized apprenticeship — the earn-while-you-learn model that made the union pipefitter and plumber a byword for skill, and still trains the trade today.'],
      ['Postwar','The Peak of the Pipe Trades','The postwar building boom — refineries, power plants, high-rises, industrial expansion — drove the UA to its peak. Pipefitters and welders became indispensable to America’s heavy industry.'],
      ['2008','Veterans in Piping','The UA launches the Veterans in Piping (VIP) program, placing thousands of transitioning service members directly into journey-track careers in welding and the pipe trades — one of the most respected veteran-to-trade pipelines in the country.'],
      ['Today','Building the Energy Transition','Around 396,000 members across roughly 274 locals. The UA’s welders and pipefitters are building the LNG export terminals, the data centers, the semiconductor fabs, and the energy infrastructure of the modern era. Quietly, the pipe trades shape the physical backbone of what comes next.'],
    ]
  };
  const ES = {
    title: 'La Historia de la UA — Historia del Sindicato de Plomeros y Pipefitters | TrampHereBro',
    desc: 'Cómo se construyó la United Association, en palabras claras. Desde su fundación en Washington en 1889 y la Guerra de los Steamfitters hasta el aprendizaje federal de 1936, Veteranos en la Tubería (VIP), y el auge actual del GNL y los centros de datos — la historia de los oficios de la tubería para la hermandad viajera.',
    keywords: 'historia de la UA, historia United Association, historia sindicato plomeros, historia sindicato pipefitters, oficios de la tubería, steamfitters, aprendizaje sindical, pipefitter viajero',
    crumb: 'Historia de la UA', kick: 'La Larga Hermandad de los Oficios de la Tubería',
    h1a: 'La Historia de la ', h1b: 'UA',
    hsub: 'Desde una guerra entre plomeros y steamfitters hasta el oficio que construye las terminales de GNL y los centros de datos — la historia de la United Association.',
    lead: 'En 1889, delegados de un puñado de sindicatos locales de los oficios de la tubería en pugna se reunieron en Washington, D.C., y fundaron la <b>United Association of Journeymen Plumbers, Gas Fitters, Steam Fitters, and Steam Fitters’ Helpers</b>. La meta era simple y enorme: unir a cada local de los oficios de la tubería en Norteamérica en un solo cuerpo que pudiera estandarizar el oficio, proteger a los miembros viajeros, y negociar en igualdad de condiciones con los empleadores. Tomaría dos décadas y una brutal guerra jurisdiccional lograrlo — pero una vez que lo hizo, la UA se convirtió en uno de los sindicatos de la construcción más duraderos del continente.',
    stats: [['1889','Fundada en Washington, D.C.'],['396K+','Miembros hoy'],['~274','Sindicatos locales'],['130+','Años del oficio']],
    pull: '“Cada conexión, cada soldadura, cada línea que mueve agua, vapor o gas por un edificio — una mano de la UA la puso ahí.”',
    tlSecA: 'Una ', tlSecAccent: 'Cronología', tlSecB: ' de los Oficios de la Tubería',
    tlSub: 'Desde locales urbanos en pugna hasta la columna vertebral de la expansión energética.',
    closeHa: 'Tú lo mantienes ', closeHb: 'fluyendo', closeHc: '.',
    closeP: 'Cada milla que recorres hacia la próxima llamada, eres parte de una hermandad de 130 años que empezó con locales urbanos en pugna y construyó la tubería que hace funcionar un continente. Agua, vapor, gas, y ahora la energía del futuro — los oficios de la tubería lo mueven todo.',
    closeA: 'Mira quién está contratando →',
    ldHeadline: 'La Historia de la UA — Historia del Sindicato de Plomeros y Pipefitters',
    TL: [
      ['Antes de 1889','Tres Oficios, Muchas Guerras','Plomeros, steamfitters y gasfitters se organizaban ciudad por ciudad mientras Estados Unidos tendía sus primeros sistemas de alcantarillado y llevaba gas y calefacción por vapor. Locales independientes, sin cuerpo nacional, y fricción constante sobre quién hacía cuál trabajo.'],
      ['1889','Nace la United Association','Los delegados se reúnen en Washington, D.C., y fundan la United Association of Journeymen Plumbers, Gas Fitters, Steam Fitters, and Steam Fitters’ Helpers — uniendo a cada local de los oficios de la tubería bajo una sola bandera nacional: oficio estandarizado, viajeros protegidos, aprendizaje compartido.'],
      ['1890s-1900s','P.J. Quinlan y la Guerra de los Steamfitters','Una amarga pelea jurisdiccional entre plomeros y steamfitters casi destroza al joven sindicato. Hizo falta la intervención de la Federación Americana del Trabajo — y de líderes como P.J. Quinlan — para finalmente definir quién controlaba el trabajo de tubería y unir los oficios para siempre.'],
      ['1936','Normas Federales de Aprendizaje','La UA ayuda a establecer el aprendizaje reconocido a nivel federal — el modelo de aprender-mientras-ganas que hizo del pipefitter y plomero sindical un sinónimo de destreza, y que aún entrena al oficio hoy.'],
      ['Posguerra','El Auge de los Oficios de la Tubería','El auge de la construcción de posguerra — refinerías, plantas de energía, rascacielos, expansión industrial — llevó a la UA a su punto máximo. Los pipefitters y soldadores se volvieron indispensables para la industria pesada de Estados Unidos.'],
      ['2008','Veteranos en la Tubería (VIP)','La UA lanza el programa Veterans in Piping (VIP), colocando a miles de militares en transición directamente en carreras de camino al oficial en soldadura y los oficios de la tubería — uno de los caminos de veterano-a-oficio más respetados del país.'],
      ['Hoy','Construyendo la Transición Energética','Alrededor de 396,000 miembros en unos 274 locales. Los soldadores y pipefitters de la UA están construyendo las terminales de exportación de GNL, los centros de datos, las fábricas de semiconductores, y la infraestructura energética de la era moderna. Silenciosamente, los oficios de la tubería dan forma a la espina dorsal física de lo que viene.'],
    ]
  };
  const D = lang === 'es' ? ES : EN;
  const title = D.title;
  const desc = D.desc;
  const urlPath = (lang === 'es' ? '/es/' : '/') + 'uahistory';
  const HS = `
  .h-lead{font-size:18px;line-height:1.7;margin:0 0 8px}.h-lead b{color:var(--navy)}
  .h-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:30px 0 30px}
  .h-stat{background:var(--card);border:1px solid var(--line);border-top:3px solid var(--orange);border-radius:12px;padding:18px 12px;text-align:center}
  .h-stat .n{font-family:'Space Grotesk',sans-serif;font-size:28px;font-weight:700;color:var(--navy);line-height:1}
  .h-stat .l{font-size:11.5px;color:var(--slate);margin-top:7px;font-weight:500}
  .h-pull{border-left:3px solid var(--orange);background:var(--card);padding:14px 18px;margin:22px 0 34px;border-radius:0 10px 10px 0;font-size:15px;font-style:italic;color:var(--navy)}
  .h-sect{font-family:'Space Grotesk',sans-serif;font-size:25px;color:var(--navy);font-weight:700;margin:8px 0 4px;letter-spacing:-.01em}
  .h-sect .accent{color:var(--orange)}
  .h-sub{color:var(--slate);font-size:14px;margin-bottom:24px}
  .h-tl{border-left:2px solid var(--line);margin-left:8px}
  .h-i{position:relative;padding:0 0 26px 28px}
  .h-i:before{content:'';position:absolute;left:-7px;top:4px;width:12px;height:12px;border-radius:50%;background:var(--orange);border:2px solid var(--bg)}
  .h-y{font-family:'Space Grotesk',sans-serif;font-weight:700;color:var(--orange);font-size:15px}
  .h-e{font-weight:700;color:var(--navy);font-size:16px;margin:2px 0 4px}
  .h-d{color:var(--charcoal);font-size:14.5px;line-height:1.6}
  .h-close{background:var(--navy);color:#fff;border-radius:16px;padding:30px 32px;margin-top:44px;text-align:center}
  .h-close h3{font-family:'Space Grotesk',sans-serif;font-size:22px;margin-bottom:10px}.h-close h3 b{color:var(--orange)}
  .h-close p{color:#c6d6ef;font-size:15px;max-width:580px;margin:0 auto 18px;line-height:1.6}
  .h-close a{display:inline-block;background:var(--orange);color:#fff;text-decoration:none;font-weight:700;padding:11px 22px;border-radius:10px;font-size:14px}
  @media(max-width:640px){.h-stats{grid-template-columns:repeat(2,1fr)}}`;
  const tl = D.TL.map(t => `<div class="h-i"><div class="h-y">${t[0]}</div><div class="h-e">${esc(t[1])}</div><div class="h-d">${esc(t[2])}</div></div>`).join('');
  const ld = {
    "@context":"https://schema.org","@type":"Article",
    "headline":D.ldHeadline,
    "inLanguage":lang,
    "about":["United Association","UA union history","plumbers and pipefitters union","pipe trades history"],
    "author":{"@type":"Person","name":"Noah \u2014 Spanky The Sparky"},
    "publisher":{"@type":"Organization","name":"TrampHereBro"},
    "mainEntityOfPage":CANON+urlPath,
    "description":desc
  };
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta name="keywords" content="${esc(D.keywords)}">
<link rel="canonical" href="${CANON}${urlPath}">
${hreflangTags('uahistory')}
<meta property="og:type" content="article"><meta property="og:site_name" content="TrampHereBro">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${CANON}${urlPath}"><meta property="og:image" content="${CANON}/share-banner.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
${FAVICON_LINK}
${FONTS}${GA_TAG}
<style>${CSS}${HS}</style>
</head><body>
${topbar('uahistory', lang)}
<header><div class="hero-inner">
<div class="crumbs"><a href="${lhref('', lang)}">${lang === 'es' ? 'Tablero' : 'Board'}</a> \u203a ${D.crumb}</div>
<div class="kick"><span class="dot"></span>${D.kick}</div>
<h1 class="lede">${D.h1a}<b>${D.h1b}</b></h1>
<div class="hsub">${D.hsub}</div>
</div></header>
<main class="wrap">
<p class="h-lead">${D.lead}</p>
<div class="h-stats">${D.stats.map(s => `<div class="h-stat"><div class="n">${s[0]}</div><div class="l">${esc(s[1])}</div></div>`).join('')}</div>
<div class="h-pull">${D.pull}</div>
<div class="h-sect">${D.tlSecA}<span class="accent">${D.tlSecAccent}</span>${D.tlSecB}</div>
<div class="h-sub">${D.tlSub}</div>
<div class="h-tl">${tl}</div>
<div class="h-close"><h3>${D.closeHa}<b>${D.closeHb}</b>${D.closeHc}</h3><p>${D.closeP}</p><a href="${lhref('', lang)}">${D.closeA}</a></div>
</main>
${footer(lang)}
</body></html>`;
}

function snapshotPage(text, textLine) {
  const title = 'IBEW Trampin Snapshot — Daily Job Call Update | TrampHereBro';
  const desc = `Today's IBEW traveler snapshot: top-paying locals, the biggest boards, and where the data-center work is right now. Updated ${PRETTY_DATE}.`;
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${CANON}/snapshot">
<meta property="og:type" content="article"><meta property="og:site_name" content="TrampHereBro">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${CANON}/snapshot"><meta property="og:image" content="${CANON}/share-banner.png">
<meta name="twitter:card" content="summary_large_image">
${FAVICON_LINK}
${FONTS}${GA_TAG}
<style>${CSS}</style>
</head><body>
${topbar('snapshot')}
<header><div class="hero-inner">
<div class="crumbs"><a href="/">Board</a> › Daily Update</div>
<div class="kick"><span class="dot"></span>Updated ${esc(PRETTY_DATE)}</div>
<h1 class="lede">Trampin <b>Day in Review</b></h1>
<div class="hsub">Where the work is right now — top-paying locals, the biggest boards, and the projects driving demand, pulled live from union dispatch.</div>
</div></header>
<main class="wrap">
${snapTradeBlock(text, textLine)}
<div class="snap-date">Updated ${esc(PRETTY_DATE)} · generated from live union dispatch data</div>
<div class="backbar" style="margin-top:26px"><a class="backbtn" href="/locals">Browse all locals →</a> &nbsp; <a class="backbtn" href="/">Live board →</a></div>
</main>
${footer()}
</body></html>`;
}

(async function main() {
  console.log('→ Fetching live data from Supabase…');
  const [locs, calls] = await Promise.all([
    supaGetAll('locals?select=*'),
    supaGetAll('job_calls?select=*&status=eq.open')
  ]);
  console.log(`  locals: ${locs.length}   open calls: ${calls.length}`);

  const callsByLocal = {};
  calls.forEach(c => { (callsByLocal[c.local_id] = callsByLocal[c.local_id] || []).push(c); });

  // rows = every local, with its (possibly empty) open-call list
  const ibewRows = locs
    .filter(l => l && (l.name || l.id) && (l.id || 0) < 20000)
    .map(l => ({ local: { ...l, name: cleanName(l.name, l.id), trade: 'IBEW' }, calls: (callsByLocal[l.id] || []) }));
  let UA = [];
  try { UA = JSON.parse(fs.readFileSync(UA_FILE, 'utf8')); } catch (e) { UA = []; }
  const uaRows = UA.map(u => ({ local: { ...u, trade: 'UA' }, calls: (callsByLocal[u.id] || []) }));
  let LINE = [];
  try { LINE = JSON.parse(fs.readFileSync(path.join(SITE_DIR, 'lineman-locals.json'), 'utf8')); } catch (e) { LINE = []; }
  const lineRows = LINE.map(u => ({ local: { ...u, trade: 'LINEMAN' }, calls: (callsByLocal[u.id] || []) }));
  const rows = [...ibewRows, ...uaRows, ...lineRows];
  console.log(`  IBEW: ${ibewRows.length}   UA: ${uaRows.length}   Lineman: ${lineRows.length}   total pages: ${rows.length}`);

  // never commit the API key
  try { const gi = path.join(SITE_DIR, '.gitignore'); let g = ''; try { g = fs.readFileSync(gi, 'utf8'); } catch (e) {} if (!/^\.env\s*$/m.test(g)) fs.writeFileSync(gi, (g ? g.replace(/\s*$/, '') + '\n' : '') + '.env\n'); } catch (e) {}

  // AI Work Outlook — one cached sentence per local with calls
  let OUTLOOKS = {};
  try { OUTLOOKS = JSON.parse(fs.readFileSync(OUTLOOK_CACHE, 'utf8')); } catch (e) { OUTLOOKS = {}; }
  if (!ANTHROPIC_KEY) console.log('  (no ANTHROPIC_API_KEY — skipping AI outlooks; pages still build)');
  let freshOutlooks = 0;
  for (const r of rows) {
    if (!r.calls.length) continue;
    const h = callsHash(r.calls);
    const cached = OUTLOOKS[r.local.id];
    if (cached && cached.hash === h) { r.local._outlook = cached.text; continue; }
    const txt = await generateOutlook(r.local, r.calls);
    if (txt) { OUTLOOKS[r.local.id] = { hash: h, text: txt }; r.local._outlook = txt; freshOutlooks++; }
    else if (cached) { r.local._outlook = cached.text; }
  }
  try { fs.writeFileSync(OUTLOOK_CACHE, JSON.stringify(OUTLOOKS, null, 0)); } catch (e) {}
  if (ANTHROPIC_KEY) console.log(`  generated ${freshOutlooks} new work outlook(s) via ${OUTLOOK_MODEL}`);

  // Daily Snapshots — inside + lineman, each cached by its own board hash
  let snapText = null, snapTextLine = null;
  const hIbew = callsHash(rows.filter(r => (r.local.trade || 'IBEW') === 'IBEW').flatMap(r => r.calls));
  const hLine = callsHash(rows.filter(r => r.local.trade === 'LINEMAN').flatMap(r => r.calls));
  let snapCache = {};
  try { snapCache = JSON.parse(fs.readFileSync(SNAPSHOT_CACHE, 'utf8')); } catch (e) {}
  if (snapCache.hash && snapCache.text && !snapCache.IBEW) snapCache = { IBEW: { hash: snapCache.hash, text: snapCache.text } };
  if (snapCache.IBEW && snapCache.IBEW.hash === hIbew) snapText = snapCache.IBEW.text;
  if (snapCache.LINEMAN && snapCache.LINEMAN.hash === hLine) snapTextLine = snapCache.LINEMAN.text;
  if (!snapText && ANTHROPIC_KEY) { snapText = await generateSnapshot(rows, 'IBEW'); if (snapText) { snapCache.IBEW = { hash: hIbew, text: snapText }; console.log('  generated inside snapshot via ' + SNAPSHOT_MODEL); } }
  if (!snapTextLine && ANTHROPIC_KEY) { snapTextLine = await generateSnapshot(rows, 'LINEMAN'); if (snapTextLine) { snapCache.LINEMAN = { hash: hLine, text: snapTextLine }; console.log('  generated lineman snapshot via ' + SNAPSHOT_MODEL); } }
  try { fs.writeFileSync(SNAPSHOT_CACHE, JSON.stringify(snapCache)); } catch (e) {}

  if (!fs.existsSync(LOCALS_DIR)) fs.mkdirSync(LOCALS_DIR, { recursive: true });

  // write favicon.png once (from the same hard-hat mark the homepage uses)
  const favPath = path.join(SITE_DIR, 'favicon.png');
  if (!fs.existsSync(favPath)) {
    try { fs.writeFileSync(favPath, Buffer.from(FAVICON_B64, 'base64')); console.log('  wrote favicon.png'); }
    catch (e) { console.log('  (favicon skipped)'); }
  }

  const ES_LOCALS_DIR = path.join(SITE_DIR, 'es', 'locals');
  if (!fs.existsSync(ES_LOCALS_DIR)) fs.mkdirSync(ES_LOCALS_DIR, { recursive: true });

  let written = 0, withCalls = 0;
  for (const r of rows) {
    const slug = slugFor(r.local.name, r.local.id, r.local.trade);
    fs.writeFileSync(path.join(LOCALS_DIR, slug + '.html'), localPage(r.local, r.calls, 'en'));
    fs.writeFileSync(path.join(ES_LOCALS_DIR, slug + '.html'), localPage(r.local, r.calls, 'es'));
    written++; if (r.calls.length) withCalls++;
  }
  fs.writeFileSync(path.join(LOCALS_DIR, 'index.html'), hubPage(rows, 'en'));
  fs.writeFileSync(path.join(ES_LOCALS_DIR, 'index.html'), hubPage(rows, 'es'));
  console.log('  wrote es/locals/ (' + written + ' pages + hub)');
  if (snapText) { fs.writeFileSync(path.join(SITE_DIR, 'snapshot.html'), snapshotPage(snapText, snapTextLine)); console.log('  wrote snapshot.html'); }
  const ES_DIR = path.join(SITE_DIR, 'es');
  if (!fs.existsSync(ES_DIR)) fs.mkdirSync(ES_DIR, { recursive: true });
  const BILINGUAL = [
    ['calculator', l => calculatorPage(rows, l)],
    ['unionhistory', historyPage],
    ['ibewhistory', ibewHistoryPage],
    ['uahistory', uaHistoryPage],
    ['unionretirement', retirementPage],
  ];
  for (const lang of LANGS) {
    const outDir = lang === 'es' ? ES_DIR : SITE_DIR;
    for (const [name, fn] of BILINGUAL) {
      fs.writeFileSync(path.join(outDir, name + '.html'), fn(lang));
      console.log('  wrote ' + (lang === 'es' ? 'es/' : '') + name + '.html');
    }
  }
  const totalOpen = rows.reduce((s, r) => s + r.calls.length, 0);
  const activeN = rows.filter(r => r.calls.length > 0).length;
  fs.writeFileSync(path.join(SITE_DIR, 'llms.txt'),
`# TrampHereBro
> Live union job-call board for traveling tradespeople — IBEW inside wiremen, IBEW linemen, and UA plumbers & pipefitters. ${totalOpen} open calls across ${activeN} active locals right now, plus journeyman wage scale and hall contact info for ${rows.length} locals across the US and Canada. Updated daily from hall dispatch pages.

## Key pages
- [Live board](${CANON}/): all open job calls, top locals, and today's snapshot
- [Daily snapshot](${CANON}/snapshot): editorial rundown of where the work is nationwide
- [All locals](${CANON}/locals): directory of every local with call counts, wage scale, and contact info
- [Sitemap](${CANON}/sitemap.xml): every local page

## About
TrampHereBro aggregates publicly posted union job calls so traveling inside wiremen (and, increasingly, other trades) can find work before calling the hall. Independent information platform; not affiliated with the IBEW, UA, or any union.
`);
  console.log('  wrote llms.txt');
  fs.writeFileSync(path.join(SITE_DIR, 'sitemap.xml'), sitemap(rows));

  // keep the homepage map + browse board in sync with Supabase
  const coords = await resolveCoords(rows);
  const mapCount = syncHomepageMap(rows, coords, snapText, snapTextLine);
  if (makeSpanishHome()) console.log('  wrote es/index.html');
  if (makeSpanishStatic('resources', ES_RESOURCES, META_RESOURCES)) console.log('  wrote es/resources.html');
  if (makeSpanishStatic('jnctn', ES_JNCTN, META_JNCTN)) console.log('  wrote es/jnctn.html');
  if (makeSpanishStatic('contact', ES_CONTACT, META_CONTACT)) console.log('  wrote es/contact.html');

  console.log(`\n✓ Wrote ${written} local pages (${withCalls} with open calls, ${written - withCalls} evergreen)`);
  console.log(`✓ Wrote locals/index.html hub`);
  console.log(`✓ Rebuilt sitemap.xml (${written + CORE_PAGES.length + 1} URLs)`);
  console.log(mapCount ? `✓ Synced homepage map + board (${mapCount} locals)` : '  (homepage map markers not found — skipped)');
  console.log(`\nNext:  git add . && git commit -m "Generate per-local pages" && git push`);
})().catch(e => { console.error('\n✗ FAILED:', e.message); process.exit(1); });
