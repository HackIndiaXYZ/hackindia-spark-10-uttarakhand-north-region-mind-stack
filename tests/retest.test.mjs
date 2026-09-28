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

test('re-test flow: gates, weak-topic scope, grading, persistence, retry and practice after mastery', async () => {
 const server=app.listen(0,'127.0.0.1'); await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 const send=async (url,body,token='alice') => {
   const r=await fetch(base+'/api'+url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
   return {status:r.status,...await r.json()};
 };
 const root='/study-sources/source';
 const revision={overallPerformance:{score:1,total:3,percentage:33},weakTopics:[{topic:'Cells',priority:'High',whyWeak:'Two wrong answers',revisionNote:'The lecture explains cell parts and their functions.\n\nThe nucleus stores genetic information; each part has its own role.',definition:'',keyPoint:'Identify the function of each part.',formula:'',example:'',mistake:{}}],strongTopics:[{topic:'Plants',reason:'Correct'}]};
 const questions=n=>[{question:`Cell function ${n}?`,options:['A','B','C','D'],correctAnswer:'A',explanation:'Cells have different parts with specific functions.',topic:'Cells'}];
 try {
  assert.equal((await send(root+'/retest',{})).status,409);
  assert.equal((await send(root+'/retest',null,'bob')).status,404);
  response=JSON.stringify([{question:'Original cell one?',options:['A','B'],correctAnswer:'A',topic:'Cells'},{question:'Original cell two?',options:['A','B'],correctAnswer:'A',topic:'Cells'},{question:'Plant?',options:['A','B'],correctAnswer:'A',topic:'Plants'}]);
  const quiz=await send(root+'/quiz',{}); assert.equal(quiz.status,200);
  const graded=await send('/quizzes/'+quiz.quiz.id+'/submit',{answers:[1,1,0]});
  assert.equal(graded.attempt.percentage,33);
  assert.equal((await send(root+'/retest',{})).status,409);
  const preserved=db.generated_content.filter(x=>x.feature_type!=='revision'&&x.feature_type!=='retest').map(x=>JSON.stringify(x));
  response=JSON.stringify(revision);
  const rev=await send(root+'/features/revision',{}); assert.equal(rev.status,200);
  assert.match(prompts.at(-1),/150-250/); assert.match(prompts.at(-1),/Study cells and their functions/);
  assert.equal((await send(root+'/features')).features.revision.generated,true);
  response=JSON.stringify([...questions(1),{...questions('unrelated')[0],topic:'Plants'}]);
  const started=await send(root+'/retest',{}); assert.equal(started.status,200);
  assert.deepEqual(started.retest.topics,['Cells']); assert.equal(started.retest.questions.length,1);
  assert.ok(!('correctAnswer' in started.retest.questions[0])); assert.ok(!('explanation' in started.retest.questions[0]));
  assert.ok(prompts.at(-1).includes('ALLOWED TOPICS: ["Cells"]'));
  const first=started.retest.quizId, count=prompts.length;
  assert.equal((await send(root+'/retest',{})).retest.quizId,first); assert.equal(prompts.length,count);
  assert.equal((await send('/quizzes/'+first+'/submit',{answers:[]})).status,400);
  assert.equal((await send('/quizzes/'+first+'/submit',{answers:[8]})).status,400);
  assert.equal((await send('/quizzes/'+first+'/submit',{answers:[0]},'bob')).status,404);
  const fail=await send('/quizzes/'+first+'/submit',{answers:[1]});
  assert.equal(fail.comparison.beforePercentage,0); assert.equal(fail.comparison.change,0); assert.equal(fail.comparison.mastered,false);
  const savedCount=db.quiz_attempts.length;
  assert.equal((await send('/quizzes/'+first+'/submit',{answers:[0]})).attempt.id,fail.attempt.id);
  assert.equal(db.quiz_attempts.length,savedCount,'retry must not save a second result');
  assert.equal((await send(root+'/features')).features.revision.generated,true,'re-test must not invalidate revision');
  assert.equal((await send(root+'/features')).quizProgress.percentage,33,'original quiz progress remains distinct');
  assert.equal((await send(root+'/retest')).retest.attempt.id,fail.attempt.id);
  response=JSON.stringify(questions(2));
  const next=await send(root+'/retest',{previousQuizId:first}); assert.notEqual(next.retest.quizId,first);
  const mastered=await send('/quizzes/'+next.retest.quizId+'/submit',{answers:[0]});
  assert.equal(mastered.comparison.mastered,true); assert.equal(mastered.comparison.change,100);
  assert.equal(mastered.comparison.originalQuizPercentage,33);
  assert.equal(mastered.comparison.topics[0].before.total,2);
  assert.equal(mastered.comparison.topics[0].after.total,1);
  assert.equal((await send(root+'/features')).features.retest.mastered,true);
  response=JSON.stringify(questions(3));
  const practice=await send(root+'/retest',{previousQuizId:next.retest.quizId});
  assert.equal(practice.status,200); assert.notEqual(practice.retest.quizId,next.retest.quizId);
  assert.deepEqual(practice.retest.topics,['Cells'],'mastery retains the original weak-topic pool');
  const aiCount=prompts.length;
  assert.equal((await send(root+'/retest',{previousQuizId:next.retest.quizId})).retest.quizId,practice.retest.quizId);
  assert.equal(prompts.length,aiCount);
  assert.deepEqual(db.generated_content.filter(x=>x.feature_type!=='revision'&&x.feature_type!=='retest').map(x=>JSON.stringify(x)),preserved);
  // A new original quiz invalidates the old revision and its re-test, not other features.
  await send('/quizzes/'+quiz.quiz.id+'/submit',{answers:[0,0,0]});
  const state=await send(root+'/features'); assert.equal(state.features.revision.generated,false); assert.equal(state.features.retest.generated,false);
  assert.equal((await send(root+'/retest',{})).status,409);
  const aiBefore=prompts.length;
  const perfect=await send(root+'/revision',{}); assert.equal(perfect.status,200); assert.deepEqual(perfect.data.weakTopics,[]);
  assert.equal(prompts.length,aiBefore,'perfect original quiz requires no invented weak topics');
  const empty=await send(root+'/retest'); assert.deepEqual(empty.topics,[]);
  assert.equal((await send(root+'/retest',{})).status,409,'never silently substitute strong topics');
 } finally { server.closeAllConnections(); await new Promise(r=>server.close(r)); }
});

test('re-test generator rejects omissions, malformed questions and copied questions',async()=>{
 const {generateRetest}=await import(new URL('generators/retestGenerator.js',aiUrl));
 const q={question:'New?',options:['A','B','C','D'],correctAnswer:'A',explanation:'From lecture',topic:'Cells'};
 response=JSON.stringify([{...q,topic:'Other'}]); await assert.rejects(generateRetest('Cells',['Cells'],{}),/every weak topic/);
 response=JSON.stringify([q]); await assert.rejects(generateRetest('Cells',['Cells','Nucleus'],{}),/every weak topic/);
 response=JSON.stringify([{...q,options:['A','A','B','C']}]); await assert.rejects(generateRetest('Cells',['Cells'],{}),/every weak topic/);
 response=JSON.stringify([q]); await assert.rejects(generateRetest('Cells',['Cells'],{},'en',[{question:'New?'}]),/every weak topic/);
 response='not json'; await assert.rejects(generateRetest('Cells',['Cells'],{}));
});

test('comparisons show negative and unchanged changes honestly',async()=>{
 const {compareAttempts}=await import(new URL('services/retestService.js',back));
 const baseline={percentage:75,answers:[{topic:'Cells',isCorrect:true},{topic:'Cells',isCorrect:false}]};
 const after={score:0,total:1,percentage:0,answers:[{topic:'Cells',isCorrect:false}]};
 assert.equal(compareAttempts(baseline,after,['Cells']).change,-50);
 assert.equal(compareAttempts(baseline,{...after,score:1,total:2,percentage:50},['Cells']).change,0);
});
