#!/usr/bin/env node
/*
 * batch-scrape.js — pull calls for EVERY enabled local, all in one run.
 *
 *   node batch-scrape.js            # scrape all enabled sources
 *   node batch-scrape.js --limit 10 # just the first 10 (good for a test run)
 *   node batch-scrape.js --dry-run  # scrape + extract, but DON'T write to Supabase
 *
 * Reliability rule (inherited from worker_v2): a failed scrape never purges.
 * Only a successful scrape purges the calls it didn't see. Empty-but-successful
 * still purges (the hall genuinely cleared its board).
 *
 * Needs a .env with ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Requires Node 18+ (built-in fetch).
 */
import "dotenv/config";
import { extractCallsFromUrl } from "../union-call-extractor.js";
import { makeClient, SupabaseStore } from "./supabase-store.js";

const LIMIT = argNum("--limit");
const DRY = process.argv.includes("--dry-run");
const ONLY = (() => { const i = process.argv.indexOf("--only"); return i > -1 && process.argv[i+1] ? new Set(process.argv[i+1].split(",").map(x => Number(x.trim()))) : null; })();
const CONCURRENCY = 4;          // how many locals in flight at once (be a good neighbor)
const GAP_MS = 400;             // small stagger between starts
const API_RETRIES = 2;          // retry transient API errors (429 / 5xx)

function argNum(flag) { const i = process.argv.indexOf(flag); return i > -1 ? Number(process.argv[i + 1]) : null; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function extractWithRetry(url, local) {
  let last;
  for (let attempt = 0; attempt <= API_RETRIES; attempt++) {
    const res = await extractCallsFromUrl(url, local);
    if (res.ok) return res;
    last = res;
    // only retry things that look transient (rate limit / server errors)
    if (/HTTP (429|5\d\d)/.test(res.error || "")) { await sleep(1200 * (attempt + 1)); continue; }
    break; // fetch-failed / parse-failed — don't hammer
  }
  return last;
}

async function main() {
  const sb = makeClient();
  const store = new SupabaseStore(sb);
  const cycleStart = new Date().toISOString();

  let sources = await store.getEnabledSources();
  if (ONLY) sources = sources.filter(x => ONLY.has(Number(x.local_id)));
  if (LIMIT) sources = sources.slice(0, LIMIT);
  console.log(`Scraping ${sources.length} locals${DRY ? " (dry run — no writes)" : ""}…\n`);

  const summary = { ok: 0, empty: 0, failed: 0, upserted: 0, purged: 0, held: 0 };
  let done = 0;

  // simple concurrency pool
  const queue = [...sources];
  async function worker() {
    while (queue.length) {
      const src = queue.shift();
      await sleep(GAP_MS);
      const local = { id: src.local_id, name: src.name, platform: src.platform };
      const res = await extractWithRetry(src.url, local);
      done++;
      const tag = `[${String(done).padStart(3)}/${sources.length}] LU ${String(src.local_id).padEnd(5)}`;

      if (!res.ok) {
        summary.failed++;
        const nowISO = new Date().toISOString();
        if (!DRY) { const fails = await store.recordFail(src.id, nowISO, res.error, src.consecutive_failures); 
          console.log(`${tag} FAILED — ${res.error} (kept last calls, UNVERIFIED, fail #${fails})`); }
        else console.log(`${tag} FAILED — ${res.error}`);
        continue;
      }

      summary.held += (res.held_for_review || []).length;
      const nowISO = new Date().toISOString();
      if (DRY) {
        console.log(`${tag} ok — ${res.calls.length} calls${res.held_for_review?.length ? `, ${res.held_for_review.length} held` : ""} (dry)`);
        res.calls.length ? summary.ok++ : summary.empty++;
        summary.upserted += res.calls.length;
        continue;
      }
      const up = await store.upsertCalls(src.local_id, res.calls, nowISO);
      // GUARD: a zero-call result is only trustworthy if the page actually LOOKED
      // like a calls board. A hall that truly cleared its board still renders a
      // board (with nothing on it) -> safe to purge. But a WorkingSystems local
      // outside its bidding window, a site that changed layout, or a garbled fetch
      // all return HTTP 200 + zero calls while looking nothing like a board --
      // purging those would wipe a live local. When in doubt, keep the calls.
      let purged = 0;
      if (res.calls.length > 0 || res.page_looked_like_calls === true) {
        purged = await store.purgeStale(src.local_id, cycleStart);
      } else {
        console.log(`${tag} zero calls, page did not look like a board -- PURGE SKIPPED (calls kept)`);
      }
      await store.recordOk(src.id, nowISO);
      summary.upserted += up; summary.purged += purged;
      res.calls.length ? summary.ok++ : summary.empty++;
      console.log(`${tag} ok — saw ${res.calls.length}, purged ${purged}${res.held_for_review?.length ? `, ${res.held_for_review.length} held for review` : ""}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log("\n──────── SUMMARY ────────");
  console.log(`locals with calls : ${summary.ok}`);
  console.log(`locals empty      : ${summary.empty}`);
  console.log(`locals failed     : ${summary.failed}  (kept old calls, flagged unverified)`);
  console.log(`calls upserted    : ${summary.upserted}`);
  console.log(`calls purged      : ${summary.purged}`);
  console.log(`held for review   : ${summary.held}  (low-confidence — not shown publicly)`);
  if (DRY) console.log("\n(dry run — nothing was written to Supabase)");
}

main().catch((e) => { console.error("\nFATAL:", e.message); process.exit(1); });
