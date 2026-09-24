// Scans generated pages and writes search-index.json. No dependencies.
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const clean = s => (s || "").replace(/\s+/g, " ").replace(/&amp;/g,"&").replace(/&#39;/g,"'").replace(/&quot;/g,'"').trim();
const title = h => clean((h.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]).replace(/\s*[—|·-]\s*TrampHereBro.*$/i, "");
const desc  = h => clean((h.match(/<meta name="description" content="([^"]*)"/i) || [])[1]).slice(0, 140);

const out = [];

// local pages
const dir = path.join(ROOT, "locals");
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith(".html") || f === "index.html") continue;
  const h = fs.readFileSync(path.join(dir, f), "utf8");
  const slug = f.replace(/\.html$/, "");
  const m = h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const head = clean((m ? m[1] : "").replace(/<[^>]+>/g, " "));
  const sub = (h.match(/([A-Z][A-Za-z .'-]+,\s*[A-Z]{2})\s*(?:·|&middot;)/) || [])[1] || "";
  out.push({ t: head || title(h), u: "/locals/" + slug, s: sub, g: "Local" });
}

// top-level pages
for (const f of fs.readdirSync(ROOT)) {
  if (!f.endsWith(".html")) continue;
  const h = fs.readFileSync(path.join(ROOT, f), "utf8");
  const slug = f === "index.html" ? "/" : "/" + f.replace(/\.html$/, "");
  out.push({ t: title(h) || slug, u: slug, s: desc(h), g: "Page" });
}

fs.writeFileSync(path.join(ROOT, "search-index.json"), JSON.stringify(out));
console.log("search-index.json: " + out.length + " entries (" +
  out.filter(x => x.g === "Local").length + " locals, " +
  out.filter(x => x.g === "Page").length + " pages)");
