import { chromium, firefox, webkit, devices } from 'playwright';

const targetRaw = process.env.TARGET_URL;
if (!targetRaw) throw new Error('TARGET_URL is required');
const target: string = targetRaw;
const maxPages = Number(process.env.QA_MAX_PAGES || 40);

type Result = { id:string; status:'PASS'|'FAIL'|'BLOCKED'|'NOT_FOUND'; module:string; actual:string; url:string };
const results: Result[] = [];
const add = (r:Result) => { results.push(r); console.log(JSON.stringify(r)); };

async function health() {
  const candidates = ['/api/health','/health','/'];
  for (const path of candidates) {
    try {
      const r = await fetch(new URL(path, target));
      if (r.status < 500) {
        add({ id:'HEALTH', status:r.ok?'PASS':'FAIL', module:'Health', actual:`HTTP ${r.status}`, url:r.url });
        return;
      }
    } catch {}
  }
  add({ id:'HEALTH', status:'FAIL', module:'Health', actual:'No health/root endpoint responded', url:target });
}

async function discover() {
  const browser = await chromium.launch({ headless:true });
  const context = await browser.newContext({ ignoreHTTPSErrors:true });
  const queue:string[] = [target];
  const seen = new Set<string>();
  try {
    while (queue.length && seen.size < maxPages) {
      const url = queue.shift()!;
      if (seen.has(url)) continue;
      seen.add(url);
      const page = await context.newPage();
      try {
        const r = await page.goto(url, { waitUntil:'domcontentloaded', timeout:25000 });
        add({ id:`PAGE-${seen.size}`, status:r && r.status()<500?'PASS':'FAIL', module:'Discovery', actual:`HTTP ${r?.status() ?? 'none'} title=${await page.title()}`, url:page.url() });
        const forms = await page.locator('form').count();
        const buttons = await page.locator('button,input[type=submit]').count();
        if (forms || buttons) add({ id:`INTERACTION-${seen.size}`, status:'PASS', module:'UI', actual:`forms=${forms} buttons=${buttons}`, url:page.url() });
        const links = await page.locator('a[href]').evaluateAll((els:any[]) => els.map((e:any)=>e.href));
        for (const href of links) {
          try {
            const u = new URL(href);
            if (u.origin === new URL(target).origin && !u.hash && !seen.has(u.toString())) queue.push(u.toString());
          } catch {}
        }
      } catch (e) {
        add({ id:`PAGE-${seen.size}`, status:'BLOCKED', module:'Discovery', actual:String(e), url });
      } finally { await page.close(); }
    }
  } finally { await context.close(); await browser.close(); }
  return seen.size;
}

async function compatibility() {
  const matrix:any[] = [
    ['Chromium', chromium, undefined],
    ['Firefox', firefox, undefined],
    ['WebKit', webkit, undefined],
    ['iPhone', webkit, devices['iPhone 15']],
    ['Android', chromium, devices['Pixel 7']],
  ];
  for (const [name, launcher, device] of matrix) {
    let browser:any;
    try {
      browser = await launcher.launch({ headless:true });
      const context = await browser.newContext(device ? { ...device, ignoreHTTPSErrors:true } : { ignoreHTTPSErrors:true });
      const page = await context.newPage();
      const r = await page.goto(target, { waitUntil:'domcontentloaded', timeout:25000 });
      add({ id:`COMPAT-${name}`, status:r && r.status()<400?'PASS':'FAIL', module:'Compatibility', actual:`HTTP ${r?.status()}`, url:page.url() });
      await context.close();
    } catch (e) {
      add({ id:`COMPAT-${name}`, status:'BLOCKED', module:'Compatibility', actual:String(e), url:target });
    } finally { if (browser) await browser.close().catch(()=>{}); }
  }
}

await health();
const pages = await discover();
await compatibility();
const summary = {
  target,
  pages,
  totals: {
    pass: results.filter(r=>r.status==='PASS').length,
    fail: results.filter(r=>r.status==='FAIL').length,
    blocked: results.filter(r=>r.status==='BLOCKED').length,
    notFound: results.filter(r=>r.status==='NOT_FOUND').length,
  },
  verdict: results.some(r=>r.status==='FAIL') ? 'NOT PRODUCTION READY' : 'NO CRITICAL FAILURE FOUND',
  results,
};
console.log('FULLQA_SUMMARY '+JSON.stringify(summary));
if (summary.totals.fail) process.exitCode = 1;
