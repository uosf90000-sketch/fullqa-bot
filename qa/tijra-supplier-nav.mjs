import fs from 'node:fs';
import { chromium } from 'playwright';
fs.mkdirSync('artifacts/supplier-nav',{recursive:true});
const BASE=(process.env.TARGET_URL||'https://tijra-production.up.railway.app').replace(/\/$/,'');
const RUN=Date.now().toString(36);const PW=`Nav!${RUN}Pass`;const checks=[];
function ck(name,ok,actual){checks.push({name,status:ok?'PASS':'FAIL',actual:String(actual)});console.log(`${ok?'PASS':'FAIL'} | ${name} | ${actual}`)}
const email=`nav.${RUN}@example.test`;
const reg=await fetch(`${BASE}/api/auth/register`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'QA Supplier Nav',email,password:PW,businessName:`QA Supplier Nav ${RUN}`,businessType:'SUPPLIER',businessActivity:'OTHER',city:'Jeddah'}),redirect:'manual'});const body=await reg.text();ck('register supplier',reg.status===201,reg.status);if(reg.status!==201)throw new Error(body);const cookieRaw=reg.headers.get('set-cookie')?.split(';')[0];if(!cookieRaw)throw new Error('session cookie missing');const eq=cookieRaw.indexOf('=');const name=cookieRaw.slice(0,eq),value=cookieRaw.slice(eq+1);
const browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([{name,value,url:BASE}]);const page=await context.newPage();
try{
 const r=await page.goto(`${BASE}/marketplace/seller`,{waitUntil:'domcontentloaded',timeout:30000});ck('seller page HTTP',r?.status()===200,r?.status());
 await page.waitForResponse(res=>res.url().includes('/api/auth/me')&&res.status()===200,{timeout:15000}).catch(()=>null);
 await page.waitForTimeout(800);
 const section=page.locator('details.navSection').filter({hasText:'البيع والطلبات'});ck('supplier sales/orders section exists',await section.count()===1,await section.count());
 if(await section.count()){await section.locator('summary').click();}
 const link=page.locator('a[href="/supplier/picking"]');ck('picking link exists in rendered sidebar',await link.count()===1,await link.count());
 if(await link.count()){ck('picking link text',((await link.textContent())||'').includes('تجهيز الطلبات بالمسح'),await link.textContent());await link.click();await page.waitForURL('**/supplier/picking',{timeout:15000});}
 ck('navigation reaches picking route',new URL(page.url()).pathname==='/supplier/picking',page.url());
 ck('picking heading rendered',await page.getByRole('heading',{name:'تجهيز الطلبات بالمسح'}).count()>0,await page.title());
 await page.screenshot({path:'artifacts/supplier-nav/picking-navigation.png',fullPage:true});
}catch(e){ck('browser flow',false,e instanceof Error?e.stack||e.message:String(e));await page.screenshot({path:'artifacts/supplier-nav/failure.png',fullPage:true}).catch(()=>{});}finally{await browser.close();}
const fails=checks.filter(x=>x.status==='FAIL');const report={run:RUN,checks,summary:{pass:checks.length-fails.length,fail:fails.length,total:checks.length},verdict:fails.length?'FAIL':'PASS'};fs.writeFileSync('artifacts/supplier-nav/report.json',JSON.stringify(report,null,2));fs.writeFileSync('artifacts/supplier-nav/report.md',[`# Supplier Picking Navigation ${RUN}`,`Verdict: ${report.verdict}`,...checks.map(x=>`${x.status} | ${x.name} | ${x.actual}`)].join('\n'));if(fails.length)process.exitCode=1;
