function ibewHistoryPage() {
  const title = 'The History of the IBEW — Wired for the Long Haul | TrampHereBro';
  const desc = 'From a boarding-house room above a St. Louis dance hall in 1891 to over 900,000 members today. Henry Miller, the founding, the Reid-Murphy split, the Council on Industrial Relations, the AT&T breakup, and the data-center boom — the story of the Brotherhood.';
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
    ['1890','The Spark in St. Louis','Electricians working the St. Louis Exposition, tired of long dangerous days for meager pay, charter AFL Federal Labor Union No. 5221 with help from the AFL. A young lineman, Henry Miller, is elected president \u2014 but he knows a single local isn\u2019t enough.'],
    ['1891','The Brotherhood Is Born','On November 21, ten delegates representing 286 members convene in St. Louis and found the National Brotherhood of Electrical Workers. They work day and night for a week drafting the first constitution and the emblem you still see \u2014 a fist grasping lightning bolts. Miller is elected first Grand President.'],
    ['1896','Miller Falls','Henry Miller dies at 38 after an electric shock causes him to fall from a pole. He gave the trade its union and, in the end, his life to the same dangers the Brotherhood was built to fight.'],
    ['1899','\u201CInternational\u201D','As locals charter across Canada as well as the U.S., the union becomes the International Brotherhood of Electrical Workers \u2014 the name it carries today.'],
    ['1908','The Reid-Murphy Split','A bitter internal war \u2014 rooted in the old tension between wiremen and linemen \u2014 fractures the Brotherhood into two rival IBEWs for six years. At one point the breakaway faction claimed three-quarters of all organized electrical workers. It nearly ended the union.'],
    ['1912','Made Whole Again','A court declares the breakaway 1908 convention illegal, and the Brotherhood reunites. The near-death experience left a lasting lesson about the cost of division.'],
    ['1919-20','The Council on Industrial Relations','Membership explodes from 23,500 in 1913 to over 148,000 by 1919. The IBEW and electrical contractors create the Council on Industrial Relations \u2014 a joint body to settle disputes without strikes, a labor-management model that still runs today. Headquarters moves to Washington, D.C.'],
    ['1941','National Apprenticeship Standards','The IBEW helps set national apprenticeship standards \u2014 the earn-while-you-learn training model that made the union electrician synonymous with skill and safety.'],
    ['1980s','The AT&T Breakup','The court-ordered breakup of the Bell System guts tens of thousands of IBEW telecom jobs almost overnight \u2014 one of the hardest blows the Brotherhood ever absorbed, and a hard lesson in adapting to a changing industry.'],
    ['Today','Wired for What\u2019s Next','Over 900,000 members across the U.S., Canada, and beyond. The data-center and clean-energy boom is driving the biggest demand for skilled electrical labor in a generation \u2014 and the Brotherhood is chasing one million members again. The road\u2019s wide open, and you\u2019re on it.'],
  ];
  const tl = TL.map(t => `<div class="h-i"><div class="h-y">${t[0]}</div><div class="h-e">${esc(t[1])}</div><div class="h-d">${esc(t[2])}</div></div>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${CANON}/ibewhistory">
<meta property="og:type" content="article"><meta property="og:site_name" content="TrampHereBro">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${CANON}/ibewhistory"><meta property="og:image" content="${CANON}/share-banner.png">
<meta name="twitter:card" content="summary_large_image">
${FAVICON_LINK}
${FONTS}${GA_TAG}
<style>${CSS}${HS}</style>
</head><body>
${topbar('ibewhistory')}
<header><div class="hero-inner">
<div class="crumbs"><a href="/">Board</a> \u203a IBEW History</div>
<div class="kick"><span class="dot"></span>Wired for the Long Haul</div>
<h1 class="lede">The History of the <b>IBEW</b></h1>
<div class="hsub">From a boarding-house room above a St. Louis dance hall to nearly a million members \u2014 the story of the Brotherhood you carry a card in.</div>
</div></header>
<main class="wrap">
<p class="h-lead">In 1891, a traveling lineman named <b>Henry Miller</b> rode the rails city to city \u2014 tools and a spare shirt in a carpetbag \u2014 organizing electrical workers wherever he found them. That November, ten delegates representing 286 members met in a rented room above Stolley\u2019s Dance Hall in a poor section of St. Louis and founded what became the <b>International Brotherhood of Electrical Workers</b>. It was a humble start for a trade so dangerous that Miller himself would be dead within five years \u2014 killed by a fall after an electric shock. But the Brotherhood he built is now the largest electrical union in the world.</p>
<div class="h-stats">
<div class="h-stat"><div class="n">1891</div><div class="l">Founded in St. Louis</div></div>
<div class="h-stat"><div class="n">900K+</div><div class="l">Members today</div></div>
<div class="h-stat"><div class="n">10</div><div class="l">Founding delegates</div></div>
<div class="h-stat"><div class="n">130+</div><div class="l">Years of the Brotherhood</div></div>
</div>
<div class="h-pull">\u201CNo man could have done more for our union in its first years than he did.\u201D \u2014 J.T. Kelly, first Secretary, on Henry Miller</div>
<div class="h-sect">A <span class="accent">Timeline</span> of the Brotherhood</div>
<div class="h-sub">From ten men in a rented room to the trade powering the modern grid.</div>
<div class="h-tl">${tl}</div>
<div class="h-close"><h3>You carry <b>that card</b> now.</h3><p>Every hot day in the ditch, every night shift at the data center, every mile you tramp to the next call \u2014 you\u2019re part of a 130-year line that runs straight back to ten men in a rented room who refused to take less. Wire it up, brother.</p><a href="/">See who\u2019s hiring \u2192</a></div>
</main>
${footer()}
</body></html>`;
}
module.exports = { ibewHistoryPage };
