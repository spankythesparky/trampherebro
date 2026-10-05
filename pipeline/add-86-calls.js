import "dotenv/config"; import crypto from "crypto"; import { makeClient } from "./supabase-store.js";
const sb = makeClient(); const LOCAL_ID = 10086;
const fp = r => crypto.createHash("md5").update([r.local_id,r.call_type,r.contractor,r.job_name,r.num_needed,r._job].join("|")).digest("hex");
const CALLS = [
  { j:"bf-livonia", c:"Blackmon-Farrell", ct:"Journeyman Wireman", site:"Livonia CSD", n:1, notes:"5-8s, 7 AM." },
  { j:"bf-pavilion", c:"Blackmon-Farrell", ct:"Journeyman Wireman", site:"Pavilion CSD", n:1, notes:"5-8s, 7 AM." },
  { j:"concord-brighton", c:"Concord Electric", ct:"Journeyman Wireman", site:"Brighton CSD", n:1, notes:"5-8s, 6:30 AM." },
  { j:"concord-monroe", c:"Concord Electric", ct:"Journeyman Wireman", site:"Monroe County Office", n:1, notes:"5-8s, 6:30 AM." },
  { j:"concord-industry", c:"Concord Electric", ct:"Journeyman Wireman", site:"Industry", n:1, notes:"5-8s, 6:30 AM." },
  { j:"dyno-bca", c:"Dyno Group", ct:"Journeyman Wireman", site:"Blue Cross Arena", n:1, notes:"5-8s, 7 AM." },
  { j:"dyno-fab", c:"Dyno Group", ct:"Journeyman Wireman", site:"Fab Shop", n:1, notes:"5-8s, 7 AM. 1 month." },
  { j:"ees-meyer", c:"EES", ct:"Journeyman Wireman", site:"Meyer Substation", n:1, notes:"4-10s+, 7 AM. $120/wk per diem for 4 days, $150/wk for 5 days." },
  { j:"erie-barker", c:"Erie Electric", ct:"Journeyman Wireman", site:"Barker Middle School", n:1, notes:"5-8s, 4 PM. B-shift $55.95." },
  { j:"erie-brighton", c:"Erie Electric", ct:"Journeyman Wireman", site:"Brighton Council Rock", n:1, notes:"5-8s, 7 AM. 2-week call." },
  { j:"erie-brockport", c:"Erie Electric", ct:"Journeyman Wireman", site:"Brockport CSD", n:1, notes:"5-8s, 7 AM. 2-week call." },
  { j:"ferguson-uofr", c:"Ferguson", ct:"Journeyman Wireman", site:"U of R Bed Tower", n:5, notes:"5-10s+8, 7 AM. $300/wk incentive for 90%, or $175/day for book 2." },
  { j:"ferguson-victor", c:"Ferguson", ct:"Journeyman Wireman", site:"Victor Solar", n:2, notes:"5-8s, 7 AM. 10-week call, starts 7-27-26." },
  { j:"ferguson-irondequoit", c:"Ferguson", ct:"Journeyman Wireman", site:"Irondequoit CSD", n:1, notes:"5-8s, 7 AM. $62/hr." },
  { j:"gross-roc", c:"Gross Electric", ct:"Journeyman Wireman", site:"City of Rochester", n:1, notes:"5-8s, 7 AM." },
  { j:"gross-shop", c:"Gross Electric", ct:"Journeyman Wireman", site:"Shop Call", n:5, notes:"5-8s, 7 AM." },
  { j:"hy-brockport", c:"Hewitt Young", ct:"Journeyman Wireman", site:"SUNY Brockport - Macfarlane Hall", n:1, notes:"1 JW + 1 small-job foreman needed. 5-8s, 7 AM." },
  { j:"hy-batavia", c:"Hewitt Young", ct:"Journeyman Wireman", site:"Batavia CSD", n:1, notes:"5-8s, 7 AM." },
  { j:"hy-geneseo", c:"Hewitt Young", ct:"Journeyman Wireman", site:"SUNY Geneseo", n:4, notes:"5-8s, 6 AM." },
  { j:"hy-honeoye", c:"Hewitt Young", ct:"Journeyman Wireman", site:"Honeoye CSD", n:1, notes:"5-8s, 7 AM." },
  { j:"hy-webster", c:"Hewitt Young", ct:"Journeyman Wireman", site:"Webster CSD", n:1, notes:"5-8s, 6 AM. Temp controls." },
  { j:"didado-excelsior", c:"J.W. Didado", ct:"Journeyman Wireman", site:"Excelsior Solar", n:1, notes:"5-10s, 7 AM. $75/day per diem." },
  { j:"oconnell-groveland", c:"O'Connell Electric", ct:"Journeyman Wireman", site:"Groveland Prison", n:1, notes:"5-8s, 7 AM." },
  { j:"oconnell-fab", c:"O'Connell Electric", ct:"Journeyman Wireman", site:"Fab Shop", n:5, notes:"5-10s+8, 6 AM. LU 237 rates - racks for Lake Mariner D.C." },
  { j:"oconnell-hood", c:"O'Connell Electric", ct:"Journeyman Wireman", site:"Hood, Batavia", n:3, notes:"4-10s+8, 6 AM." },
  { j:"randjones-airport", c:"Rand & Jones", ct:"Journeyman Wireman", site:"Rochester Airport", n:1, notes:"5-8s, 7 AM." },
  { j:"state-gm", c:"The State Group", ct:"Journeyman Wireman", site:"GM Plant", n:1, notes:"5-8s, 6 AM." },
  { j:"universal-shop", c:"Universal Electric", ct:"Journeyman Wireman", site:"Shop Call", n:1, notes:"5-8s, 7 AM. $50/day per diem." },
  { j:"ferguson-greece", c:"Ferguson", ct:"Journeyman Wireman", site:"Greece Solar", n:1, notes:"4-10s, 7 AM." },
  { j:"excelsior-byron", c:"Excelsior Maintenance", ct:"Journeyman Wireman", site:"Excelsior Solar - Byron", n:4, notes:"5-8s, 7 AM. Starts 8-17-26 — call for details." },
  { j:"mepower-macedon", c:"M&E Power", ct:"Journeyman Wireman", site:"Macedon Solar", n:4, notes:"5-8s, 7 AM. Starts 8-17." },
];
const rows = CALLS.map(x=>{const r={local_id:LOCAL_ID,call_type:x.ct,contractor:x.c,job_name:x.site,location:"Rochester, NY area",num_needed:x.n,scale:null,per_diem:null,duration:null,notes:x.notes,status:"open",_job:x.j};r.fingerprint=fp(r);delete r._job;return r;});
await sb.from("job_calls").delete().eq("local_id",LOCAL_ID);
const {error}=await sb.from("job_calls").insert(rows); if(error){console.error(error.message);process.exit(1);}
console.log(`86: ${rows.length} calls, ${rows.reduce((s,r)=>s+r.num_needed,0)} hands`);
await sb.from("scrape_sources").update({enabled:false}).eq("local_id",LOCAL_ID);
