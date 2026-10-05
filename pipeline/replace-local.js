/* Replace a local's open calls without destroying its history. */
const chunk = (a, n) => { const o=[]; for(let i=0;i<a.length;i+=n) o.push(a.slice(i,i+n)); return o; };

export async function replaceLocal(sb, LID, rows) {
  const now = new Date().toISOString();
  const { data: prior, error: e1 } = await sb
    .from("job_calls").select("id,fingerprint,status").eq("local_id", LID);
  if (e1) throw new Error(e1.message);

  const open = (prior || []).filter(r => r.status === "open");
  const had = new Set(open.map(r => r.fingerprint));
  const now_fp = new Set(rows.map(r => r.fingerprint));

  const gone = open.filter(r => !now_fp.has(r.fingerprint)).map(r => r.id);
  for (const c of chunk(gone, 200)) {
    const { error } = await sb.from("job_calls")
      .update({ status: "filled", last_seen: now }).in("id", c);
    if (error) throw new Error(error.message);
  }

  const stay = open.filter(r => now_fp.has(r.fingerprint)).map(r => r.id);
  for (const c of chunk(stay, 200)) {
    const { error } = await sb.from("job_calls").update({ last_seen: now }).in("id", c);
    if (error) throw new Error(error.message);
  }

  const fresh = rows.filter(r => !had.has(r.fingerprint))
                    .map(r => ({ ...r, first_seen: now, last_seen: now }));
  if (fresh.length) {
    const { error } = await sb.from("job_calls").insert(fresh);
    if (error) throw new Error(error.message);
  }
  return { total: rows.length, fresh: fresh.length, kept: stay.length, filled: gone.length };
}
