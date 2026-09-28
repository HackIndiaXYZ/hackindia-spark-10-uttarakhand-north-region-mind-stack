import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-public';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-admin';
process.env.ENABLE_AI_TRANSCRIPT_CLEANER = 'false';
const aiUrl = new URL('../StudyGenie_Backend/AI/', import.meta.url);
const back = new URL('../StudyGenie_Backend/backend/src/', import.meta.url);
let response = '', prompts = [], calls = [], failure = false, aiFailure = null;
mock.module(new URL('gemini.js', aiUrl).href, { namedExports: { askGemini: async prompt => { prompts.push(prompt); if(aiFailure)throw aiFailure; return response; } } });
const db = {
 study_sources: [{ id:'source', user_id:'alice', status:'ready', title:'Lecture' }],
 transcripts: [{ source_id:'source', user_id:'alice', cleaned_text:'Study cells and their functions.' }],
 generated_content: [], quizzes: [], quiz_attempts: [], profiles: [], generation_locks: [], chat_turns: []
};
const locks = new Map();
let serial = 0;
function from(table) {
 let filters = [], action='select', payload, one=false, limit=Infinity, desc=false;
 const q = {
 select(){return q}, eq(k,v){filters.push(x=>x[k]===v);return q}, in(k,v){filters.push(x=>v.includes(x[k]));return q},
 lt(k,v){filters.push(x=>x[k]<v);return q}, order(){desc=true;return q}, limit(n){limit=n;return q}, single(){one=true;return q}, maybeSingle(){one=true;return q},
 insert(x){action='insert';payload=x;return q}, update(x){action='update';payload=x;return q}, upsert(x){action='upsert';payload=x;return q},
 then(resolve,reject){return Promise.resolve().then(()=>{
   calls.push({table,action}); if(failure) return {data:null,error:new Error('Database unavailable')};
   let rows=db[table].filter(x=>filters.every(f=>f(x)));
   if(action==='insert'){const row={id:'row'+(++serial),...payload}; db[table].push(row); rows=[row];}
   if(action==='upsert'){let row=db[table].find(x=>x.source_id===payload.source_id && x.feature_type===payload.feature_type);if(row)Object.assign(row,payload);else{row={id:'row'+(++serial),...payload};db[table].push(row);}rows=[row];}
   if(action==='update')rows.forEach(x=>Object.assign(x,payload));
   if(desc)rows=[...rows].reverse(); rows=rows.slice(0,limit);
   return {data:one?rows[0]||null:rows,count:rows.length,error:null};
 }).then(resolve,reject)}
 }; return q;
}
mock.module(new URL('supabase.js', back).href,{namedExports:{supabaseAdmin:{from,rpc:async(name,args)=>{if(failure)return {error:new Error('Database unavailable')}; if(name==='get_or_create_study_source') {
  const existing=db.study_sources.filter(x=>x.user_id===args.p_user&&(x.url===args.p_url||x.url_hash===args.p_hash)&&['ready','processing','queued'].includes(x.status)).sort((a,b)=>Number(b.status==='ready')-Number(a.status==='ready'))[0];
  if(existing)return {data:{source:existing,created:false}};
  const row={id:'source'+(++serial),user_id:args.p_user,url:args.p_url,url_hash:args.p_hash,language:args.p_language,status:'queued',created_at:new Date().toISOString()};db.study_sources.push(row);
  return {data:{source:row,created:true}};
} const key=args.p_source+':'+args.p_feature; if(name==='claim_generation'){if(locks.has(key))return {data:false};locks.set(key,args.p_owner);return {data:true};}if(name==='renew_generation')return {data:locks.get(key)===args.p_owner};if(name==='release_generation'){if(locks.get(key)===args.p_owner)locks.delete(key);return {data:null};}throw new Error(name);},auth:{getUser:async token=>({data:{user:token==='alice'?{id:'alice',email:'alice@example.test'}:token==='bob'?{id:'bob'}:null},error:null})}}}});
mock.module(new URL('services/pythonWorker.js', back).href, {namedExports:{ transcribeYouTube: async()=>({text:'Study cells',title:'Biology',segments:[],duration_seconds:30}), stopWorkers(){} }});
const {parseJsonResponse} = await import(new URL('utils/parseJsonResponse.js',aiUrl));
const {normalizeYouTubeUrl,startSourceProcessing} = await import(new URL('services/sourceService.js',back));
const {app} = await import(new URL('server.js',back));

