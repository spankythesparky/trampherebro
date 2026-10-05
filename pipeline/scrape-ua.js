// UA Manpower Postings scraper — national project calls, not local-scoped.
// Source: https://ua.org/manpower-postings/
import fs from 'fs';

const SRC  = 'https://ua.org/manpower-postings/';
const OUT  = 'ua-postings.json';
const SITE = process.env.HOME + '/Desktop/trampherebro/ua-postings.json';
const NOW  = new Date().toISOString();

const strip = s => s.replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/g,' ').replace(/&#0?39;/g,"'").replace(/&apos;/g,"'")
  .replace(/&quot;/g,'"').replace(/&#8217;/g,"\u2019").replace(/&amp;/g,'&')
  .replace(/\s+/g,' ').trim();

const res = await fetch(SRC, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TrampHereBro/1.0; +https://trampherebro.com)' } });
if (!res.ok) { console.error(`FAILED: HTTP ${res.status}`); process.exit(1); }
const html = await res.text();

const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
let rows = [];
for (const t of tables) {
  const trs = t.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const tr of trs) {
    const tds = (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(strip);
    if (tds.length >= 9 && /^\d+$/.test(tds[4])) rows.push(tds);
  }
}

if (!rows.length) {
  console.error('No rows parsed — the page markup may have changed.');
  console.error(`Tables found: ${tables.length}`);
  process.exit(1);
}

let prior = {};
if (fs.existsSync(OUT)) {
  try { (JSON.parse(fs.readFileSync(OUT)).postings || []).forEach(p => prior[p.key] = p.first_seen); } catch {}
}

const postings = rows.map(c => {
  const key = [c[0], c[1], c[2], c[3]].join('|').toLowerCase();
  return {
    key,
    project: c[0], state: c[1], city: c[2], trade: c[3],
    needed: Number(c[4]) || 0,
    wage: c[5], total_package: c[6], duration: c[7], schedule: c[8],
    source_name: 'United Association — UA Manpower Postings',
    source_url: SRC,
    verify_note: 'Posted by the UA International, not an individual local. Always verify with the UA or the referring local before you travel.',
    first_seen: prior[key] || NOW,
    last_seen: NOW,
  };
});

fs.writeFileSync(OUT, JSON.stringify({ fetched_at: NOW, source_url: SRC, postings }, null, 2));

const hands = postings.reduce((s,p)=>s+p.needed,0);
const fresh = postings.filter(p=>p.first_seen===NOW).length;
console.log(`UA: ${postings.length} postings, ${hands} hands (${fresh} new since last run)`);
fs.copyFileSync(OUT, SITE);
console.log(`Wrote ${OUT} and copied to the site folder`);
