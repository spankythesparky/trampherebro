import { chromium } from 'playwright';

// Render a JS-heavy dispatch page in a real browser and return visible text.
// Reads the main document AND every embedded frame (e.g. published Google Docs),
// so locals that embed their jobline still get scraped.
export async function renderDispatchText(url) {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 900 },
      locale: 'en-US'
    });
    const page = await ctx.newPage();
    let resp;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        break;
      } catch (e) {
        if (attempt === 2) throw e;
        await page.waitForTimeout(2000);
      }
    }
    if (resp && resp.status() >= 400) throw new Error('HTTP ' + resp.status());
    await page.waitForTimeout(5000); // let client JS + embeds finish loading

    // WorkingSystems dispatch pages (IBEW 569, 71, and the rest of that family)
    // hide the important half of each call -- "Positions Requested", wage,
    // worksite, report time -- behind a "Show Details" toggle. innerText() only
    // returns VISIBLE text, so those calls came back with num_needed = null.
    //
    // Click ONLY that specific control. An earlier attempt clicked every
    // [aria-expanded] / .collapsed element on the page and broke nav menus,
    // making things worse. Narrow beats clever here.
    for (const frame of page.frames()) {
      try {
        const btn = frame.getByText('Show Details', { exact: false }).first();
        if (await btn.count()) {
          await btn.click({ timeout: 5000 });
          await page.waitForTimeout(2000);
        }
      } catch (e) { /* no such control on this page -- fine */ }
    }

    // Collect visible text from the main page and every embedded frame.
    const parts = [];
    for (const frame of page.frames()) {
      try {
        const t = (await frame.locator('body').innerText()).replace(/\s+/g, ' ').trim();
        if (t) parts.push(t);
      } catch (e) { /* skip frames that can't be read */ }
    }
    // De-dupe (main frame body sometimes repeats) and join.
    const text = [...new Set(parts)].join('\n\n');
    return text.slice(0, 45000);
  } finally {
    await browser.close();
  }
}
