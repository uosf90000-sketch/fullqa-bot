import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { buildPrompt } from './prompt.js';

type Job = { id:string; target:string; status:'queued'|'running'|'passed'|'failed'; startedAt?:string; finishedAt?:string; exitCode?:number|null; log:string[] };
const port = Number(process.env.PORT || 3000);
const jobs = new Map<string, Job>();

function send(res:http.ServerResponse,status:number,body:unknown,type='application/json; charset=utf-8') {
  res.writeHead(status,{ 'content-type':type, 'cache-control':'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : String(body));
}
async function readJson(req:http.IncomingMessage) {
  const chunks:Buffer[]=[]; for await (const c of req) chunks.push(Buffer.from(c));
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string,unknown> : {};
}
function urls(raw:unknown) {
  const input = Array.isArray(raw) ? raw : String(raw || '').split(/\r?\n|,/);
  const out:string[]=[];
  for (const value of input) {
    try { const u=new URL(String(value).trim()); if(['http:','https:'].includes(u.protocol)) out.push(u.toString().replace(/\/$/,'')); } catch {}
  }
  return [...new Set(out)];
}
function run(target:string) {
  const id=randomUUID(); const job:Job={id,target,status:'queued',log:[]}; jobs.set(id,job);
  const child=spawn(process.execPath,['--import','tsx','src/runner.ts'],{ env:{...process.env,TARGET_URL:target}, cwd:process.cwd() });
  job.status='running'; job.startedAt=new Date().toISOString();
  const append=(c:Buffer)=>{ job.log.push(...c.toString('utf8').split(/\r?\n/).filter(Boolean)); if(job.log.length>1200) job.log.splice(0,job.log.length-1200); };
  child.stdout.on('data',append); child.stderr.on('data',append);
  child.on('error',e=>{job.log.push(String(e));job.status='failed';job.finishedAt=new Date().toISOString();});
  child.on('close',code=>{job.exitCode=code;job.status=code===0?'passed':'failed';job.finishedAt=new Date().toISOString();});
  return job;
}

const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FullQA Bot</title><style>body{margin:0;background:#07111f;color:#eef4ff;font-family:system-ui}.w{max-width:950px;margin:auto;padding:22px}.card{background:#0c1829;border:1px solid #223956;border-radius:20px;padding:20px;margin-bottom:16px}h1{margin:0 0 8px}label{display:block;font-weight:700;margin:12px 0 6px}input,textarea{box-sizing:border-box;width:100%;padding:12px;border-radius:10px;border:1px solid #304766;background:#081321;color:white}textarea{min-height:120px}button{margin:12px 6px 0 0;padding:12px 16px;border:0;border-radius:10px;font-weight:800;cursor:pointer}.p{background:#edf4ff;color:#07111f}.s{background:#193453;color:white}.muted{color:#9eb0c7}.job{border-top:1px solid #223956;padding:12px 0}.badge{padding:3px 8px;border-radius:99px;background:#193453}pre{white-space:pre-wrap;word-break:break-word;background:#050b13;padding:12px;border-radius:10px;max-height:420px;overflow:auto}</style></head><body><div class="w"><div class="card"><h1>FullQA Bot</h1><div class="muted">اختبر أي تطبيق أو عدة تطبيقات من لوحة واحدة.</div><label>اسم المشروع</label><input id="name" placeholder="مثال: مشروعي"><label>روابط التطبيقات — رابط بكل سطر</label><textarea id="urls" placeholder="https://app1.example.com\nhttps://app2.example.com"></textarea><label>ملاحظات أو ميزات خاصة</label><textarea id="notes" placeholder="أدوار، كاميرا، باركود، دفع، مخزون..."></textarea><button class="p" onclick="promptQa()">توليد برومبت شامل</button><button class="s" onclick="runQa()">تشغيل QA عام</button></div><div id="promptCard" class="card" hidden><h2>برومبت الاختبار</h2><button class="s" onclick="navigator.clipboard.writeText(document.getElementById('prompt').textContent)">نسخ</button><pre id="prompt"></pre></div><div class="card"><h2>الاختبارات</h2><div id="jobs" class="muted">لا توجد عمليات.</div></div></div><script>const e=id=>document.getElementById(id);const payload=()=>({name:e('name').value,urls:e('urls').value,notes:e('notes').value});async function promptQa(){const r=await fetch('/api/prompt',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload())});const d=await r.json();e('prompt').textContent=d.prompt||d.error;e('promptCard').hidden=false}async function runQa(){const r=await fetch('/api/run',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload())});const d=await r.json();if(d.error)alert(d.error);refresh()}function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}async function refresh(){const d=await (await fetch('/api/jobs')).json();e('jobs').innerHTML=d.jobs.length?d.jobs.map(j=>'<div class="job"><b>'+esc(j.target)+'</b> <span class="badge">'+j.status+'</span><details><summary>السجل</summary><pre>'+esc(j.log.slice(-200).join('\n'))+'</pre></details></div>').join(''):'لا توجد عمليات.'}setInterval(refresh,3000);refresh();</script></body></html>`;

http.createServer(async(req,res)=>{
  try {
    const u=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
    if(req.method==='GET'&&u.pathname==='/') return send(res,200,html,'text/html; charset=utf-8');
    if(req.method==='GET'&&u.pathname==='/health') return send(res,200,{ok:true,service:'fullqa-bot',jobs:jobs.size});
    if(req.method==='GET'&&u.pathname==='/api/jobs') return send(res,200,{jobs:[...jobs.values()].sort((a,b)=>(b.startedAt||'').localeCompare(a.startedAt||''))});
    if(req.method==='POST'&&u.pathname==='/api/prompt'){const b=await readJson(req);const list=urls(b.urls);if(!list.length)return send(res,400,{error:'أدخل رابطًا صحيحًا.'});return send(res,200,{prompt:buildPrompt({name:String(b.name||''),urls:list,notes:String(b.notes||'')})});}
    if(req.method==='POST'&&u.pathname==='/api/run'){const b=await readJson(req);const list=urls(b.urls);if(!list.length)return send(res,400,{error:'أدخل رابطًا صحيحًا.'});return send(res,202,{jobs:list.map(t=>{const j=run(t);return{id:j.id,target:j.target,status:j.status}})});}
    return send(res,404,{error:'NOT_FOUND'});
  } catch(e){return send(res,500,{error:String(e)});}
}).listen(port,'0.0.0.0',()=>console.log(`FullQA listening on ${port}`));
