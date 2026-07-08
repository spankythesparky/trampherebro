function retirementPage() {
  const title = 'Union Retirement Explained — Pension vs Annuity vs 401(k) | TrampHereBro';
  const desc = 'How union retirement actually works, in plain English. The difference between a multiemployer pension, a defined-contribution annuity, and a 401(k) — plus vesting, and why reciprocity matters when you travel. A clear guide for the trades.';
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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${CANON}/unionretirement">
<meta property="og:type" content="article"><meta property="og:site_name" content="TrampHereBro">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${CANON}/unionretirement"><meta property="og:image" content="${CANON}/share-banner.png">
<meta name="twitter:card" content="summary_large_image">
${FAVICON_LINK}
${FONTS}${GA_TAG}
<style>${CSS}${HS}</style>
</head><body>
${topbar('unionretirement')}
<header><div class="hero-inner">
<div class="crumbs"><a href="/">Board</a> \u203a Union Retirement</div>
<div class="kick"><span class="dot"></span>Know What You\u2019re Building</div>
<h1 class="lede">Union Retirement, <b>Explained</b></h1>
<div class="hsub">Pension, annuity, 401(k) \u2014 most hands don\u2019t fully get how it fits together until they\u2019re close to hanging it up. Here\u2019s the plain-English version.</div>
</div></header>
<main class="wrap">
<p class="r-lead">Here\u2019s the big thing nobody explains on day one: <b>you don\u2019t retire on one check \u2014 you retire on three.</b> Every hour you work, your contract puts money into separate buckets that stack together when you\u2019re done. Understanding those three buckets is the whole game.</p>
<div class="r-stack">
<div class="r-st"><div class="num">BUCKET 1</div><div class="t">Pension</div><div class="d">A monthly check for life</div></div>
<div class="r-st"><div class="num">BUCKET 2</div><div class="t">Annuity</div><div class="d">A pot of money that\u2019s yours</div></div>
<div class="r-st"><div class="num">BUCKET 3</div><div class="t">401(k) / Savings</div><div class="d">What you stack on top</div></div>
</div>
<div class="r-note0">Three streams \u2192 <b>one retirement paycheck.</b> Tap each below to see how it works.</div>
<div class="r-sec">The <span class="a">Three Buckets</span></div>
<div class="r-secs">Tap any one to expand the plain-English breakdown.</div>
<details class="r-acc" open><summary>1. The Pension ${CHEV}</summary>
<div class="body"><p>Your pension is a <b>defined-benefit</b> plan \u2014 meaning it pays you a set monthly amount for the rest of your life once you retire, no matter how long you live. Most trades run a <b>multiemployer</b> (or \u201CTaft-Hartley\u201D) pension: it\u2019s jointly run by the union and the contractors, funded by a set amount your employers pay in for every hour you work.</p><p>Because it follows your <b>hours</b> and not any one employer, you keep building the same pension whether you work for ten contractors or one. It\u2019s governed by federal law (ERISA) and backstopped by a government insurer (the PBGC) if a fund ever runs into trouble.</p><p><b>Bottom line:</b> the more credited hours you bank over your career, the bigger that monthly check.</p></div></details>
<details class="r-acc"><summary>2. The Annuity ${CHEV}</summary>
<div class="body"><p>The annuity is a <b>defined-contribution</b> plan \u2014 a pot of money that belongs to you. Your employers pay a set amount per hour into your individual account, it gets invested, and it grows over your career.</p><p>Unlike the pension (a monthly check), the annuity is a <b>balance</b> \u2014 a real number you can watch grow. When you retire you can typically take it as a lump sum, roll it over, or draw it down. It\u2019s yours.</p></div></details>
<details class="r-acc"><summary>3. The 401(k) &amp; Personal Savings ${CHEV}</summary>
<div class="body"><p>Many locals also offer a <b>401(k)</b> you can contribute to out of your own check, sometimes on top of the annuity. This is the bucket <b>you</b> control \u2014 what you choose to set aside. Combined with anything outside the trade (an IRA, a spouse\u2019s plan), it\u2019s the layer that\u2019s fully in your hands.</p></div></details>
<div class="r-recip">
<div class="tag">FOR TRAVELERS</div>
<h3>Reciprocity: Don\u2019t Leave Your Hours on the Road</h3>
<p>This is the one every tramp needs to understand. When you travel and work in another local\u2019s jurisdiction, that local\u2019s funds collect pension and annuity money on your hours. <b>Reciprocity</b> is the agreement that sends that money back to your <b>home</b> funds \u2014 so the hours you work on the road still build <b>your</b> pension.</p>
<p>It is <b>not always automatic.</b> Many funds require you to sign a reciprocity authorization, sometimes for each local you travel to. Miss it, and your money can sit in a fund you\u2019ll never draw from. <b>Sign your reciprocity paperwork every time you go on the road</b> \u2014 it\u2019s the difference between hours that count and hours that vanish.</p>
</div>
<div class="r-sec">What to Do at <span class="a">Each Stage</span></div>
<div class="r-secs">A quick gut-check for wherever you are in your career.</div>
<div class="r-stages">
<div class="r-stage"><div class="s">Apprentice</div><div class="p">You\u2019re already vesting. Learn the three buckets now, and start any 401(k) match you can \u2014 time is the one thing you can\u2019t buy back later.</div></div>
<div class="r-stage"><div class="s">Journeyman</div><div class="p">Track your credited hours. Sign reciprocity every time you travel. Check your annuity balance yearly \u2014 know your numbers.</div></div>
<div class="r-stage"><div class="s">Nearing Retirement</div><div class="p">Request an estimate from your fund office. Understand your pension options (single vs. survivor) before you sign anything \u2014 they\u2019re usually permanent.</div></div>
</div>
<div class="r-guard"><b>One important note:</b> this is a plain-English guide to how union retirement generally works \u2014 not financial advice, and the exact rules, contribution rates, and vesting schedules vary by fund. For your actual numbers and options, contact your <b>pension fund office</b> and read your plan\u2019s <b>Summary Plan Description (SPD)</b>. When it\u2019s time to retire, those are the people to talk to.</div>
<div class="r-close"><h3>You earned <b>every hour</b> of it.</h3><p>The work is hard on the body. The payoff is a retirement most people never get \u2014 a check for life, a pot of money, and savings on top. Know how it works, protect your hours, and it\u2019ll be there when you hang up the tools.</p><a href="/">Back to the board \u2192</a></div>
</main>
${footer()}
</body></html>`;
}
module.exports = { retirementPage };
