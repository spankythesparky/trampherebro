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
const CORE_PAGES = ['', 'snapshot', 'jnctn', 'resources', 'contact']; // existing top-level pages, added to sitemap
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
const UA_FILE = path.join(SITE_DIR, 'ua-locals.json');
const TRADE = {
  IBEW: { name: 'IBEW', slug: 'ibew', worker: 'inside wireman', workers: 'inside wiremen' },
  UA:   { name: 'UA',   slug: 'ua',   worker: 'plumber & pipefitter', workers: 'plumbers, pipefitters & HVAC/R techs' }
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
  const pfx = (trade === 'UA') ? 'ua' : 'ibew';
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
.topbar .inner{max-width:1040px;margin:0 auto;padding:15px 28px;display:flex;align-items:center;justify-content:space-between;gap:14px}
.brand{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:22px;color:var(--navy);letter-spacing:-.02em}
.brand .b{color:var(--orange)}
.nav{display:flex;gap:22px;align-items:center}
.nav a{font-size:14px;font-weight:600;color:var(--slate);transition:color .15s}
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
const FAVICON_B64 = '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';
const FAVICON_LINK = `<link rel="icon" type="image/png" href="/favicon.png"><link rel="apple-touch-icon" href="/favicon.png">`;
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;450;500;600;700&display=swap" rel="stylesheet">`;

function topbar(active) {
  const on = p => active === p ? ' class="on"' : '';
  return `<div class="topbar"><div class="inner">
<a class="brand" href="/">Tramp<span class="b">Here</span>Bro</a>
<nav class="nav"><a href="/"${on('home')}>Board</a><a href="/snapshot"${on('snapshot')}>Daily Update</a><a href="/jnctn"${on('jnctn')}>JNCTN</a><a href="/resources"${on('resources')}>Resources</a><a href="/contact"${on('contact')}>Contact</a></nav>
</div></div>`;
}
function footer() {
  return `<footer><div class="inner"><div><b>TrampHereBro</b></div>
<div class="foot-updated"><span class="fu-dot"></span>Updated ${esc(PRETTY_DATE)}</div></div>
<div class="foot-legal"><p>TrampHereBro is an independent information platform. We have no affiliation with any union, labor organization, government entity, or industry group. All information is provided for educational purposes only.</p>
<p class="credit">Proudly made by Noah "<b>Spanky The Sparky</b>" — IBEW Journeyman</p><p class="copyright">© ${TODAY.getFullYear()} TrampHereBro. All rights reserved.</p></div></footer>`;
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
function callRow(c) {
  const cls = String(c.call_type || 'JW').replace(/inside\s*/i, '').trim() || 'JW';
  const parts = [];
  if (c.contractor) parts.push(`<b>${esc(c.contractor)}</b>`);
  if (c.num_needed) parts.push(`${c.num_needed} ${esc(cls)}`);
  const loc = [c.job_name, c.location].filter(Boolean).map(esc).join(' ');
  if (loc) parts.push(loc);
  if (c.duration) parts.push(esc(c.duration));
  const pay = (c.scale != null && c.scale !== '') ? '$' + Number(c.scale).toFixed(2) + '/hr'
            : (c.per_diem ? 'per diem ' + esc(c.per_diem) : 'scale');
  parts.push(`<span class="ocall-pay">${pay}</span>`);
  if (c.per_diem && c.scale != null && c.scale !== '') parts.push('per diem ' + esc(c.per_diem));
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

function localPage(local, calls) {
  const n = localNumber(local.name);
  const T = tradeOf(local);
  const _sc = (local.trade === 'UA') ? {} : (SCALE[localNumber(local.name)] || {});
  if (_sc.scale) local.jw_scale = _sc.scale;
  if (_sc.hw) local.hw = _sc.hw;
  const label = T.name + ' Local ' + (n || local.id);
  const place = [local.city, local.state].filter(Boolean).join(', ');
  const slug = slugFor(local.name, local.id, local.trade);
  const url = `${CANON}/locals/${slug}`;
  const hands = calls.reduce((s, c) => s + (Number(c.num_needed) || 0), 0);
  const hasCalls = calls.length > 0;

  const title = hasCalls
    ? `${label} Job Calls — ${calls.length} Open Calls, Scale & Dispatch | TrampHereBro`
    : `${label} Job Calls, Journeyman Scale & Dispatch${place ? ' — ' + place : ''} | TrampHereBro`;
  const desc = hasCalls
    ? `${calls.length} open ${label} job calls right now — ${hands} hands needed${local.jw_scale != null ? ', JW scale ' + money(local.jw_scale) + '/hr' : ''}. Contractor, per diem, and dispatch info for traveling ${T.workers}. Updated ${PRETTY_DATE}.`
    : `${label} job calls${local.jw_scale != null ? ', journeyman scale (' + money(local.jw_scale) + '/hr),' : ','} contact and dispatch info for traveling ${T.workers}${place ? ' in ' + place : ''}. No open calls posted right now — updated daily.`;

  // vitals
  const _ci = (local.trade === 'UA') ? {} : (CONTACT[localNumber(local.name)] || {});
  const cPhone = _ci.phone || local.phone || '';
  const cAddress = _ci.address || local.address || '';
  const cEmail = _ci.email || local.email || '';
  const cWebsite = _ci.website || local.website || '';
  const vit = (l, v, small) => `<div class="vit"><div class="l">${l}</div><div class="v${small ? ' small' : ''}">${v}</div></div>`;
  const _m = v => (v != null && v !== '' && !isNaN(Number(v))) ? '$' + Number(v).toFixed(2) : null;
  const _hr = '<span style="font-size:12px;color:var(--slate);font-weight:400">/hr</span>';
  const _scaleStr = _m(local.jw_scale);
  const _noPen = !_m(_sc.pension_def) && !_m(_sc.pension_dc) && !_m(_sc.nebf) && !_m(_sc.k401);
  const vitals = [
    _scaleStr ? vit('Journeyman Scale', _scaleStr + _hr) : '',
    _m(_sc.total) ? vit('Total Package', _m(_sc.total) + _hr) : '',
    _m(local.hw) ? vit('Health &amp; Welfare', _m(local.hw)) : '',
    _m(_sc.pension_def) ? vit('Defined Pension', _m(_sc.pension_def)) : '',
    _m(_sc.pension_dc) ? vit('Contribution Pension', _m(_sc.pension_dc)) : '',
    _m(_sc.nebf) ? vit('NEBF Pension', _m(_sc.nebf)) : '',
    _m(_sc.k401) ? vit('401(k)', _m(_sc.k401)) : '',
    (_noPen && local.pension != null) ? vit('Pension', money(local.pension), true) : '',
    _sc.vacation ? vit('Vacation', esc(_sc.vacation), true) : '',
    _sc.dues ? vit('Working Dues', esc(_sc.dues), true) : '',
    (local.book1 != null || local.book2 != null)
      ? vit('Books', `${local.book1 != null ? 'Bk1 ' + esc(local.book1) : ''}${(local.book1 != null && local.book2 != null) ? ' · ' : ''}${local.book2 != null ? 'Bk2 ' + esc(local.book2) : ''}` || '—', true)
      : ''
  ].filter(Boolean).join('');
  const wageUpdated = _sc.updated ? `<div style="font-size:11.5px;color:var(--slate);margin-top:16px;padding-top:12px;border-top:1px solid var(--line2)">Wage package last updated ${esc(_sc.updated)} · Wage data via <a href="https://www.unionpayscales.com" target="_blank" rel="noopener" style="color:var(--slate);text-decoration:underline">unionpayscales.com</a></div>` : '';

  const dispatchBtn = ''; // dispatch link removed per request
  const _telHref = cPhone.replace(/[^\d+]/g, '');
  const _webShow = cWebsite.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const contactItems = [
    cAddress ? vit('Address', esc(cAddress), true) : '',
    cPhone ? vit('Phone', `<a href="tel:${esc(_telHref)}" style="color:inherit">${esc(cPhone)}</a>`, true) : '',
    cEmail ? vit('Email', `<a href="mailto:${esc(cEmail)}" style="color:var(--orange);font-weight:600">${esc(cEmail)}</a>`, true) : '',
    cWebsite ? vit('Website', `<a href="${esc(cWebsite)}" target="_blank" rel="noopener" style="color:var(--orange);font-weight:600">${esc(_webShow)}</a>`, true) : ''
  ].filter(Boolean).join('');
  const contactCard = contactItems ? `<div class="sec-h">Contact</div><div class="vitcard"><div class="vitals">${contactItems}</div></div>` : '';

  const callsBlock = hasCalls
    ? `<div class="sec-h">Work Outlook</div><div class="callcard">`
      + (local._outlook ? `<p class="outlook-lead">${esc(local._outlook)}</p>` : '')
      + `<div class="ocall-count">${calls.length} open call${calls.length > 1 ? 's' : ''} · ${hands} hands needed</div>`
      + calls.map(callRow).join('')
      + `</div>`
    : `<div class="sec-h">Open calls</div><div class="nocalls"><b>No open calls posted right now.</b><br>This local isn't showing open calls at the moment. Scale and dispatch info below stays current — check back, the board is swept daily.</div>`;

  const _scaleLine = local.jw_scale != null ? ` Journeyman scale runs <span class="k">${money(local.jw_scale)}/hr</span>.` : '';
  const outlook = hasCalls
    ? `${label}${place ? ' out of ' + place : ''} currently has <span class="k">${calls.length} open job call${calls.length > 1 ? 's' : ''}</span> on the books, needing about <span class="k">${hands} hands</span>.${_scaleLine} Calls below are pulled live from the local's dispatch — sign the appropriate book and call the hall to confirm before you roll.`
    : `${label}${place ? ' covers ' + place : ''} and is tracked here for traveling ${T.workers}.${_scaleLine} No calls are open right now, but this page updates daily — bookmark it and check back, or watch the full <a href="/" style="color:var(--orange);font-weight:600">live board</a> for the whole country.`;

  // schema
  const breadcrumb = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: CANON + '/' },
      { '@type': 'ListItem', position: 2, name: 'Locals', item: CANON + '/locals' },
      { '@type': 'ListItem', position: 3, name: label, item: url }
    ]
  };
  const faq = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
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
  const jobLd = calls.map(c => jobPostingLd(local, c));
  const ldBlocks = [breadcrumb, faq, ...jobLd]
    .map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n');

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website"><meta property="og:site_name" content="TrampHereBro">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${CANON}/share-banner.png">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${CANON}/share-banner.png">
${FAVICON_LINK}
${FONTS}
<style>${CSS}</style>
${ldBlocks}
</head><body>
${topbar('')}
<header><div class="hero-inner">
<div class="crumbs"><a href="/">Board</a> › <a href="/locals">Locals</a> › ${esc(label)}</div>
<div class="kick"><span class="dot"></span>Live ${T.name} Job Calls</div>
<h1 class="lede">${esc(label)} <b>Job Calls</b></h1>
<div class="hsub">${place ? esc(place) + ' · ' : ''}${local.trade === 'UA' ? 'Contact and job-call info for traveling ' + T.workers + ' — updated daily.' : 'Open inside-wireman calls, journeyman scale, and dispatch info — pulled live and updated daily.'}</div>
<div class="hstats">
<div class="hstat"><div class="n accent">${hasCalls ? calls.length : '0'}</div><div class="l">OPEN CALLS</div></div>
<div class="hstat"><div class="n">${hands}</div><div class="l">HANDS NEEDED</div></div>
${local.jw_scale != null ? `<div class="hstat"><div class="n">${money(local.jw_scale)}</div><div class="l">JW SCALE / HR</div></div>` : ''}
</div>
</div></header>
<main class="wrap">
${vitals ? `<div class="sec-h">Local vitals</div><div class="vitcard"><div class="vitals">${vitals}</div>${wageUpdated}</div>` : ''}
${contactCard}
${callsBlock}
<p class="outlook">${outlook}</p>
<div class="faq">
<h3>Does ${esc(label)} have open calls right now?</h3>
<p>${hasCalls ? `Yes — ${calls.length} open call${calls.length > 1 ? 's' : ''} needing ~${hands} hands as of ${esc(PRETTY_DATE)}, listed above and updated daily.` : `Not right now. No open calls posted as of ${esc(PRETTY_DATE)}. This page is swept daily — check back.`}</p>
<h3>What's the journeyman scale at ${esc(label)}?</h3>
<p>${local.jw_scale != null ? `Inside JW base scale is ${money(local.jw_scale)}/hr${local.hw != null ? `, plus ${money(local.hw)} H&amp;W` : ''}.` : `Scale isn't confirmed here yet — contact dispatch for current rates.`}</p>
</div>
<div class="backbar"><a class="backbtn" href="/">← Back to the full live board</a> &nbsp; <a class="backbtn" href="/locals">All locals →</a></div>
</main>
${footer()}
</body></html>`;
}

/* ----------------------------- directory hub ------------------------------ */
function hubPage(rows) {
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
      return `<a class="hub-local" href="/locals/${slug}" data-s="${esc(s)} ${(r.local.trade||'ibew').toLowerCase()}"><span class="hl-name">${tradeOf(r.local).name} ${num || r.local.id}${r.local.city ? ' · ' + esc(r.local.city) : ''}</span><span class="hl-cc${cc > 0 ? ' hot' : ''}">${cc > 0 ? cc + ' open' : '—'}</span></a>`;
    }).join('');
    return `<div class="hub-state" data-state="${st}"><button class="hub-state-h" onclick="toggleState(this)" aria-expanded="false"><span class="hs-name">${esc(stateName(st))}</span><span class="hs-meta">${oc > 0 ? `<span class="hs-oc">${oc} open</span>` : ''}<span>${list.length} local${list.length > 1 ? 's' : ''}</span></span><svg class="hs-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></button><div class="hub-state-body"><div class="hub-state-in">${links}</div></div></div>`;
  }

  const byCountry = { 'United States': [], 'Canada': [] };
  Object.keys(byState).forEach(st => { byCountry[CA_PROVINCES.has(st) ? 'Canada' : 'United States'].push(st); });
  const FLAG = { 'United States': '\uD83C\uDDFA\uD83C\uDDF8', 'Canada': '\uD83C\uDDE8\uD83C\uDDE6' };
  const body = ['United States', 'Canada'].filter(c => byCountry[c].length).map(c => {
    const sts = byCountry[c].sort((a, b) => stateName(a).localeCompare(stateName(b)));
    const locN = sts.reduce((s, st) => s + byState[st].length, 0);
    const ocN = sts.reduce((s, st) => s + byState[st].reduce((x, r) => x + r.calls.length, 0), 0);
    return `<div class="hub-country"><div class="hub-country-h"><span class="hc-flag">${FLAG[c]}</span><span class="hc-name">${esc(c)}</span><span class="hc-meta">${ocN > 0 ? `<span class="hc-chip hot">${ocN} open</span>` : ''}<span class="hc-chip">${locN} locals</span></span></div>${sts.map(stateBlock).join('')}</div>`;
  }).join('');

  const title = 'All IBEW & UA Locals — Job Calls, Wage Scale & Dispatch Directory | TrampHereBro';
  const desc = `Directory of ${rows.length} IBEW and UA locals with live job-call counts, journeyman scale and contact info for traveling tradesmen. ${totalCalls} open calls across ${activeLocals} active locals. Updated ${PRETTY_DATE}.`;
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${CANON}/locals">
<meta property="og:type" content="website"><meta property="og:site_name" content="TrampHereBro">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${CANON}/locals"><meta property="og:image" content="${CANON}/share-banner.png">
<meta name="twitter:card" content="summary_large_image">
${FAVICON_LINK}
${FONTS}
<style>${CSS}</style>
</head><body>
${topbar('')}
<header><div class="hero-inner">
<div class="crumbs"><a href="/">Board</a> › Locals</div>
<div class="kick"><span class="dot"></span>Local Directory</div>
<h1 class="lede">All <b>Locals</b></h1>
<div class="hsub">Every local we track. Search or tap a state to see its locals, live call counts, and wage info.</div>
<div class="hstats">
<div class="hstat"><div class="n accent">${totalCalls}</div><div class="l">OPEN CALLS</div></div>
<div class="hstat"><div class="n">${activeLocals}</div><div class="l">ACTIVE LOCALS</div></div>
<div class="hstat"><div class="n">${rows.length}</div><div class="l">LOCALS TRACKED</div></div>
</div>
</div></header>
<main class="wrap">
<input class="hub-search" type="search" placeholder="Search by local number, city, or state…" oninput="filterHub(this.value)" aria-label="Search locals">
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
${footer()}
</body></html>`;
}

function sitemap(rows) {
  const urls = [];
  CORE_PAGES.forEach(p => urls.push(CANON + '/' + p));
  urls.push(CANON + '/locals');
  rows.forEach(r => urls.push(`${CANON}/locals/${slugFor(r.local.name, r.local.id, r.local.trade)}`));
  const body = urls.map(u =>
    `  <url><loc>${u}</loc><lastmod>${ISO_DATE}</lastmod><changefreq>daily</changefreq></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
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
function syncHomepageMap(rows, coords, snapText) {
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
    const snapHtml = `<section class="homesnap"><div class="homesnap-inner"><div class="hs-kick"><span class="hs-dot"></span>Today's Traveler Snapshot · ${esc(PRETTY_DATE)}</div><div class="hs-body">${snapshotMd(snapText)}</div><a class="hs-more" href="/snapshot">See the full daily update →</a></div></section>`;
    out = out.replace(/<!--HS_START-->[\s\S]*?<!--HS_END-->/, '<!--HS_START-->' + snapHtml + '<!--HS_END-->');
  }

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
async function generateSnapshot(rows) {
  if (!ANTHROPIC_KEY) return null;
  const { digest, stats } = boardDigest(rows);
  if (!stats.totalCalls) return null;
  const dayname = TODAY.toLocaleDateString('en-US', { weekday: 'long' });
  const prompt = `You are writing today's "IBEW Traveler Snapshot" for TrampHereBro — a daily intel briefing for traveling inside wiremen deciding where to chase work. You know this trade cold. Today is ${dayname}, ${PRETTY_DATE}.\n\nBoard-wide right now: ${stats.totalCalls} open calls across ${stats.activeLocals} locals, about ${stats.totalHands} hands needed.\n\nStandout locals (live from union dispatch — each line gives the local, its total calls and hands, top scale, book depth, then specific calls with contractor, project, pay, per diem, schedule and requirements):\n${digest}\n\nWrite a punchy, SPECIFIC editorial snapshot of ~240-300 words in the voice of a sharp journeyman who's actually in the work — not a generic recap. Lead with a bold title line exactly: **IBEW Traveler Snapshot — ${dayname}, ${PRETTY_DATE}**. Then feature the 5-6 most notable locals as tight paragraphs, ordered by a mix of top pay and biggest boards. For EACH featured local, be concrete with the data: bold the local header like **LU-494 Milwaukee, WI**; bold the exact standout pay (e.g. **$62.73/hr**) and call out over-scale premiums, per diem, and OT specifics (e.g. "all OT double time", "5-10s + Sat"); name the actual contractors and projects (data centers, refineries, steel mills, hospitals). Where the data shows book depth, work it in (e.g. "Book 1 nearly clear at 5 out"). Skip locals with thin data. Close with ONE sentence on the market trend — where the hands are going and what's driving it. No preamble, no sign-off. Use ONLY facts from the data above; never invent pay, projects, or numbers.`;
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
function snapshotPage(text) {
  const title = 'IBEW Traveler Snapshot — Daily Job Call Update | TrampHereBro';
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
${FONTS}
<style>${CSS}</style>
</head><body>
${topbar('snapshot')}
<header><div class="hero-inner">
<div class="crumbs"><a href="/">Board</a> › Daily Update</div>
<div class="kick"><span class="dot"></span>Updated ${esc(PRETTY_DATE)}</div>
<h1 class="lede">Traveler <b>Snapshot</b></h1>
<div class="hsub">Where the work is right now — top-paying locals, the biggest boards, and the projects driving demand, pulled live from union dispatch.</div>
</div></header>
<main class="wrap">
<div class="snap-card">${snapshotMd(text)}</div>
<div class="snap-date">Updated ${esc(PRETTY_DATE)} · generated from live union dispatch data</div>
<div class="backbar" style="margin-top:26px"><a class="backbtn" href="/locals">Browse all locals →</a> &nbsp; <a class="backbtn" href="/">Live board →</a></div>
</main>
${footer()}
</body></html>`;
}

(async function main() {
  console.log('→ Fetching live data from Supabase…');
  const [locs, calls] = await Promise.all([
    supaGet('locals?select=*&limit=3000'),
    supaGet('job_calls?select=*&status=eq.open&limit=8000')
  ]);
  console.log(`  locals: ${locs.length}   open calls: ${calls.length}`);

  const callsByLocal = {};
  calls.forEach(c => { (callsByLocal[c.local_id] = callsByLocal[c.local_id] || []).push(c); });

  // rows = every local, with its (possibly empty) open-call list
  const ibewRows = locs
    .filter(l => l && (l.name || l.id))
    .map(l => ({ local: { ...l, name: cleanName(l.name, l.id), trade: 'IBEW' }, calls: (callsByLocal[l.id] || []) }));
  let UA = [];
  try { UA = JSON.parse(fs.readFileSync(UA_FILE, 'utf8')); } catch (e) { UA = []; }
  const uaRows = UA.map(u => ({ local: { ...u, trade: 'UA' }, calls: [] }));
  const rows = [...ibewRows, ...uaRows];
  console.log(`  IBEW: ${ibewRows.length}   UA: ${uaRows.length}   total pages: ${rows.length}`);

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

  // Daily Snapshot — one cached editorial brief for the whole board
  let snapText = null;
  const boardHash = callsHash(rows.flatMap(r => r.calls));
  try { const sc = JSON.parse(fs.readFileSync(SNAPSHOT_CACHE, 'utf8')); if (sc.hash === boardHash) snapText = sc.text; } catch (e) {}
  if (!snapText && ANTHROPIC_KEY) {
    snapText = await generateSnapshot(rows);
    if (snapText) { try { fs.writeFileSync(SNAPSHOT_CACHE, JSON.stringify({ hash: boardHash, text: snapText, date: ISO_DATE })); } catch (e) {} console.log('  generated daily snapshot via ' + SNAPSHOT_MODEL); }
  }

  if (!fs.existsSync(LOCALS_DIR)) fs.mkdirSync(LOCALS_DIR, { recursive: true });

  // write favicon.png once (from the same hard-hat mark the homepage uses)
  const favPath = path.join(SITE_DIR, 'favicon.png');
  if (!fs.existsSync(favPath)) {
    try { fs.writeFileSync(favPath, Buffer.from(FAVICON_B64, 'base64')); console.log('  wrote favicon.png'); }
    catch (e) { console.log('  (favicon skipped)'); }
  }

  let written = 0, withCalls = 0;
  for (const r of rows) {
    const slug = slugFor(r.local.name, r.local.id, r.local.trade);
    fs.writeFileSync(path.join(LOCALS_DIR, slug + '.html'), localPage(r.local, r.calls));
    written++; if (r.calls.length) withCalls++;
  }
  fs.writeFileSync(path.join(LOCALS_DIR, 'index.html'), hubPage(rows));
  if (snapText) { fs.writeFileSync(path.join(SITE_DIR, 'snapshot.html'), snapshotPage(snapText)); console.log('  wrote snapshot.html'); }
  const totalOpen = rows.reduce((s, r) => s + r.calls.length, 0);
  const activeN = rows.filter(r => r.calls.length > 0).length;
  fs.writeFileSync(path.join(SITE_DIR, 'llms.txt'),
`# TrampHereBro
> Live IBEW job-call board for traveling union electricians. ${totalOpen} open calls across ${activeN} active locals right now, plus journeyman wage scale and hall contact info for ${rows.length} IBEW & UA locals across the US and Canada. Updated daily from hall dispatch pages.

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
  const mapCount = syncHomepageMap(rows, coords, snapText);

  console.log(`\n✓ Wrote ${written} local pages (${withCalls} with open calls, ${written - withCalls} evergreen)`);
  console.log(`✓ Wrote locals/index.html hub`);
  console.log(`✓ Rebuilt sitemap.xml (${written + CORE_PAGES.length + 1} URLs)`);
  console.log(mapCount ? `✓ Synced homepage map + board (${mapCount} locals)` : '  (homepage map markers not found — skipped)');
  console.log(`\nNext:  git add . && git commit -m "Generate per-local pages" && git push`);
})().catch(e => { console.error('\n✗ FAILED:', e.message); process.exit(1); });
