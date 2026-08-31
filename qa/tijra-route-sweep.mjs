import fs from 'node:fs';
fs.mkdirSync('artifacts',{recursive:true});
const BASE=(process.env.TARGET_URL||'https://tijra-production.up.railway.app').replace(/\/$/,'');
const RUN=Date.now().toString(36), PW=`Routes!${RUN}Pass`;
const checks=[];
function ck(profile,path,ok,actual){checks.push({profile,path,status:ok?'PASS':'FAIL',actual});console.log(`${ok?'PASS':'FAIL'} | ${profile} | ${path} | ${actual}`)}
async function register(label,businessType,activity){const email=`routes.${RUN}.${label}@example.test`;const r=await fetch(`${BASE}/api/auth/register`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:`QA ${label}`,email,password:PW,businessName:`QA Routes ${label} ${RUN}`,businessType,businessActivity:activity,city:'Jeddah'}),redirect:'manual'});const text=await r.text();if(r.status!==201)throw new Error(`register ${label} ${r.status} ${text.slice(0,200)}`);const cookie=r.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw new Error(`register ${label} cookie missing`);return{cookie,email}}
async function sweep(profile,cookie,paths){for(const path of paths){try{const r=await fetch(BASE+path,{headers:cookie?{cookie}:{},redirect:'follow',signal:AbortSignal.timeout(30000)});await r.arrayBuffer();const final=new URL(r.url).pathname;const loginRedirect=final==='/login'&&!['/login','/register'].includes(path);const publicRegisterRedirect=path==='/register'&&final==='/login';const finalPathOk=final===path||publicRegisterRedirect;const ok=r.status===200&&!loginRedirect&&finalPathOk;ck(profile,path,ok,`status=${r.status} final=${final}${loginRedirect?' unexpected-login':''}${!finalPathOk?' unexpected-final-path':''}`)}catch(e){ck(profile,path,false,String(e))}}}
const health=await fetch(`${BASE}/api/health`);const hj=await health.json();ck('public','/api/health',health.status===200&&hj.ok===true,`status=${health.status} build=${hj.build}`);
await sweep('public',null,['/login','/register']);
const retailer=await register('retailer','RETAILER','GROCERY');
const supplier=await register('supplier','SUPPLIER','OTHER');
const restaurant=await register('restaurant','RETAILER','RESTAURANT');
await sweep('retailer-owner',retailer.cookie,[
 '/','/accounting','/accounting/expenses/new','/activity','/alerts','/catalog','/control-center','/employees','/employees/new',
 '/inventory','/inventory/audit','/inventory/batches','/inventory/closing','/inventory/locations','/inventory/movements','/inventory/new','/inventory/product-settings','/inventory/receiving','/inventory/returns','/inventory/units','/inventory/waste',
 '/management','/marketplace','/marketplace/orders','/marketplace/suppliers','/no-access','/onboarding','/payroll','/products','/purchases','/purchases/invoice','/reorder','/sales','/sales/analytics','/sales/shifts','/smart-alerts','/smart-buy','/staff/inventory','/suppliers','/suppliers/new','/suppliers/prices/new'
]);
await sweep('supplier-owner',supplier.cookie,[
 '/','/marketplace','/marketplace/seller','/supplier/alerts','/supplier/dormant','/supplier/forecast','/supplier/import','/supplier/picking','/supplier/price-intelligence','/supplier/pricing','/supplier/stock-count','/supplier/stock-update',`/supplier/order/qa-invalid-${RUN}`
]);
await sweep('restaurant-owner',restaurant.cookie,['/','/inventory','/sales','/recipes','/smart-buy','/alerts','/accounting','/purchases']);
const fails=checks.filter(x=>x.status==='FAIL');const report={run:RUN,build:hj.build,checks,summary:{pass:checks.length-fails.length,fail:fails.length,total:checks.length},verdict:fails.length?'NOT PRODUCTION READY':'PRODUCTION READY',finishedAt:new Date().toISOString()};
fs.writeFileSync('artifacts/tijra-route-sweep.json',JSON.stringify(report,null,2));fs.writeFileSync('artifacts/tijra-route-sweep.md',[`# Tijra Route Sweep ${RUN}`,`Build: ${report.build}`,`Verdict: ${report.verdict}`,`Pass: ${report.summary.pass} Fail: ${report.summary.fail} Total: ${report.summary.total}`,...checks.map(x=>`${x.status} | ${x.profile} | ${x.path} | ${x.actual}`)].join('\n'));if(fails.length)process.exitCode=1;
