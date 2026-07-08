function historyPage() {
  const title = 'The History of Organized Labor | TrampHereBro';
  const desc = 'The 40-hour week, the weekend, workplace safety, overtime — every benefit workers carry today was won by organized labor. A timeline of the labor movement, built for the traveling trades.';
  const HS = `
  .h-lead{font-size:18px;line-height:1.7;margin:0 0 8px}.h-lead b{color:var(--navy)}
  .h-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:30px 0 44px}
  .h-stat{background:var(--card);border:1px solid var(--line);border-top:3px solid var(--orange);border-radius:12px;padding:18px 12px;text-align:center}
  .h-stat .n{font-family:'Space Grotesk',sans-serif;font-size:29px;font-weight:700;color:var(--navy);line-height:1}
  .h-stat .l{font-size:11.5px;color:var(--slate);margin-top:7px;font-weight:500}
  .h-sect{font-family:'Space Grotesk',sans-serif;font-size:25px;color:var(--navy);font-weight:700;margin:8px 0 4px;letter-spacing:-.01em}
  .h-sect .accent{color:var(--orange)}
  .h-sub{color:var(--slate);font-size:14px;margin-bottom:24px}
  .h-tl{border-left:2px solid var(--line);margin-left:8px}
  .h-i{position:relative;padding:0 0 26px 28px}
  .h-i:before{content:'';position:absolute;left:-7px;top:4px;width:12px;height:12px;border-radius:50%;background:var(--orange);border:2px solid var(--bg)}
  .h-y{font-family:'Space Grotesk',sans-serif;font-weight:700;color:var(--orange);font-size:15px}
  .h-e{font-weight:700;color:var(--navy);font-size:16px;margin:2px 0 4px}
  .h-d{color:var(--charcoal);font-size:14.5px;line-height:1.6}
  .h-won{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:22px}
  .h-w{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
  .h-w .h{font-weight:700;color:var(--navy);font-size:14.5px;margin-bottom:3px}
  .h-w .d{color:var(--slate);font-size:13px}
  .h-close{background:var(--navy);color:#fff;border-radius:16px;padding:30px 32px;margin-top:44px;text-align:center}
  .h-close h3{font-family:'Space Grotesk',sans-serif;font-size:22px;margin-bottom:10px}.h-close h3 b{color:var(--orange)}
  .h-close p{color:#c6d6ef;font-size:15px;max-width:560px;margin:0 auto 18px;line-height:1.6}
  .h-close a{display:inline-block;background:var(--orange);color:#fff;text-decoration:none;font-weight:700;padding:11px 22px;border-radius:10px;font-size:14px}
  @media(max-width:640px){.h-stats{grid-template-columns:repeat(2,1fr)}.h-won{grid-template-columns:1fr}}`;
  const TL = [
    ['1794','The First American Trade Union','The Federal Society of Journeymen Cordwainers \u2014 shoemakers \u2014 organizes in Philadelphia, widely counted as the first sustained trade union in the country. Skilled hands, banding together for fair pay. Sound familiar?'],
    ['1869','The Knights of Labor','One of the first major labor organizations, and radical for its day \u2014 it opened its ranks broadly across skill, race, and gender when almost nothing else did.'],
    ['1886','Haymarket & the 8-Hour Day','Workers across the country walked for the eight-hour day. The events at Chicago\u2019s Haymarket became a rallying point that pushed the eight-hour standard around the world \u2014 the workday you clock today.'],
    ['1886','The AFL Is Founded','Samuel Gompers builds the American Federation of Labor, organizing skilled craft workers into trade unions \u2014 the craft-union model the building trades still run on.'],
    ['1911','The Triangle Shirtwaist Fire','146 garment workers, most of them young immigrant women, died when locked exits trapped them inside a burning factory. The outrage drove landmark fire-code and workplace-safety reform.'],
    ['1935','The Wagner Act','The National Labor Relations Act guarantees private-sector workers the right to organize, join a union, and bargain collectively. The legal backbone of everything that followed.'],
    ['1938','The Fair Labor Standards Act','The federal minimum wage. The 40-hour week. Time-and-a-half overtime. Hard limits on child labor. One law, and unions put it there.'],
    ['1947','Taft-Hartley','Congress rolls back parts of the Wagner Act, restricting certain union tactics. A reminder that the fight never really ends \u2014 it just changes shape.'],
    ['1955','The AFL-CIO Merger','The two largest labor federations merge into one, consolidating the national voice of American labor.'],
    ['1970','OSHA','The Occupational Safety and Health Act creates enforceable federal safety standards. Those rules \u2014 the ones that gripe you on a Monday morning safety brief \u2014 are why more of us make it home.'],
    ['Today','The Building Trades Right Now','Registered apprenticeships, project labor agreements, and a data-center and energy boom driving record demand for skilled union hands. The road\u2019s as busy as it\u2019s been in a generation \u2014 and you\u2019re on it.'],
  ];
  const WON = [
    ['The weekend','Two days off wasn\u2019t a gift. It was won.'],
    ['The 8-hour day','Before the fight, 12\u201316 hour days were normal.'],
    ['Overtime pay','Time-and-a-half past 40 \u2014 codified in 1938.'],
    ['Workplace safety','OSHA, fire codes, and the right to refuse unsafe work.'],
    ['Child labor laws','Kids belong in school, not in the mill.'],
    ['Employer health & pensions','Benefits bargained at the table, not begged for.'],
  ];
  const tl = TL.map(t => `<div class="h-i"><div class="h-y">${t[0]}</div><div class="h-e">${esc(t[1])}</div><div class="h-d">${esc(t[2])}</div></div>`).join('');
  const won = WON.map(w => `<div class="h-w"><div class="h">${esc(w[0])}</div><div class="d">${esc(w[1])}</div></div>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${CANON}/history">
<meta property="og:type" content="article"><meta property="og:site_name" content="TrampHereBro">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${CANON}/history"><meta property="og:image" content="${CANON}/share-banner.png">
<meta name="twitter:card" content="summary_large_image">
${FAVICON_LINK}
${FONTS}${GA_TAG}
<style>${CSS}${HS}</style>
</head><body>
${topbar('history')}
<header><div class="hero-inner">
<div class="crumbs"><a href="/">Board</a> \u203a History</div>
<div class="kick"><span class="dot"></span>The Fight Behind the Trade</div>
<h1 class="lede">The History of <b>Organized Labor</b></h1>
<div class="hsub">Every hand on the road today stands on ground that was fought for. Here\u2019s how it was won \u2014 and why the book you sign still matters.</div>
</div></header>
<main class="wrap">
<p class="h-lead">The 40-hour work week. The weekend. Workplace safety. Overtime. Health coverage. A pension you can retire on. <b>Every one of these was fought for \u2014 and won \u2014 by workers who organized.</b> None of it was handed down. It was bargained for at the table, walked for on the line, and in more cases than anyone should have to remember, bled for on the job.</p>
<div class="h-stats">
<div class="h-stat"><div class="n">150+</div><div class="l">Years fighting for workers</div></div>
<div class="h-stat"><div class="n">16M+</div><div class="l">Workers repped by unions</div></div>
<div class="h-stat"><div class="n">~18%</div><div class="l">Union wage premium</div></div>
<div class="h-stat"><div class="n">$0</div><div class="l">To join an apprenticeship</div></div>
</div>
<div class="h-sect">A <span class="accent">Timeline</span> of the Labor Movement</div>
<div class="h-sub">From the first trade societies to the laws that still protect you on the job today.</div>
<div class="h-tl">${tl}</div>
<div class="h-sect" style="margin-top:40px">What <span class="accent">Unions Won</span> for Every American</div>
<div class="h-sub">Union or not, your life is better because organized workers refused to take less.</div>
<div class="h-won">${won}</div>
<div class="h-close"><h3>You\u2019re part of <b>that story</b> now.</h3><p>Every call you chase, every book you sign, every mile you tramp \u2014 you\u2019re carrying a 150-year tradition of skilled hands looking out for each other. That\u2019s the brotherhood and sisterhood that makes the road possible.</p><a href="/">See who\u2019s hiring \u2192</a></div>
</main>
${footer()}
</body></html>`;
}
module.exports = { historyPage };
