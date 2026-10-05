import "dotenv/config";
import crypto from "crypto";
import { makeClient } from "./supabase-store.js";
const sb = makeClient();
const LOCAL_ID = 10008;
const fp = r => crypto.createHash("md5").update([r.local_id, r.call_type, r.contractor, r.job_name, r.num_needed, r._job].join("|")).digest("hex");

// IBEW Local 8 (Toledo) — Aug 3 board (read from posted image). JW Inside + Residential + VDV.
const CALLS = [
  { j:"mj-beecher", c:"M.J. Electric", ct:"Journeyman Inside Wireman", site:"Beecher Solar, Britton, MI", n:1,
    notes:"6-10s. NMA, background check, direct deposit, safety toe, drivers license, outdoor work, reliable drug testing. Report to job 8/04 at 7:00 AM." },
  { j:"state-apollo", c:"State Group", ct:"Journeyman Inside Wireman", site:"Apollo Power Generation Station, Bowling Green, OH", n:6,
    notes:"6-10s. 2 forms of ID, direct deposit, long sleeves, safety toe boots, reliable drug testing. Outdoor work. Report to job 8/04 at 7:00 AM for training." },
  { j:"nooter-cenovus", c:"Nooter, Inc", ct:"Journeyman Inside Wireman", site:"Cenovus Refinery (GPA)", n:4,
    notes:"Leftover regular. 4-10s possible OT. No beards, steel toe, DISA background check, drug test, direct deposit. Report to shop, 7:00 AM." },
  { j:"midamerican-fermi", c:"Mid-American Group", ct:"Journeyman Inside Wireman", site:"Fermi Nuclear Plant (GPA)", n:4,
    notes:"Leftover regular. EPHQ, background check, drug test, COE, 1st Aid, CPR, direct deposit. 4-10s. Report to job at 7:00 AM." },
  { j:"graham-cenovus", c:"Graham", ct:"Journeyman Inside Wireman", site:"Cenovus Refinery, Oregon, OH (GPA)", n:1,
    notes:"Leftover regular. 40+ hrs. No beards, steel toe, DISA background, hair fol/urine test, NFPA 70E. Paying an extra 10%. Report to job at 7:30 AM." },
  { j:"turner-shop", c:"Turner Electric", ct:"Journeyman Inside Wireman", site:"SHOP", n:1,
    notes:"Leftover regular. Inside agreement, 1st shift, 4-10s possible OT. NICET 1 or NETA 2 Test Technician, NFPA 70E, 1st Aid/CPR, safety toe, direct deposit, reliable drug testing. Indoor/outdoor. Report to shop 7:00 AM. No nick call." },
  { j:"regent-various", c:"Regent", ct:"Residential Wireman", site:"Various jobs", n:1,
    notes:"Leftover residential. 40 hrs. Toledo license. Report to shop after referral." },
  { j:"regent-shop", c:"Regent", ct:"Residential Wireman", site:"Regent Shop", n:2,
    notes:"Leftover residential. Residential agreement, 40 hrs, 5-8s, 7:00 AM. Reliable drug testing. Report to shop after referral." },
  { j:"nw-trc", c:"Northwest Electric", ct:"VDV Installer", site:"TRC (BICSI Tech)", n:1,
    notes:"Leftover VDV. DISA background check, 40 hrs, direct deposit, no beards, no smoking, reliable drug testing. Report to shop after referral." },
  { j:"chapel-1", c:"Chapel/Romanoff Technologies", ct:"VDV Installer", site:"SHOP", n:1,
    notes:"Leftover VDV. Teledata agreement, 40 hrs, direct deposit, indoor/outdoor, reliable drug testing, 7:00 AM. Report to shop after referral." },
  { j:"chapel-2", c:"Chapel/Romanoff Technologies", ct:"VDV Installer", site:"SHOP", n:2,
    notes:"Leftover VDV. Teledata agreement, 40 hrs, direct deposit, indoor/outdoor, reliable drug testing, 7:00 AM. Report to shop after referral." },
  { j:"transtar", c:"Transtar", ct:"VDV Installer", site:"Various jobs (BICSI)", n:1,
    notes:"Leftover VDV. BICSI, direct deposit, 7:30 AM start. Report to shop after referral." },
  { j:"fairchild", c:"Fairchild Communications", ct:"VDV Installer", site:"SHOP - Foreman / Service Truck, various jobs", n:2,
    notes:"Leftover VDV. 40 hrs, 1st shift, direct deposit, 2 forms of ID, safety toe, BICSI, fusion splicing, fire alarm license. Report to shop after referral." },
];

const rows = CALLS.map(x => {
  const r = { local_id: LOCAL_ID, call_type: x.ct, contractor: x.c, job_name: x.site, location: "Toledo, OH area", num_needed: x.n, scale: null, per_diem: null, duration: null, notes: x.notes, status: "open", _job: x.j };
  r.fingerprint = fp(r); delete r._job; return r;
});

await sb.from("job_calls").delete().eq("local_id", LOCAL_ID);
const { error } = await sb.from("job_calls").insert(rows);
if (error) { console.error("insert error:", error.message); process.exit(1); }
console.log(`inserted ${rows.length} calls for IBEW 8 (${rows.reduce((s,r)=>s+r.num_needed,0)} hands)`);
await sb.from("scrape_sources").update({ enabled: false }).eq("local_id", LOCAL_ID);
console.log("source disabled");
