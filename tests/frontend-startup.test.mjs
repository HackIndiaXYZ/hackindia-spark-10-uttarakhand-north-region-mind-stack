import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const frontend=new URL('frontend/Genie final/js/',root);
const env={...process.env,SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'test-public',SUPABASE_SERVICE_ROLE_KEY:'test-admin',GEMINI_API_KEY:'',GEMINI_MODEL:''};
test('feature reads use GET only and generation is an explicit separate action',async()=>{
 const calls=[];const context=vm.createContext({window:{},StudyGenieAPI:{request:async(...args)=>{calls.push(args);return {feature:{content_text:'Saved notes'}};}}});
 vm.runInContext(fs.readFileSync(new URL('workspace.js',frontend),'utf8'),context);
 await context.window.StudyWorkspace.read('source','notes');
 assert.deepEqual(JSON.parse(JSON.stringify(calls)),[['/api/study-sources/source/features/notes']]);
 await context.window.StudyWorkspace.generate('source','notes');
 assert.equal(calls[1][1].method,'POST');assert.deepEqual(JSON.parse(calls[1][1].body),{});
});
test('auth form cannot natively submit while backend is unavailable',async()=>{
 let listener;const context=vm.createContext({document:{querySelectorAll:()=>[{addEventListener:(name,fn)=>listener=fn}],getElementById:()=>({textContent:''})},StudyGenieAPI:{getSupabase:async()=>{throw new Error('offline')}}});
 await vm.runInContext(fs.readFileSync(new URL('auth.js',frontend),'utf8'),context);
 let prevented=false;listener({preventDefault(){prevented=true}});assert.ok(prevented);
});
test('API configuration fetch recovers after a temporary outage',async()=>{
 let attempts=0;const context=vm.createContext({window:{},fetch:async()=>{if(++attempts===1)throw new Error('offline');return {ok:true,json:async()=>({supabaseUrl:'ok'})}}});
 vm.runInContext(fs.readFileSync(new URL('api.js',frontend),'utf8'),context);
 await assert.rejects(context.window.StudyGenieAPI.loadConfig());assert.equal((await context.window.StudyGenieAPI.loadConfig()).supabaseUrl,'ok');
});
test('server remains alive from an unrelated working directory without Gemini secrets',async()=>{
 // Reserve a free port then release it before starting the real process.
 const net=await import('node:net');const socket=net.createServer().listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));
 const child=spawn(process.execPath,[fileURLToPath(new URL('StudyGenie_Backend/backend/src/server.js',root))],{cwd:fileURLToPath(new URL('tests/',root)),env:{...env,PORT:String(port)},windowsHide:true});
 let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
 try {
   let response;
   for(let i=0;i<100;i++){try{response=await fetch('http://127.0.0.1:'+port+'/api/health');break}catch{await new Promise(r=>setTimeout(r,50))}}
   assert.equal(response?.status,200,output);assert.equal(child.exitCode,null);assert.equal((await response.json()).ok,true);
 }finally{child.kill();await once(child,'close')}
});
test('missing backend configuration fails clearly instead of supabaseUrl stack error',async()=>{
 const child=spawn(process.execPath,[fileURLToPath(new URL('StudyGenie_Backend/backend/src/server.js',root))],{env:{...env,SUPABASE_URL:''},windowsHide:true});let output='';child.stderr.on('data',x=>output+=x);const [code]=await once(child,'close');assert.notEqual(code,0);assert.match(output,/Set SUPABASE_URL in backend\/\.env/);
});
test('Python command names remain on PATH; explicit missing paths fail early',async()=>{
 Object.assign(process.env,env);
 const {resolvePythonBin}=await import(new URL('StudyGenie_Backend/backend/src/services/pythonWorker.js',root));
 assert.equal(await resolvePythonBin('python3'),'python3');assert.equal(await resolvePythonBin('py'),'py');
 assert.equal(await resolvePythonBin(process.execPath),process.execPath);
 await assert.rejects(resolvePythonBin('./missing .venv/Scripts/python.exe'),/PYTHON_BIN does not exist/);
});
test('long transcript chunking retains unpunctuated tail and respects bounds',async()=>{
 const {chunkTranscript}=await import(new URL('StudyGenie_Backend/AI/utils/chunkTranscript.js',root));
 const text='Sentence one. '+('longword '.repeat(30))+'UNIQUE_TAIL';const chunks=chunkTranscript(text,40,2);
 assert.ok(chunks.every(x=>x.length<=40));assert.match(chunks.at(-1),/UNIQUE_TAIL/);
 assert.deepEqual(chunkTranscript('A. B. C. D.',5,0),['A. B.','C. D.']);assert.throws(()=>chunkTranscript('x',0));
});

test('frontend maps AI failures and network outages without exposing server HTML',async()=>{
 let status=200,offline=false,payload={};
 const context=vm.createContext({window:{supabaseClient:{auth:{getSession:async()=>({data:{session:{access_token:'test'}}})}}},Headers,fetch:async url=>{
  if(url.endsWith('/api/config/public'))return {ok:true,json:async()=>({supabaseUrl:'url',supabaseAnonKey:'key'})};
  if(offline)throw new TypeError('Failed to fetch');
  return {ok:status===200,status,headers:{get:()=>typeof payload==='string'?'text/html':'application/json'},json:async()=>payload,text:async()=>payload};
 }});
 vm.runInContext(fs.readFileSync(new URL('api.js',frontend),'utf8'),context);
 const request=context.window.StudyGenieAPI.request;
 for(status of [429,503,500]){
  payload={error:'Internal provider details',code:'AI_FALLBACK_EXHAUSTED'};
  await assert.rejects(request('/api/study-sources/source/features/summary',{method:'POST',lectureSaved:true}),error=>{
   assert.equal(error.status,status);assert.equal(error.retryable,true);assert.match(error.message,/lecture is already saved/);assert.match(error.message,/retry later/);assert.ok(!error.message.includes('Internal provider'));return true;
  });
 }
 offline=true;await assert.rejects(request('/api/study-sources/source/features/summary',{lectureSaved:true}),/Unable to connect.*lecture is already saved/);
 offline=false;status=502;payload='<html>private stack trace</html>';await assert.rejects(request('/api/me'),error=>!error.message.includes('private')&&!error.message.includes('already saved'));
 status=401;payload={error:'Please sign in.'};await assert.rejects(request('/api/me'),/Please sign in/);
});

test('Resume selection is account-scoped and only remembers ready lectures',()=>{
 const values=new Map();const context=vm.createContext({window:{},StudyGenieAPI:{},localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}});
 vm.runInContext(fs.readFileSync(new URL('workspace.js',frontend),'utf8'),context);const W=context.window.StudyWorkspace;
 W.remember({id:'ready',user_id:'alice',status:'ready'});W.remember({id:'processing',user_id:'alice',status:'processing'});
 assert.equal(W.remembered('alice'),'ready');assert.equal(W.remembered('bob'),undefined);
});