test('JSON parser handles fences, prose, escaped quotes/braces and rejects invalid shapes',()=>{
 assert.deepEqual(parseJsonResponse('```JSON\n[{"x":"a } \\\" b"}]\n```','array'),[{x:'a } " b'}]);
 assert.deepEqual(parseJsonResponse('{"cards":[{"front":"A","back":"B"}]}','array'),[{front:'A',back:'B'}]);
 assert.deepEqual(parseJsonResponse('Result: {"weakTopics":[]} done.','object'),{weakTopics:[]});
 for(const s of ['', 'null', '[1,', '{"x": [1,2]}']) assert.throws(()=>parseJsonResponse(s,'array'));
});
test('canonical video URLs and unsafe/playlist rejection',()=>{
 for(const url of ['https://youtu.be/qOMxCZ0SzBQ?t=2','https://www.youtube.com/watch?v=qOMxCZ0SzBQ&list=xx','https://youtube.com/shorts/qOMxCZ0SzBQ'])assert.equal(normalizeYouTubeUrl(url),'https://www.youtube.com/watch?v=qOMxCZ0SzBQ');
 for(const url of ['file://youtube.com/watch?v=qOMxCZ0SzBQ','https://youtube.com/playlist?list=xx','https://evil.test/watch?v=qOMxCZ0SzBQ','https://youtube.com/watch?v=bad'])assert.throws(()=>normalizeYouTubeUrl(url));
});
test('all structured generators use matching prompt arguments and validated JSON',async()=>{
 const generators = await Promise.all(['flashcard','quiz','questions','mindMap','weakTopics','smartRevision'].map(n=>import(new URL(`generators/${n}Generator.js`,aiUrl))));
 response='[{"front":"Cell","back":"Unit of life"}]';assert.equal((await generators[0].generateFlashcards('cells'))[0].question,'Cell');
 response=JSON.stringify([{question:'Q',options:['A','B','C','D','E'],correctAnswer:'E'},{question:'Q2',options:['a','b'],correctAnswer:'A',topic:'Cells'}]);
 const quiz=await generators[1].generateQuiz('cells');assert.equal(quiz.length,1);assert.ok(quiz[0].options.includes(quiz[0].correctAnswer));
 response='[{"q":"What?","a":"Cells"}]';assert.equal((await generators[2].generateQuestions('cells'))[0].answer,'Cells');
 response='{"central":"Cells","branches":[{"topic":"Parts","children":["Nucleus"]}]}';assert.equal((await generators[3].generateMindMap('cells','hi')).central,'Cells');
 response='{"weakTopics":[{"topic":"Cells","reason":"Incorrect","priority":"High","suggestion":"Review"}]}';await generators[4].generateWeakTopics([{question:'UNIQUEQUESTION'}],{score:0},'hi');assert.match(prompts.at(-1),/UNIQUEQUESTION/);assert.match(prompts.at(-1),/"score":0/);
 response='{"overallPerformance":{"score":0,"total":1,"percentage":0},"weakTopics":[{"topic":"Cells","priority":"High","whyWeak":"Incorrect answer","revisionNote":"Cells are the units described in the lecture. Their parts have specific functions. The nucleus stores genetic information. Review the distinction between each part and its function.","keyPoint":"Match each cell part with its function."}],"strongTopics":[]}';await generators[5].generateSmartRevision([{question:'UNIQUEQUESTION'}],{score:0},'Study cells and their functions.');assert.match(prompts.at(-1),/UNIQUEQUESTION/);
});
test('HTTP auth, ownership, CORS, notes contract, grading, revision and DB errors',async()=>{
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 const request=(url,method='GET',body,token='alice',extra={})=>fetch(base+url,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{})});
 try {
   assert.equal((await request('/api/health','GET',null,null)).status,200);
   const publicConfig=await (await request('/api/config/public','GET',null,null)).json();assert.equal(publicConfig.supabaseAnonKey,'test-public');assert.ok(!JSON.stringify(publicConfig).includes('test-admin'));
   assert.equal((await request('/api/me','GET',null,null)).status,401);
   assert.equal((await request('/api/me','GET',null,'bad')).status,401);
   assert.equal((await request('/api/study-sources/source','GET',null,'bob')).status,404);
   const preflight=await request('/api/me','OPTIONS',null,null,{Origin:'http://localhost:5500','Access-Control-Request-Method':'PATCH'});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'http://localhost:5500');
   assert.equal((await request('/api/health','GET',null,null,{Origin:'https://evil.test'})).status,403);
   response='Saved notes';assert.equal((await request('/api/study-sources/source/notes','POST',{})).status,200);
   const note=await (await request('/api/study-sources/source/notes/latest')).json();assert.equal(note.note.content_text,'Saved notes');
   response='[{"question":"Cell?","options":["A","B"],"correctAnswer":"A","topic":"Cells"}]';
   const quiz=await (await request('/api/study-sources/source/quiz','POST',{})).json();assert.ok(!('correctAnswer' in quiz.quiz.questions[0]));
   const grade=await (await request('/api/quizzes/'+quiz.quiz.id+'/submit','POST',{answers:[0],user_id:'bob'})).json();assert.equal(grade.attempt.score,1);assert.equal(grade.attempt.user_id,'alice');
   response='{"overallPerformance":{"score":999},"priorityTopics":[],"strongTopics":[],"revisionPlan":[]}';
   db.quizzes.push({id:'unattempted',source_id:'source',user_id:'alice',questions:[]});
   const revision=await (await request('/api/study-sources/source/revision','POST',{})).json();assert.match(revision.revision,/1\/1/);assert.equal(revision.data.overallPerformance.score,1);
   response='summary';failure=true;assert.equal((await request('/api/progress')).status,500);failure=false;
   const before=prompts.length;db.study_sources.push({id:'new',user_id:'alice',status:'queued'});
   response='Automatic notes';await startSourceProcessing('new','alice','https://youtu.be/qOMxCZ0SzBQ');
   for(let i=0;i<100 && db.study_sources.at(-1).status!=='ready';i++)await new Promise(r=>setTimeout(r,5));
   assert.equal(db.study_sources.at(-1).status,'ready');assert.equal(prompts.length,before+1);assert.equal(db.generated_content.at(-1).type,'notes');
 } finally {server.closeAllConnections();await new Promise(r=>server.close(r));}
});


