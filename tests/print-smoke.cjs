const { chromium } = require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../frontend/Genie final');
const artifacts=path.resolve(process.env.STUDYGENIE_TEST_OUTPUT || 'work/browser');fs.mkdirSync(artifacts,{recursive:true});
const notes='# Understanding neural networks\n\nA clear guide to **learning from data**. हिन्दी मूल्य 3.14, देवनागरी १२३, symbols ± ≥ ∑ × ₹ © € and 50% remain readable. العربية 中文 தமிழ் stay intact.\n\n## 1. The core idea\n\nA network transforms inputs into predictions through connected layers. Each connection carries a weight.\n\n> Learning adjusts these weights to reduce prediction error.\n\n### The neuron\n\nThe weighted sum is \\(z = \\sum_{i=1}^{n} w_i x_i + b\\).\n\n$$\\sigma(z)=\\frac{1}{1+e^{-z}}$$\n\n- **Inputs:** observed features\n- **Weights:** learned importance\n- **Activation:** introduces nonlinearity\n\n## 2. Training the model\n\n| Step | Purpose |\n| --- | --- |\n| Forward pass | Make a prediction |\n| Backpropagation | Compute gradients |\n| Optimization | Update the weights |\n\n```python\n'+'very_long_code_line_'.repeat(20)+'\n```\n\n<img src=x onerror="window.__unsafe=true"><script>window.__unsafe=true</script>';
let branches=6,quizCompleted=true,posts=[],sourceSubmissions=[];
const data={notes:{content_text:notes},summary:{content_text:'## The essentials\n\nNetworks learn by adjusting weights.'},mindmap:{},flashcards:{content_json:{cards:[{front:'What is a neuron?',back:'A weighted combination of inputs.'},{front:'Why activation?',back:'To model nonlinear patterns.'}]}},questions:{content_json:[{question:'Explain backpropagation.',answer:'It computes **gradients** through the chain rule.'}]},quiz:{content_json:{quizId:'quiz1',questions:[{question:'What do weights represent?',options:['Learned importance','Sample count']}] }},revision:{content_text:'## Your revision plan\n\nReview weights and activations.'}};
const operators=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/operators-saved.json'),'utf8'));
data.notes=operators.find(x=>x.feature_type==='notes');
const realMap=operators.find(x=>x.feature_type==='mindmap');
data.flashcards.content_json.cards.push({front:'Modulus formula?',back:'The remainder satisfies \\(a=bq+r\\).'});
let turns=[], generationFailure=0, offlineGeneration=false;
const source={id:'lecture',user_id:'alice',status:'ready',title:'Operators In C: C Tutorial In Hindi #7'};
const second={...source,id:'lecture2',title:'Electric Charges & Fields'};
const server=http.createServer((req,res)=>{let url=decodeURIComponent(req.url.split('?')[0]);if(url==='/')url='/dashboard.html';const file=path.resolve(root,'.'+url);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.STUDYGENIE_BROWSER?{executablePath:process.env.STUDYGENIE_BROWSER}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text())});page.on('requestfailed',req=>errors.push(req.url()+': '+req.failure()?.errorText));
 await page.addInitScript(()=>{window.__printRequested=0;window.print=()=>{window.__printRequested++};window.supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}}),signOut:async()=>({})}};});
 await page.route('**/npm/@supabase/supabase-js@2',route=>route.fulfill({body:'/* auth mocked for browser test */',contentType:'text/javascript'}));
 await page.route('http://localhost:4000/**',async route=>{
  const req=route.request(),u=new URL(req.url()),selected=u.pathname.includes('/lecture2')?second:source;let payload={};
  if(req.method()==='POST'&&u.pathname.includes('/features/')&&generationFailure){await route.fulfill({status:generationFailure,json:{error:'Provider busy'},headers:{'Access-Control-Allow-Origin':'*'}});return;}
  if(req.method()==='POST'&&u.pathname.includes('/features/')&&offlineGeneration){await route.abort('failed');return;}
  if(req.method()==='POST')posts.push(u.pathname);
  if(u.pathname==='/api/config/public')payload={supabaseUrl:'https://example.supabase.co',supabaseAnonKey:'fixture'};
  else if(u.pathname==='/api/me')payload={user:{id:'alice',email:'student@example.test',profile:{full_name:'Alex'}}};
  else if(u.pathname==='/api/study-sources'){if(req.method()==='POST'){sourceSubmissions.push(req.postDataJSON());source.language=req.postDataJSON().language;payload={cached:true,source};}else payload={sources:[second,source,{id:"failed",status:"error"},{id:"stale",status:"processing"}]};}
  else if(u.pathname.endsWith('/features'))payload={source:selected,features:Object.fromEntries(Object.keys(data).map(k=>[k,{generated:true}])),quizCompleted};
  else if(u.pathname.includes('/features/')){const type=u.pathname.split('/').pop();if(type==='mindmap')data.mindmap={content_json:{central:'Neural Networks',branches:Array.from({length:branches},(_,i)=>({topic:['The neuron','Network architecture','Learning process','Activation functions','Model evaluation','Practical applications'][i%6],children:['Core principles and connections','A useful example from the lecture','How this relates to the bigger picture']}))}};if(type==='mindmap' && branches===6)data.mindmap=realMap;payload={feature:data[type]===null?null:{feature_type:type,title:type,...data[type]}};}
  else if(u.pathname.endsWith('/chat')){if(req.method()==='POST'){const body=req.postDataJSON();turns.push({question:body.message,answer:'Weights describe the **importance** of each input.',excerpts:[1,3]});}payload={turns,nextBefore:null};}
  else if(u.pathname.includes('/quizzes/')){quizCompleted=true;payload={attempt:{score:1,total:1,percentage:100,answers:[{question:'What do weights represent?',correctAnswer:'Learned importance',isCorrect:true,explanation:'Weights scale each input.'}]}};}
  else payload={source:selected,transcript:{title:source.title,duration_seconds:3600}};
  await route.fulfill({json:payload,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'}});
 });
 const base=`http://127.0.0.1:${server.address().port}`;
 const open=async(type)=>{await page.goto(base+`/${type}.html?sourceId=lecture`);await page.waitForFunction(()=>!document.getElementById('featureStatus').textContent.includes('Opening saved'));};
 const noOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal page overflow');
 try {
  const report=[];
  for(const theme of ['light','dark']) {
    await page.goto(base+'/notes.html?sourceId=lecture');
    await page.evaluate(theme=>localStorage.setItem('studygenieTheme',theme),theme);
    await open('notes'); await page.evaluate(()=>StudyWorkspace.mathReady());
    await page.evaluate(()=>document.fonts.ready);
    const strong=await page.locator('.markdown strong').first().evaluate(el=>({color:getComputedStyle(el).color,body:getComputedStyle(document.body).getPropertyValue('--text').trim(),text:el.textContent}));
    assert.equal(strong.text,'Visual Studio Code (VS Code)');
    assert.equal(strong.color,theme==='light'?'rgb(23, 21, 18)':'rgb(245, 242, 236)');
    await noOverflow();
    await page.screenshot({path:path.join(artifacts,'operators-'+theme+'.png'),fullPage:true});
  }
  for(const type of ['notes','summary','mindmap']) {
    await open(type); await page.evaluate(()=>StudyWorkspace.mathReady());
    if(type==='quiz') {
      assert.equal(await page.locator('#downloadFeature').isVisible(),false);
      await page.locator('input[value="0"]').check();
      await page.getByRole('button',{name:'Finish quiz'}).click();
      await page.waitForSelector('.quiz-score');
    }
    if(type==='flashcards') { await page.locator('#nextCard').click(); await page.locator('#recallCard').click(); }
    if(type==='notes') {
      const expected=await page.locator('.markdown').evaluate(el=>{const nodes=[];const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){if(!n.parentElement.closest('mjx-container')&&n.textContent.trim())nodes.push(n.textContent);}return nodes;});
      fs.writeFileSync(path.join(artifacts,'expected-notes-text.json'),JSON.stringify(expected));
    }
    const before=await page.locator('#featureContent').textContent();
    const detailState=await page.locator('details').evaluateAll(els=>els.map(e=>e.open));
    const title=await page.title(),requestCount=posts.length;
    let exportRequests=[];const listener=req=>exportRequests.push(req.url());page.on('request',listener);
    await page.locator('#downloadFeature').click();
    await page.waitForFunction(()=>window.__printRequested===1);
    await page.pdf({path:path.join(artifacts,type+'.pdf'),preferCSSPageSize:true,printBackground:true});
    if(type==='notes')await page.pdf({path:path.join(artifacts,'notes-no-background.pdf'),preferCSSPageSize:true,printBackground:false});
    page.off('request',listener);
    assert.equal(posts.length,requestCount,'export must not POST');
    assert.equal(exportRequests.filter(u=>u.includes('/api/')).length,0,'export must not call backend');
    assert.equal(await page.title(),title,'title restored');
    assert.equal(await page.locator('#featureContent').textContent(),before,'content unchanged');
    assert.deepEqual(await page.locator('details').evaluateAll(els=>els.map(e=>e.open)),detailState,'collapsed answers restored');
    assert.equal(await page.locator('#pdfExportContainer').count(),0);
    await page.locator('#downloadFeature').click();
    await page.waitForFunction(()=>window.__printRequested===2);
    await page.evaluate(()=>{dispatchEvent(new Event('beforeprint'));dispatchEvent(new Event('afterprint'));});
    assert.equal(await page.locator('#downloadFeature').isEnabled(),true);
    report.push(type+': PDF, repeat/cancel, content restoration, zero API calls passed');
  }
  for(const type of ['flashcards','revision','quiz','questions']) {
    await open(type);
    assert.equal(await page.locator('#downloadFeature').count(),0,type+' must have no PDF button');
    if(type==='flashcards') {
      await page.locator('#recallCard').click();
      assert.match(await page.locator('#recallCard').innerText(),/weighted combination/);
      await page.locator('#nextCard').click();
      assert.match(await page.locator('#cardCount').innerText(),/Card 2/);
    }
    if(type==='quiz') {
      await page.locator('input[value="0"]').check();
      await page.getByRole('button',{name:'Finish quiz'}).click();
      await page.waitForSelector('.quiz-score');
      assert.equal(await page.locator('#downloadFeature').count(),0,'quiz result must have no PDF button');
    }
  }
  console.log('No PDF button on Flashcards, Smart Revision, Quiz/results or Important Questions; interactions passed.');
  for(const n of [1,3,11]) {
    branches=n;await open('mindmap');
    await page.pdf({path:path.join(artifacts,'map-'+n+'.pdf'),preferCSSPageSize:true,printBackground:true});
  }
  await page.setViewportSize({width:390,height:844});await open('notes');await page.evaluate(()=>StudyWorkspace.mathReady());await noOverflow();
  await page.screenshot({path:path.join(artifacts,'operators-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log(report.join('\n'));console.log('Actual Operators in C: light/dark/mobile checks passed; 1/3/11 branch map print checks passed.');
 } finally { await browser.close();server.close(); }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
