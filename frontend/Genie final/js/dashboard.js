(async () => {
  const W=StudyWorkspace, el=id=>document.getElementById(id), text=(id,value)=>{if(el(id))el(id).textContent=value;};
  let activeSourceId=new URLSearchParams(location.search).get('sourceId'), snapshot, switching=0, userId, sources=[];
  const generating=new Set(), area=el('generatedArea');
  const loading=on=>{el('workspaceLoading').hidden=!on;el('lectureWorkspace').setAttribute('aria-busy',String(on));};
  const message=value=>{area.textContent=value;el('lectureWorkspace').classList.remove('hidden');};
  function updateURL(id,mode='replace') {
    const url=new URL(location.href);if(id)url.searchParams.set('sourceId',id);else url.searchParams.delete('sourceId');
    if(url.href!==location.href)history[mode==='push'?'pushState':'replaceState']({sourceId:id},'',url);
    document.querySelector('.sidebar a[href^="dashboard.html"]').href=id?W.href('dashboard',id):'dashboard.html';
  }
  function updateCards(){
    el('openWeakTopics').disabled=!snapshot?.quizCompleted;
    el('openWeakTopics').textContent=snapshot?.quizCompleted?'View Weak Topics →':'Complete Quiz first';
    document.querySelectorAll('.tool-generate').forEach(button=>{
      const type=button.dataset.tool,feature=snapshot?.features[type],pending=generating.has(activeSourceId+':'+type)||feature?.generating;
      const locked=(type==='revision'&&!snapshot?.quizCompleted)||(type==='retest'&&!snapshot?.features.revision?.generated);
      button.closest('.tool-card').classList.toggle('is-locked',locked);
      button.disabled=!snapshot || snapshot.source.status!=='ready' || locked || (!feature?.generated&&pending);
      button.textContent=locked?(type==='retest'?'Generate Smart Revision first':'Complete Quiz first'):type==='retest'?(feature?.completed?'View results / Practice again →':feature?.generated?'Resume Re-test →':'Start Re-test →'):type==='chat'?'Open Chat →':feature?.generated?'Open →':pending?'Generating…':'Generate →';
      let badge=button.parentElement.querySelector('.feature-badge');
      if(!badge){badge=document.createElement('span');badge.className='feature-badge';button.before(badge);}
      badge.textContent=locked?'Locked':type==='retest'?(feature?.mastered?'✓ Mastered · Keep practicing':feature?.completed?'Results saved':feature?.generated?'In progress':'Unlocked'):type==='revision'?(feature?.generated?'✓ Generated':pending?'Generating…':'Unlocked'):type==='chat'?(feature?.generated?'Conversation saved':'Ready to chat'):feature?.generated?'✓ Saved':pending?'Generating…':'On demand';
      badge.classList.toggle('is-saved',!!feature?.generated);
    });
  }
  function showResume(state) {
    if(!state || state.source.status!=='ready')return;
    el('resumeStudying').hidden=false;
    text('resumeTitle',state.source.title||'Your latest lecture');
    const count=['notes','summary','mindmap','flashcards','quiz','questions'].filter(t=>state.features[t]?.generated).length;
    const quiz=state.quizCompleted?`Quiz completed${state.quizProgress?' · '+state.quizProgress.percentage+'%':''}`:'Quiz not attempted';
    text('resumeProgress',`${state.features.notes?.generated?'Notes ready':'Notes not generated'} · ${count}/6 study tools saved · ${quiz}`);
    el('resumeLink').href=W.href('dashboard',state.source.id);
  }
  async function listLectures(){
    const result=await StudyGenieAPI.request('/api/study-sources');
    const cards=el('savedLectureCards');cards.replaceChildren();
    for(const source of result.sources){
      const card=document.createElement('article');card.className='saved-lecture-card';
      let videoId;try{const url=new URL(source.url);const host=url.hostname.replace(/^www\.|^m\./,'');videoId=host==='youtu.be'?url.pathname.slice(1):host==='youtube.com'?url.searchParams.get('v')||url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/)?.[1]:null;}catch{}
      if(videoId&&/^[\w-]{11}$/.test(videoId)){const img=document.createElement('img');img.src='https://i.ytimg.com/vi/'+videoId+'/hqdefault.jpg';img.alt='';img.loading='lazy';img.onerror=()=>img.remove();card.append(img);}
      const title=document.createElement('h3');title.textContent=source.title||'Untitled lecture';card.append(title);
      const meta=document.createElement('p');const date=new Date(source.created_at);meta.textContent=(Number.isNaN(date.getTime())?'':date.toLocaleDateString()+' · ')+({ready:'Ready',queued:'Queued',processing:'Processing',error:'Needs attention'}[source.status]||'Saved');card.append(meta);
      const button=document.createElement('button');button.type='button';button.className='secondary-btn';button.textContent=source.status==='ready'?'Open lecture':'View status';button.onclick=async()=>{try{await open(source.id,'push');el('lectureWorkspace').scrollIntoView({behavior:'smooth'});}catch(error){window.StudyUI?.notify(error.message,'error');}};card.append(button);cards.append(card);
    }
    if(!result.sources.length)cards.textContent='No saved lectures yet. Paste a YouTube link above to start.';
    sources=result.sources.filter(s=>s.status==='ready');
    el('savedLectures').innerHTML='<option value="">Choose a ready lecture…</option>'+sources.map(s=>`<option value="${W.escape(s.id)}">${W.escape(s.title||'Lecture')} · ${W.escape(({en:'English',hi:'हिन्दी',hinglish:'Hinglish'})[s.language]||'English')}</option>`).join('');
    el('savedLectures').value=activeSourceId||'';
  }
  async function open(id,mode='replace'){
    const ticket=++switching;activeSourceId=id;snapshot=null;updateURL(id,mode);updateCards();loading(true);
    el('savedLectures').value=id; text('lectureTitle','Opening your lecture…');text('lectureMeta','');text('lectureStatus','Loading lecture…');message('Loading your saved progress…');
    try {
      for(let i=0;i<3600;i++){
        const result=await StudyGenieAPI.request(W.base(id));if(ticket!==switching)return;
        if(result.source.status==='error')throw new Error(result.source.error_message||'Lecture processing failed. Submit the link again to retry.');
        if(result.source.status==='ready'){
          if(!el('processing').classList.contains('hidden'))window.StudyUI?.processing('complete');
          const next=await W.state(id);if(ticket!==switching)return;snapshot=next;
          W.remember(next.source);showResume(next);
          if(![...el('savedLectures').options].some(option=>option.value===id)) {
            const option=document.createElement('option');option.value=id;option.textContent=next.source.title||'Your lecture';el('savedLectures').append(option);
          }
          el('savedLectures').value=id;
          text('lectureTitle',result.source.title||result.transcript?.title||'Lecture');text('lectureStatus','✓ LECTURE READY');
          const duration=result.transcript?.duration_seconds||result.source.duration_seconds;
          text('lectureMeta',`YouTube · ${duration?Math.round(duration/60)+' min · ':''}${({en:'English',hi:'हिन्दी',hinglish:'Hinglish'})[result.source.language]||'English'} notes`);
          message(next.features.notes?.generated?'Your study space is ready. Open saved materials or generate something new.':result.source.error_message||'Your lecture is already saved. Generate Notes whenever you are ready.');
          updateCards();return;
        }
        window.StudyUI?.processing('processing');text('lectureStatus','PREPARING LECTURE');message('Preparing the transcript and your first Notes… You can return to this lecture later.');
        await new Promise(resolve=>setTimeout(resolve,2500));if(ticket!==switching)return;
      }
      throw new Error('Processing is taking longer than expected. Reopen this lecture later.');
    }catch(error){if(ticket===switching){window.StudyUI?.processing('error');text('lectureStatus','LECTURE STATUS');message(error.message);throw error;}}
    finally{if(ticket===switching)loading(false);}
  }
  document.querySelectorAll('.tool-generate').forEach(button=>{
    button.disabled=true;
    button.onclick=async e=>{
      e.preventDefault();if(!snapshot||button.disabled)return;
      const type=button.dataset.tool,id=activeSourceId;
      if(type==='chat'||type==='retest'||snapshot.features[type]?.generated)return W.navigate(W.href(type,id));
      const key=id+':'+type;generating.add(key);updateCards();message(`Creating ${W.titles[type]}… Your lecture is already saved.`);
      try{await W.generate(id,type);if(id===activeSourceId)W.navigate(W.href(type,id));}
      catch(error){if(id===activeSourceId){message(error.message);try{const next=await W.state(id);if(id===activeSourceId)snapshot=next;}catch{}}}
      finally{generating.delete(key);updateCards();}
    };
  });
  document.querySelectorAll('.sidebar a[href^="#"]').forEach(a=>a.onclick=e=>{e.preventDefault();const type=a.getAttribute('href').slice(1);if(activeSourceId&&snapshot)W.navigate(type==='weakTopics'?W.href('revision',activeSourceId)+'#weakTopics':W.href(type,activeSourceId));});
  el('savedLectures').onchange=async e=>{if(e.target.value)try{await open(e.target.value,'push');}catch{}};
  el('resumeLink').onclick=async e=>{e.preventDefault();try{await open(new URL(e.currentTarget.href).searchParams.get('sourceId'),'push');el('lectureWorkspace').scrollIntoView({behavior:'smooth',block:'start'});}catch{}};
  el('openWeakTopics').onclick=()=>{if(snapshot?.quizCompleted)W.navigate(W.href('revision',activeSourceId)+'#weakTopics');};
  el('lectureUrl').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();el('generateNotes').click();}});
  el('generateNotes').onclick=async e=>{
    e.preventDefault();const button=e.currentTarget;if(button.disabled)return;
    const url=el('lectureUrl').value.trim();if(!url){window.StudyUI?.notify('Paste a YouTube lecture link first.','warning');el('lectureUrl').focus();return;}
    const label=button.textContent;button.disabled=true;button.textContent='Processing Lecture…';button.setAttribute('aria-busy','true');window.StudyUI?.processing('processing');
    try{const language=el('lectureLanguage').value;const result=await StudyGenieAPI.request('/api/study-sources',{method:'POST',body:JSON.stringify({url,language})});await open(result.source.id,'push');await listLectures();window.StudyUI?.notify('Lecture ready. Open your study workspace.','success');}
    catch(error){window.StudyUI?.processing('error');window.StudyUI?.notify(error.message,'error');message(error.message);}finally{button.disabled=false;button.textContent=label;button.removeAttribute('aria-busy');}
  };
  el('profileBtn').onclick=e=>{e.stopPropagation();el('profileMenu').classList.toggle('show');};
  document.addEventListener('click',()=>el('profileMenu').classList.remove('show'));
  el('logoutBtn').onclick=async()=>{await(await StudyGenieAPI.getSupabase()).auth.signOut();W.navigate('login.html');};
  window.addEventListener('popstate',()=>{const id=new URLSearchParams(location.search).get('sourceId');if(id){open(id).catch(()=>{});}else{++switching;activeSourceId=null;snapshot=null;loading(false);el('lectureWorkspace').classList.add('hidden');updateCards();}});
  async function refresh(){
    const id=activeSourceId;
    if(!snapshot||!id)return;
    try{const next=await W.state(id);if(id===activeSourceId){snapshot=next;showResume(next);updateCards();}}catch{}
  }
  window.addEventListener('focus',refresh);
  window.addEventListener('pageshow',event=>{if(event.persisted)refresh();});
  try{
    const me=await StudyGenieAPI.request('/api/me'),name=me.user.profile?.full_name||me.user.email?.split('@')[0]||'Student';
    userId=me.user.id;text('profileName',name);text('welcomeName',name);text('avatar',name[0].toUpperCase());
    const hour=new Date().getHours();text('welcomeGreeting',hour<12?'Good morning':hour<18?'Good afternoon':'Good evening');
    await listLectures();
    const remembered=W.remembered(userId),latest=sources.find(s=>s.id===remembered)||sources[0];
    if(!activeSourceId)activeSourceId=remembered||latest?.id;
    if(latest&&latest.id!==activeSourceId) { try { showResume(await W.state(latest.id)); } catch {} }
    if(activeSourceId){
      try{await open(activeSourceId);}catch(error){
        if(error.status===404&&latest&&latest.id!==activeSourceId)await open(latest.id);
        else if(latest&&latest.id!==activeSourceId)showResume(await W.state(latest.id));
      }
    }
  }catch(error){message(error.message);el('savedLectureCards').textContent='Could not load saved lectures. Refresh to try again.';}finally{loading(false);}
})();