test('feature caches survive other generations; concurrent calls, blocked regeneration and chat idempotency',async()=>{
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 const request=(path,body,token='alice')=>fetch(base+'/api/study-sources/source'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 try{
  response='{"central":"Cells","branches":[{"topic":"Parts","children":["Nucleus"]}]}';
  let before=prompts.length;
  const maps=await Promise.all(Array.from({length:8},()=>request('/features/mindmap',{}).then(r=>r.json())));
  assert.equal(prompts.length,before+1);assert.ok(maps.every(x=>x.feature.content_json.central==='Cells'));
  response='A concise summary';await request('/features/summary',{});
  before=prompts.length;
  const reopened=await(await request('/features/mindmap',{})).json();assert.equal(reopened.cached,true);assert.equal(prompts.length,before);
  const state=await(await request('/features')).json();assert.equal(state.features.mindmap.generated,true);assert.equal(state.features.summary.generated,true);assert.equal(state.features.notes.generated,true);assert.equal(state.quizCompleted,true);
  const read=await(await request('/features/mindmap')).json();assert.equal(read.feature.content_json.central,'Cells');assert.equal(prompts.length,before);
  assert.equal((await request('/features/mindmap',null,'bob')).status,404);
  assert.equal((await request('/features/mindmap',{},'bob')).status,404);
  response='Updated summary';
  assert.equal((await request('/features/summary',{regenerate:true})).status,400);
  const savedSummary=await(await request('/features/summary',{})).json();
  assert.equal(savedSummary.feature.content_text,'A concise summary');
  assert.equal(prompts.length,before);assert.equal(db.generated_content.filter(x=>x.feature_type==='summary').length,1);
  before=prompts.length;failure=true;assert.equal((await request('/features/questions',{})).status,500);failure=false;assert.equal(prompts.length,before);
  response='The nucleus stores genetic information.';
  const chat={message:'What is the nucleus?',requestId:'22222222-2222-4222-8222-222222222222'};
  const replies=await Promise.all(Array.from({length:5},()=>request('/chat',chat).then(r=>r.json())));
  assert.ok(replies.every(x=>x.answer===response));assert.equal(prompts.length,before+1);
  await request('/chat',chat);assert.equal(prompts.length,before+1);
  const history=await(await request('/chat')).json();assert.equal(history.turns.length,1);assert.equal(history.turns[0].question,chat.message);
  assert.equal((await request('/chat',null,'bob')).status,404);
  locks.set('source:questions','other-server');assert.equal((await request('/features/questions',{})).status,409);assert.equal(prompts.length,before+1);locks.delete('source:questions');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('retrieval keeps matching late excerpts in a bounded context',async()=>{
 const {retrieveContext}=await import(new URL('services/retrieval.js',back));
 const transcript=('Early introduction unrelated material. '.repeat(3000))+'NEUROPLASTICITY learning neural connections '.repeat(40);
 const found=retrieveContext(transcript,'Explain neuroplasticity');
 assert.match(found.context,/NEUROPLASTICITY/);assert.ok(found.context.length<9300);assert.equal(found.excerpts.length,5);
});


test('Unicode transcript cleaning and chunking preserve Hindi marks, decimals and symbols',async()=>{
 const {cleanTranscript}=await import(new URL('services/transcriptCleaner.js',back));
 const raw='मूल्य 3.14 है। सूत्र x ≥ 2.5, ₹50, ∑, ±, × और © 2026 हैं। गणित ७८९।';
 const cleaned=await cleanTranscript(raw);
 for(const value of ['मूल्य','3.14','≥','2.5','₹50','∑','±','×','©','७८९'])assert.ok(cleaned.includes(value),value);
 const {chunkTranscript}=await import(new URL('utils/chunkTranscript.js',aiUrl));
 const chunks=chunkTranscript(cleaned,1000,0);
 assert.equal(chunks.join(' '),cleaned);
});

test('Hindi source language is used for on-demand notes without a later override',async()=>{
 db.study_sources.push({id:'hindi',user_id:'alice',status:'ready',title:'गणित',language:'hi'});
 db.transcripts.push({source_id:'hindi',user_id:'alice',cleaned_text:'गणित में 3.14 और ∑ हैं।'});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  response='## गणित\n3.14 और ∑';
  const res=await fetch('http://127.0.0.1:'+server.address().port+'/api/study-sources/hindi/features/notes',{method:'POST',headers:{Authorization:'Bearer alice','Content-Type':'application/json'},body:'{}'});
  assert.equal(res.status,200);
  assert.match(prompts.at(-1),/गणित/);
  assert.ok(prompts.some(x=>x.includes('Devanagari script')));
  const body=await res.json();assert.match(body.feature.content_text,/गणित/);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});


test('new quiz attempt makes only its old Smart Revision stale until requested',async()=>{
 const source=db.study_sources.find(x=>x.id==='source');assert.equal(source.status,'ready');
 const quiz=db.quizzes.find(x=>x.source_id==='source');assert.ok(quiz);
 const old=db.generated_content.find(x=>x.source_id==='source'&&x.feature_type==='revision');assert.ok(old);
 const attempt={id:'newer-attempt',source_id:'source',user_id:'alice',quiz_id:quiz.id,score:0,total:1,percentage:0,answers:[{question:'Cells?',topic:'Cells',isCorrect:false}],created_at:new Date().toISOString()};
 db.quiz_attempts.push(attempt);
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port+'/api/study-sources/source';
 const request=(path,body)=>fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer alice','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 try{
  const state=await(await request('/features')).json();assert.equal(state.features.revision.generated,false);assert.equal(state.features.mindmap.generated,true);
  const stale=await(await request('/features/revision')).json();assert.equal(stale.feature,null);
  response='{"overallPerformance":{"score":0,"total":1,"percentage":0},"weakTopics":[{"topic":"Cells","priority":"High","whyWeak":"Incorrect answer","revisionNote":"Cells are the units described in the lecture. Their parts have specific functions. The nucleus stores genetic information. Review the distinction between each part and its function.","keyPoint":"Match each cell part with its function."}],"strongTopics":[]}';
  const before=prompts.length;const result=await(await request('/features/revision',{})).json();assert.equal(result.feature.content_json.attemptId,attempt.id);assert.equal(prompts.length,before+1);
  await request('/features/revision',{});assert.equal(prompts.length,before+1);
  assert.equal(db.generated_content.filter(x=>x.source_id==='source'&&x.feature_type==='revision').length,1);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});


test('ready-only picker hides old incomplete duplicates; repeated and concurrent URLs reuse sources',async()=>{
 const url='https://www.youtube.com/watch?v=qOMxCZ0SzBQ';
 db.study_sources.push({id:'old-failed',user_id:'alice',url,status:'error'},{id:'old-processing',user_id:'alice',url,status:'processing'}, {id:'ready-canonical',user_id:'alice',url,url_hash:'legacy-language-hash',status:'ready',language:'hi'}, {id:'ready-duplicate',user_id:'alice',url,status:'ready',language:'hi'});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 const send=(body,token='alice')=>fetch(base+'/api/study-sources',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)}).then(async r=>({status:r.status,...await r.json()}));
 try{
  const before=db.study_sources.length,aiBefore=prompts.length;
  const results=await Promise.all(Array.from({length:6},(_,i)=>send({url:i%2?'https://youtu.be/qOMxCZ0SzBQ?t=20':url,language:'en'})));
  assert.ok(results.every(r=>r.status===200&&r.source.id==='ready-canonical'&&r.source.language==='hi'));
  assert.equal(db.study_sources.length,before);assert.equal(prompts.length,aiBefore);
  const picker=await(await fetch(base+'/api/study-sources',{headers:{Authorization:'Bearer alice'}})).json();
  assert.ok(picker.sources.every(s=>s.status==='ready'));assert.equal(picker.sources.filter(s=>s.url===url).length,1);
  response='Auto-generated notes';
  const other=await send({url},'bob');assert.equal(other.status,202);assert.equal(other.source.user_id,'bob');assert.notEqual(other.source.id,'ready-canonical');
  for(let i=0;i<100&&db.study_sources.find(s=>s.id===other.source.id).status!=='ready';i++)await new Promise(r=>setTimeout(r,5));
  const video='https://youtu.be/abcdefghijk';
  const newSources=await Promise.all(Array.from({length:6},()=>send({url:video})));
  assert.equal(new Set(newSources.map(r=>r.source.id)).size,1);
  assert.equal(db.study_sources.filter(s=>s.user_id==='alice'&&s.url?.endsWith('abcdefghijk')).length,1);
  for(let i=0;i<100&&db.study_sources.find(s=>s.id===newSources[0].source.id).status!=='ready';i++)await new Promise(r=>setTimeout(r,5));
  assert.ok(db.study_sources.some(s=>s.id==='old-failed'),'old rows remain intact');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('AI 429/503/network/fallback failures retain the saved lecture and release generation locks',async()=>{
 db.study_sources.push({id:'failure-source',user_id:'alice',status:'ready'});
 db.transcripts.push({source_id:'failure-source',user_id:'alice',cleaned_text:'A saved lecture about cells.'});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+server.address().port+'/api/study-sources/failure-source/features/summary';
 try{
  for(const [failureStatus,expected,extra] of [[429,429,{}],[503,503,{}],[0,503,{}],[503,503,{fallbackExhausted:true}]]){
    aiFailure=Object.assign(new Error(failureStatus?'provider failure':'fetch failed'),{status:failureStatus,provider:'gemini',...extra});
    const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer alice','Content-Type':'application/json'},body:'{}'});const body=await r.json();
    assert.equal(r.status,expected);assert.equal(body.retryable,true);assert.match(body.error,/lecture is already saved/);assert.match(body.error,/retry later/);assert.ok(!body.error.includes('provider failure'));
    assert.equal(db.study_sources.find(s=>s.id==='failure-source').status,'ready');assert.equal(locks.has('failure-source:summary'),false);
  }
  aiFailure=null;response='Saved after retry';const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer alice','Content-Type':'application/json'},body:'{}'});assert.equal(r.status,200);
 }finally{aiFailure=null;server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('all six tools reopen independently without new AI calls',async()=>{
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port+'/api/study-sources/source/features';
 const send=(type,post=false)=>fetch(base+'/'+type,{method:post?'POST':'GET',headers:{Authorization:'Bearer alice','Content-Type':'application/json'},...(post?{body:'{}'}:{})});
 try{
  response='[{"question":"What is a cell?","answer":"The basic unit of life."}]';assert.equal((await send('questions',true)).status,200);
  response='[{"front":"Cell?","back":"Basic unit of life"}]';assert.equal((await send('flashcards',true)).status,200);
  const before=prompts.length;
  for(const type of ['notes','summary','mindmap','flashcards','quiz','questions']){
    const read=await(await send(type)).json(),cached=await(await send(type,true)).json();assert.ok(read.feature);assert.equal(cached.cached,true);assert.equal(cached.feature.id,read.feature.id);
  }
  assert.equal(prompts.length,before);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
