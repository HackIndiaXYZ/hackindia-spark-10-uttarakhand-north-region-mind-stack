window.StudyWorkspace = (() => {
  const titles = { notes: 'Notes', summary: 'Summary', flashcards: 'Flashcards', mindmap: 'Mind Map', quiz: 'Quiz', questions: 'Important Questions', revision: 'Smart Revision', retest: 'Re-test', chat: 'Chat with Lecture' };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const href = (type, id) => `${type}.html?sourceId=${encodeURIComponent(id)}`;
  const base = id => `/api/study-sources/${encodeURIComponent(id)}`;
  const state = id => StudyGenieAPI.request(base(id) + '/features');
  const read = (id,type) => StudyGenieAPI.request(base(id) + '/features/' + type);
  async function generate(id,type) {
    return StudyGenieAPI.request(base(id) + '/features/' + type, { method:'POST', body:'{}', lectureSaved:true });
  }
  function navigation(el,id,snapshot,current) {
    el.innerHTML = Object.entries(titles).map(([type,title]) => {
      const locked = (type === 'revision' && !snapshot.quizCompleted) || (type === 'retest' && !snapshot.features.revision?.generated);
      const feature = snapshot.features[type] || {};
      const label = locked ? (type === 'retest' ? 'Generate Smart Revision to unlock' : 'Complete a quiz to unlock') : type === 'chat' ? 'Open conversation' : feature.generating ? 'Generating…' : feature.generated ? 'Saved · Open' : 'Not generated yet';
      const weakLink=type==='revision'?(snapshot.quizCompleted?`<a class="next-link" href="${href('revision',id)}#weakTopics">Weak Topics<small>Review topics to revisit →</small></a>`:'<span class="next-link locked" aria-disabled="true">Weak Topics<small>Complete a quiz to unlock</small></span>'):'';
      return weakLink + (locked ? `<span class="next-link locked" aria-disabled="true">${escape(title)}<small>${label}</small></span>` : `<a class="next-link ${type === current ? 'current' : ''}" ${type === current ? 'aria-current="page"' : ''} href="${href(type,id)}">${escape(title)}<small>${label} →</small></a>`);
    }).join('');
  }
  let mathQueue = Promise.resolve();
  const mathReady = () => mathQueue;
  function markdown(el,text) {
    // Protect TeX from Markdown's escaping and emphasis rules, then sanitize HTML.
    if (!window.marked || !window.DOMPurify) { el.textContent = text; return; }
    const formulas=[];
    const protectedText = String(text || '').replace(/\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\$)\$(?!\s|\$|\d)[^\n$]+?\$(?!\$)/g, formula => `SGMATHPLACEHOLDER${formulas.push(formula)-1}END`);
    const html = marked.parse(protectedText).replace(/SGMATHPLACEHOLDER(\d+)END/g, (_,i) => escape(formulas[Number(i)]));
    el.innerHTML = DOMPurify.sanitize(html, { USE_PROFILES:{html:true}, FORBID_TAGS:['img','style','form','input','button'], FORBID_ATTR:['style'] });
    el.querySelectorAll('a').forEach(a => { a.rel = 'noopener noreferrer'; });
    const ready = window.MathJax?.startup?.promise;
    if (ready) mathQueue = mathQueue.catch(() => {}).then(() => ready).then(() => { if(el.isConnected) return MathJax.typesetPromise([el]); });
    // Keep a handled rejection for normal viewing; export still reports failures.
    mathQueue.catch(() => {});
  }
  const skeleton = '<div class="loading-skeleton" aria-hidden="true"><i></i><i></i><i></i><i></i></div>';
  function remember(source) {
    if(source?.status !== 'ready' || !source.user_id) return;
    try { localStorage.setItem('studygenie:resume:'+source.user_id,source.id); } catch {}
  }
  function remembered(userId) {
    try { return localStorage.getItem('studygenie:resume:'+userId); } catch { return null; }
  }
  function navigate(url) {
    document.body.classList.add('is-navigating');
    window.location.href=url;
  }
  if(typeof document !== 'undefined') {
    document.addEventListener('click',event=>{
      const a=event.target.closest?.('a[href]');
      if(!a || event.defaultPrevented || event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || a.target || a.hasAttribute('download'))return;
      const url=new URL(a.href,location.href);
      if(url.origin===location.origin && url.pathname.endsWith('.html')) document.body.classList.add('is-navigating');
    });
    window.addEventListener('pageshow',()=>document.body.classList.remove('is-navigating'));
  }
  return {titles,escape,href,base,state,read,generate,navigation,markdown,mathReady,skeleton,remember,remembered,navigate};
})();
