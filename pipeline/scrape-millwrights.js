// UBC Millwrights bulletin board — the 8 most recent manpower calls.
import fs from 'fs';

const ARCHIVE = 'https://ubcmillwrights.org/bulletin-type/needed/';
const OUT     = 'millwright-postings.json';
const SITE    = process.env.HOME + '/Desktop/trampherebro/millwright-postings.json';
const TAKE    = Number(process.argv[2] || 8);
const NOW     = new Date().toISOString();
const UA      = { 'User-Agent': 'Mozilla/5.0 (compatible; TrampHereBro/1.0; +https://trampherebro.com)' };

const strip = s => s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/g,' ').replace(/&#0?39;|&apos;/g,"'").replace(/&quot;/g,'"')
  .replace(/&#8217;/g,'\u2019').replace(/&#8211;/g,'\u2013').replace(/&#8212;/g,'\u2014')
  .replace(/&#(\d+);/g, (m,d) => String.fromCharCode(Number(d))).replace(/&amp;/g,'&')
  .replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();

const res = await fetch(ARCHIVE, { headers: UA });
if (!res.ok) { console.error(`FAILED: archive HTTP ${res.status}`); process.exit(1); }
const html = await res.text();

const links = [...new Set((html.match(/https:\/\/ubcmillwrights\.org\/bulletin\/[a-z0-9\-]+\//gi) || []))].slice(0, TAKE);
if (!links.length) { console.error('No bulletin links found.'); process.exit(1); }

let prior = {};
if (fs.existsSync(OUT)) {
  try { (JSON.parse(fs.readFileSync(OUT)).postings || []).forEach(p => prior[p.url] = p.first_seen); } catch {}
}

const postings = [];
for (const url of links) {
  try {
    const r = await fetch(url, { headers: UA });
    if (!r.ok) { console.log(`  skip ${url} (HTTP ${r.status})`); continue; }
    const h = await r.text();
    const title = strip((h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [,''])[1])
      || strip((h.match(/<title>([\s\S]*?)<\/title>/i) || [,''])[1]).replace(/ - United Brotherhood.*$/, '');
    const posted = (h.match(/<time[^>]*datetime="([^"]+)"/i) || [,''])[1] || '';
    let body = (h.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/(?:article|div)/i) || [,''])[1];
    if (!body) body = (h.match(/<article[\s\S]*?<\/article>/i) || [,''])[0];
    body = strip(body).split(/"The performance and attitudes|Join the UBC Millwrights/)[0].trim();
    postings.push({ url, title, posted, body, source_name: 'UBC Millwrights Bulletin Board',
      source_url: ARCHIVE,
      verify_note: 'Posted by the United Brotherhood of Carpenters/Millwrights, not by an individual local hall. Always verify with the listed contact before you travel.',
      first_seen: prior[url] || NOW, last_seen: NOW });
    await new Promise(r => setTimeout(r, 900));
  } catch (e) { console.log(`  skip ${url} (${e.message})`); }
}

const MAXDAYS = Number(process.env.MW_MAXDAYS || 45);
const cutoff = Date.now() - MAXDAYS*24*60*60*1000;
const fresh = postings.filter(p => !p.posted || Date.parse(p.posted) >= cutoff);
const stale = postings.length - fresh.length;
fs.writeFileSync(OUT, JSON.stringify({ fetched_at: NOW, source_url: ARCHIVE, max_age_days: MAXDAYS, postings: fresh }, null, 2));
try { fs.copyFileSync(OUT, SITE); } catch {}
console.log(`Millwrights: ${fresh.length} live bulletins saved (${stale} older than ${MAXDAYS} days dropped)`);
fresh.forEach(p => console.log(`  ${(p.posted||'?').slice(0,10)}  ${p.title}`));
