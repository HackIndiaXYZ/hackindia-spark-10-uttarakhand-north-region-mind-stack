const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../frontend/Genie final');
const artifacts = path.resolve(process.env.STUDYGENIE_TEST_OUTPUT || 'work/retest-browser');
fs.mkdirSync(artifacts, { recursive: true });
const server = http.createServer((req,res) => {
 const file = path.resolve(root, '.' + new URL(req.url,'http://local').pathname);
 if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
 try { res.setHeader('Content-Type', {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.ttf':'font/ttf'}[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file)); }
 catch { res.writeHead(404).end(); }
});
const source={id:'lecture',user_id:'alice',status:'ready',title:'Understanding cells and their functions',language:'en'};
const note='A cell contains parts that work together. The membrane forms a boundary around the cell and controls what can enter and leave. The lecture describes this boundary as selective: different materials do not all cross it in the same way. This control helps maintain the conditions needed inside the cell.\n\nWhen answering a question about a cell part, first identify the action described. A boundary and the movement of materials point to the membrane. Storing genetic information points to the nucleus. Keeping these roles separate corrects the misunderstanding in your original answer.\n\nUse the teacher’s sequence to revise: identify the part, explain its role, and connect that role to the example in the lecture. Focus on the link between structure and function rather than memorizing names alone. The membrane surrounds the contents; the nucleus has a different role inside the cell. Both contribute to the cell’s activity, but their functions are not interchangeable.';
const revision={overallPerformance:{score:1,total:3,percentage:33},weakTopics:[
 {topic:'Cell membrane',priority:'High',whyWeak:'You confused the boundary with the nucleus.',revisionNote:note,definition:'The selective boundary around the cell.',keyPoint:'The membrane controls what enters and leaves.',example:'The teacher compared the boundary to a gate.',formula:'',mistake:{question:'Which part controls entry?',studentAnswer:'Nucleus',correctAnswer:'Cell membrane'}},
 {topic:'Nucleus',priority:'Medium',whyWeak:'You assigned the wrong function to the nucleus.',revisionNote:'The nucleus stores genetic information in the lecture explanation.\n\nDistinguish this role from the membrane, which controls what enters and leaves the cell.',keyPoint:'Connect each structure with its own function.',mistake:{question:'Which part stores genetic information?',studentAnswer:'Cell membrane',correctAnswer:'Nucleus'}},
],strongTopics:[]};
let completed=false, generated=false, current=null, serial=0, failNext=false, posts=0;
const topics=revision.weakTopics.map(t=>t.topic);
function makeQuiz(){return {quizId:'r'+(++serial),topics,questions:topics.map(topic=>({question:`Practice ${serial}: which statement about ${topic} matches the lecture?`,topic,options:['Correct lecture explanation','Another function','Neither','Both']})),attempt:null};}
function result(answers){
 const rows=current.questions.map((q,i)=>({...q,isCorrect:answers[i]===0,selectedAnswer:q.options[answers[i]],correctAnswer:q.options[0],explanation:'Use the function described in the lecture.'}));
 const score=rows.filter(a=>a.isCorrect).length,percentage=score*50;
 return {attempt:{score,total:2,percentage,answers:rows},comparison:{beforePercentage:0,afterPercentage:percentage,change:percentage,originalQuizPercentage:33,mastered:score===2,topics:topics.map((topic,i)=>({topic,before:{correct:0,total:1,percentage:0},after:{correct:answers[i]===0?1:0,total:1,percentage:answers[i]===0?100:0}}))}};
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.STUDYGENIE_BROWSER?{executablePath:process.env.STUDYGENIE_BROWSER}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.STUDYGENIE_API_BASE_URL='http://localhost:4000'; window.supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'test'}}}),signOut:async()=>({})}};});
 await page.route('**/npm/@supabase/supabase-js@2',r=>r.fulfill({body:'',contentType:'text/javascript'}));
 await page.route('http://localhost:4000/**',async route=>{
  const req=route.request(),u=new URL(req.url()); let payload={},status=200;
  if(req.method()==='POST')posts++;
  if(u.pathname==='/api/config/public')payload={supabaseUrl:'https://example.supabase.co',supabaseAnonKey:'test'};
  else if(u.pathname==='/api/me')payload={user:{id:'alice',email:'student@example.test'}};
  else if(u.pathname==='/api/study-sources')payload={sources:[source]};
  else if(u.pathname.endsWith('/features'))payload={source,quizCompleted:completed,quizProgress:{percentage:33},features:{quiz:{generated:true},revision:{generated},retest:{generated:!!current,completed:!!current?.attempt,mastered:!!current?.comparison?.mastered}}};
  else if(u.pathname.endsWith('/features/revision')){if(req.method()==='POST')generated=true;payload={feature:generated?{content_json:revision}:null};}
  else if(u.pathname.endsWith('/retest')){
   if(req.method()==='POST'){
    if(failNext){failNext=false;status=503;payload={error:'Temporarily busy'};}
    else {if(!current||current.attempt)current=makeQuiz();payload={retest:current};}
   }else payload={topics,retest:current};
  }else if(u.pathname.includes('/quizzes/')){Object.assign(current,result(req.postDataJSON().answers));payload=current;}
  else payload={source,transcript:{duration_seconds:1800}};
  await route.fulfill({status,json:payload,headers:{'Access-Control-Allow-Origin':'*'}});
 });
 const base=`http://127.0.0.1:${server.address().port}`;
 const dashboard=async()=>{await page.goto(base+'/dashboard.html?sourceId=lecture');await page.waitForFunction(()=>document.querySelector('#lectureStatus').textContent.includes('READY'));};
 const open=async type=>{await page.goto(base+`/${type}.html?sourceId=lecture`);await page.waitForFunction(()=>document.querySelector('#featureContent').getAttribute('aria-busy')==='false');};
 const noOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow');
 try {
  await dashboard(); assert.equal(await page.locator('[data-tool=revision]').isDisabled(),true); assert.equal(await page.locator('[data-tool=retest]').isDisabled(),true);
  await open('retest'); assert.match(await page.locator('#featureStatus').innerText(),/unlock Re-test/); assert.equal(posts,0);
  completed=true;await dashboard();assert.equal(await page.locator('[data-tool=revision]').isEnabled(),true);assert.equal(await page.locator('[data-tool=retest]').isDisabled(),true);
  assert.match(await page.locator('#revision .feature-badge').innerText(),/Unlocked/);
  await page.locator('[data-tool=revision]').click();await page.waitForSelector('.revision-topic-card');
  assert.equal(await page.locator('.revision-topic-card').count(),2);assert.match(await page.locator('.revision-mini-note').first().innerText(),/When answering a question/);
  assert.equal(await page.locator('.revision-topic-card').first().evaluate(e=>getComputedStyle(e).borderLeftWidth),'4px');
  await noOverflow();await page.screenshot({path:path.join(artifacts,'revision-desktop.png'),fullPage:true});
  for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await noOverflow();}
  await page.setViewportSize({width:390,height:844});await noOverflow();await page.screenshot({path:path.join(artifacts,'revision-mobile.png'),fullPage:true});
  await dashboard();assert.match(await page.locator('#revision .feature-badge').innerText(),/Generated/);assert.equal(await page.locator('[data-tool=retest]').isEnabled(),true);
  await page.locator('[data-tool=retest]').click();await page.waitForSelector('#generateFeature:visible');
  failNext=true;await page.locator('#generateFeature').click();await page.waitForFunction(()=>document.querySelector('#featureStatus').textContent.includes('temporarily busy'));assert.equal(await page.locator('#generateFeature').isEnabled(),true);
  await page.locator('#generateFeature').click();await page.waitForSelector('#retestForm');
  const before=posts;await page.reload();await page.waitForSelector('#retestForm');assert.equal(posts,before,'reload resumes without generation');
  for(let i=0;i<2;i++){await page.locator(`input[name=question${i}][value="0"]`).check();if(i===0)await page.getByRole('button',{name:'Next question'}).click();}
  await page.getByRole('button',{name:'Finish Re-test'}).click();await page.waitForSelector('.retest-comparison');
  assert.match(await page.locator('.retest-comparison').innerText(),/\+100 percentage points/);assert.match(await page.locator('#featureStatus').innerText(),/Mastered/);
  assert.equal(await page.locator('#practiceAgain').isEnabled(),true);await noOverflow();await page.screenshot({path:path.join(artifacts,'retest-results-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(artifacts,'retest-results-desktop.png'),fullPage:true});
  await page.reload();await page.waitForSelector('.retest-comparison');assert.equal(posts,before+1);
  await dashboard();assert.match(await page.locator('#retest .feature-badge').innerText(),/Mastered/);await page.screenshot({path:path.join(artifacts,'dashboard.png'),fullPage:true});
  await open('retest');await page.locator('#practiceAgain').click();await page.waitForSelector('#retestForm');assert.equal(serial,2);
  for(let i=0;i<2;i++){await page.locator(`input[name=question${i}][value="1"]`).check();if(i===0)await page.getByRole('button',{name:'Next question'}).click();}
  await page.getByRole('button',{name:'Finish Re-test'}).click();await page.waitForSelector('.retest-comparison');assert.match(await page.locator('.retest-comparison').innerText(),/0 percentage points/);assert.doesNotMatch(await page.locator('#featureStatus').innerText(),/Mastered/);
  assert.deepEqual(errors,[]);console.log('PASS: dashboard gates, revision cards/themes/mobile, re-test error retry, resume, grading comparison, reload and repeated practice after mastery.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
