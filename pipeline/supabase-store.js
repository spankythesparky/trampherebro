// supabase-store.js — writes calls to Supabase with the same reliability rule
// as worker_v2: a failed scrape never purges. Only a SUCCESSFUL scrape purges
// the calls it didn't see this cycle. Empty-but-successful DOES purge.
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

export function makeClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // service role — server side only
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env");
  return createClient(url, key, { auth: { persistSession: false } });
}

// Stable id for a call so the same posting updates instead of duplicating.
export function fingerprint(localId, c) {
  const key = [localId, c.contractor, c.job_name, c.call_type, c.location, c.start_date]
    .map((x) => (x ?? "").toString().trim().toLowerCase()).join("|");
  return crypto.createHash("sha1").update(key).digest("hex").slice(0, 16);
}

export class SupabaseStore {
  constructor(sb) { this.sb = sb; }

  async getEnabledSources() {
    const { data, error } = await this.sb
      .from("scrape_sources")
      .select("id, local_id, platform, url, enabled, locals(name)")
      .eq("enabled", true)
      .order("local_id", { ascending: true });
    if (error) throw new Error("load sources: " + error.message);
    return (data || []).map((s) => ({ ...s, name: s.locals?.name || "" }));
  }

  async upsertCalls(localId, calls, nowISO) {
    if (!calls.length) return 0;
    const byFp = new Map();
    for (const c of calls) {
      const fp = fingerprint(localId, c);
      if (byFp.has(fp)) {
        const ex = byFp.get(fp);
        ex.num_needed = (ex.num_needed || 0) + (c.num_needed || 0) || ex.num_needed;
      } else {
        byFp.set(fp, {
          local_id: localId,
          fingerprint: fp,
          call_type: c.call_type ?? null,
          contractor: c.contractor ?? null,
          job_name: c.job_name ?? null,
          location: c.location ?? null,
          num_needed: c.num_needed ?? null,
          scale: c.scale ?? null,
          start_date: c.start_date ?? null,
          duration: c.duration ?? null,
          per_diem: c.per_diem ?? null,
          notes: c.notes ?? null,
          status: "open",
          last_seen: nowISO,
        });
      }
    }
    const rows = [...byFp.values()];
    const bulk = await this.sb
      .from("job_calls")
      .upsert(rows, { onConflict: "local_id,fingerprint", ignoreDuplicates: false });
    if (!bulk.error) return rows.length;
    let n = 0;
    for (const r of rows) {
      const { error } = await this.sb
        .from("job_calls")
        .upsert([r], { onConflict: "local_id,fingerprint", ignoreDuplicates: false });
      if (!error) n++;
    }
    return n;
  }

  async purgeStale(localId, cycleStartISO) {
    const { data, error } = await this.sb
      .from("job_calls")
      .update({ status: "filled" })
      .eq("local_id", localId)
      .eq("status", "open")
      .lt("last_seen", cycleStartISO)
      .select("id");
    if (error) throw new Error("purge: " + error.message);
    return (data || []).length;
  }

  async recordOk(sourceId, nowISO) {
    await this.sb.from("scrape_sources")
      .update({ last_run_at: nowISO, last_ok_at: nowISO, last_status: "ok", consecutive_failures: 0 })
      .eq("id", sourceId);
  }

  async recordFail(sourceId, nowISO, msg, prevFails) {
    const fails = (prevFails || 0) + 1;
    await this.sb.from("scrape_sources")
      .update({ last_run_at: nowISO, last_status: "error: " + String(msg).slice(0, 180), consecutive_failures: fails })
      .eq("id", sourceId);
    return fails;
  }
}
