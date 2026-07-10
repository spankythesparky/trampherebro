function uaHistoryPage() {
  const title = 'The History of the UA — Plumbers & Pipefitters Union History | TrampHereBro';
  const desc = 'How the United Association was built, in plain English. From its 1889 Washington founding and the Steamfitters War to the 1936 federal apprenticeship, Veterans in Piping, and today\u2019s LNG and data-center boom \u2014 the story of the pipe trades for the traveling brotherhood.';
  const HS = `
  .h-lead{font-size:18px;line-height:1.7;margin:0 0 8px}.h-lead b{color:var(--navy)}
  .h-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:30px 0 30px}
  .h-stat{background:var(--card);border:1px solid var(--line);border-top:3px solid var(--orange);border-radius:12px;padding:18px 12px;text-align:center}
  .h-stat .n{font-family:'Space Grotesk',sans-serif;font-size:28px;font-weight:700;color:var(--navy);line-height:1}
  .h-stat .l{font-size:11.5px;color:var(--slate);margin-top:7px;font-weight:500}
  .h-pull{border-left:3px solid var(--orange);background:var(--card);padding:14px 18px;margin:22px 0 34px;border-radius:0 10px 10px 0;font-size:15px;font-style:italic;color:var(--navy)}
  .h-sect{font-family:'Space Grotesk',sans-serif;font-size:25px;color:var(--navy);font-weight:700;margin:8px 0 4px;letter-spacing:-.01em}
  .h-sect .accent{color:var(--orange)}
  .h-sub{color:var(--slate);font-size:14px;margin-bottom:24px}
  .h-tl{border-left:2px solid var(--line);margin-left:8px}
  .h-i{position:relative;padding:0 0 26px 28px}
  .h-i:before{content:'';position:absolute;left:-7px;top:4px;width:12px;height:12px;border-radius:50%;background:var(--orange);border:2px solid var(--bg)}
  .h-y{font-family:'Space Grotesk',sans-serif;font-weight:700;color:var(--orange);font-size:15px}
  .h-e{font-weight:700;color:var(--navy);font-size:16px;margin:2px 0 4px}
  .h-d{color:var(--charcoal);font-size:14.5px;line-height:1.6}
  .h-close{background:var(--navy);color:#fff;border-radius:16px;padding:30px 32px;margin-top:44px;text-align:center}
  .h-close h3{font-family:'Space Grotesk',sans-serif;font-size:22px;margin-bottom:10px}.h-close h3 b{color:var(--orange)}
  .h-close p{color:#c6d6ef;font-size:15px;max-width:580px;margin:0 auto 18px;line-height:1.6}
  .h-close a{display:inline-block;background:var(--orange);color:#fff;text-decoration:none;font-weight:700;padding:11px 22px;border-radius:10px;font-size:14px}
  @media(max-width:640px){.h-stats{grid-template-columns:repeat(2,1fr)}}`;
  const TL = [
    ['Pre-1889','Three Crafts, Many Wars','Plumbers, steamfitters, and gas fitters organized city by city as America laid its first sewer systems and piped in gas and steam heat. Independent locals, no national body, and constant friction over who did which work.'],
    ['1889','The United Association Is Born','Delegates meet in Washington, D.C., and charter the United Association of Journeymen Plumbers, Gas Fitters, Steam Fitters, and Steam Fitters\u2019 Helpers \u2014 uniting every pipe-trades local under one national banner: standardized craft, protected travelers, shared apprenticeship.'],
    ['1890s-1900s','P.J. Quinlan & the Steamfitters\u2019 War','A bitter jurisdictional fight between plumbers and steamfitters nearly tore the young union apart. It took the intervention of the American Federation of Labor \u2014 and leaders like P.J. Quinlan \u2014 to finally settle who controlled pipe work and bind the crafts together for good.'],
    ['1936','Federal Apprenticeship Standards','The UA helps establish federally recognized apprenticeship \u2014 the earn-while-you-learn model that made the union pipefitter and plumber a byword for skill, and still trains the trade today.'],
    ['Postwar','The Peak of the Pipe Trades','The postwar building boom \u2014 refineries, power plants, high-rises, industrial expansion \u2014 drove the UA to its peak. Pipefitters and welders became indispensable to America\u2019s heavy industry.'],
    ['2008','Veterans in Piping','The UA launches the Veterans in Piping (VIP) program, placing thousands of transitioning service members directly into journey-track careers in welding and the pipe trades \u2014 one of the most respected veteran-to-trade pipelines in the country.'],
    ['Today','Building the Energy Transition','Around 396,000 members across roughly 274 locals. The UA\u2019s welders and pipefitters are building the LNG export terminals, the data centers, the semiconductor fabs, and the energy infrastructure of the modern era. Quietly, the pipe trades shape the physical backbone of what comes next.'],
  ];
  const tl = TL.map(t => `<div class="h-i"><div class="h-y">${t[0]}</div><div class="h-e">${esc(t[1])}</div><div class="h-d">${esc(t[2])}</div></div>`).join('');
  const ld = {
    "@context":"https://schema.org","@type":"Article",
    "headline":"The History of the UA \u2014 Plumbers & Pipefitters Union History",
    "about":["United Association","UA union history","plumbers and pipefitters union","pipe trades history"],
    "author":{"@type":"Person","name":"Noah \u2014 Spanky The Sparky"},
    "publisher":{"@type":"Organization","name":"TrampHereBro"},
    "mainEntityOfPage":CANON+"/uahistory",
    "description":desc
  };
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta name="keywords" content="UA history, United Association history, plumbers union history, pipefitters union history, pipe trades, steamfitters, union apprenticeship, traveling pipefitter">
<link rel="canonical" href="${CANON}/uahistory">
<meta property="og:type" content="article"><meta property="og:site_name" content="TrampHereBro">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${CANON}/uahistory"><meta property="og:image" content="${CANON}/share-banner.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
${FAVICON_LINK}
${FONTS}${GA_TAG}
<style>${CSS}${HS}</style>
</head><body>
${topbar('uahistory')}
<header><div class="hero-inner">
<div class="crumbs"><a href="/">Board</a> \u203a UA History</div>
<div class="kick"><span class="dot"></span>The Pipe Trades\u2019 Long Brotherhood</div>
<h1 class="lede">The History of the <b>UA</b></h1>
<div class="hsub">From a war between plumbers and steamfitters to the trade building the LNG terminals and data centers \u2014 the story of the United Association.</div>
</div></header>
<main class="wrap">
<p class="h-lead">In 1889, delegates from a handful of feuding local pipe-trades unions met in Washington, D.C., and founded the <b>United Association of Journeymen Plumbers, Gas Fitters, Steam Fitters, and Steam Fitters\u2019 Helpers</b>. The goal was simple and enormous: bind every pipe-trades local in North America into one body that could standardize the craft, protect traveling members, and bargain on equal footing with employers. It would take two decades and a brutal jurisdictional war to secure \u2014 but once it did, the UA became one of the most durable building-trades unions on the continent.</p>
<div class="h-stats">
<div class="h-stat"><div class="n">1889</div><div class="l">Founded in Washington, D.C.</div></div>
<div class="h-stat"><div class="n">396K+</div><div class="l">Members today</div></div>
<div class="h-stat"><div class="n">~274</div><div class="l">Local unions</div></div>
<div class="h-stat"><div class="n">130+</div><div class="l">Years of the trade</div></div>
</div>
<div class="h-pull">\u201CEvery fitting, every weld, every line that moves water, steam, or gas through a building \u2014 a UA hand put it there.\u201D</div>
<div class="h-sect">A <span class="accent">Timeline</span> of the Pipe Trades</div>
<div class="h-sub">From feuding city locals to the backbone of the energy build-out.</div>
<div class="h-tl">${tl}</div>
<div class="h-close"><h3>You keep it <b>flowing</b>.</h3><p>Every mile you tramp to the next call, you\u2019re part of a 130-year brotherhood that started with feuding city locals and built the pipe that runs a continent. Water, steam, gas, and now the energy of the future \u2014 the pipe trades move it all.</p><a href="/">See who\u2019s hiring \u2192</a></div>
</main>
${footer()}
</body></html>`;
}
module.exports = { uaHistoryPage };
