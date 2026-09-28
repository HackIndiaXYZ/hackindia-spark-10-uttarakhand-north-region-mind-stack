(async () => {
  const W = StudyWorkspace, sourceId = new URLSearchParams(location.search).get('sourceId');
  const content = document.getElementById('featureContent'), status = document.getElementById('featureStatus');
  const generate = document.getElementById('generateFeature');
  let snapshot, current = null, busy = false;
  const setStatus = text => { status.textContent = text; };
  const signed = n => `${n > 0 ? '+' : ''}${n}`;
  const reviewLink = () => `<a class="secondary-btn" href="${W.href('revision', sourceId)}">Review Smart Revision</a>`;

  function showResult(data) {
    const { attempt, comparison: c } = data;
    const change = c.change === null ? 'No comparable baseline' : `${signed(c.change)} percentage points`;
    content.innerHTML = `<div class="quiz-score"><span class="eyebrow">RE-TEST COMPLETE</span>
      <h2>${attempt.score} / ${attempt.total}</h2><p>${attempt.percentage}% · Your result is saved</p>
      <p>${c.mastered ? 'You answered every practice question correctly. Keep practicing whenever you like.' : 'Review the explanations below and practice these topics again.'}</p></div>
      <section class="retest-comparison"><h2>Your improvement</h2>
        <p>Comparing the same weak topics with your original quiz. Questions may differ in difficulty.</p>
        <div class="retest-scores"><div>Before<strong>${c.beforePercentage ?? '—'}%</strong></div>
        <div>After<strong>${c.afterPercentage}%</strong></div><div>Change<strong>${change}</strong></div></div>
        <p>Original full quiz: ${c.originalQuizPercentage}%</p>
        ${c.topics.map(t => `<div class="retest-topic-result"><h3>${W.escape(t.topic)}</h3>
          <p>Before: ${t.before ? `${t.before.correct}/${t.before.total} (${t.before.percentage}%)` : 'Not assessed'} →
          After: ${t.after ? `${t.after.correct}/${t.after.total} (${t.after.percentage}%)` : 'Not assessed'}</p></div>`).join('')}
      </section><div class="revision-actions"><button id="practiceAgain" class="primary-btn" type="button">Practice / Re-test Again →</button>${reviewLink()}</div>
      ${attempt.answers.map((a,i) => `<details class="question-detail"><summary>${a.isCorrect ? '✓' : '↗'} ${i+1}. ${W.escape(a.question)}</summary>
        <p>Your answer: ${W.escape(a.selectedAnswer)}</p><p><b>Correct answer:</b> ${W.escape(a.correctAnswer)}</p><p>${W.escape(a.explanation || '')}</p></details>`).join('')}`;
    window.StudyUI?.analytics(content, attempt);
    content.querySelector('#practiceAgain').onclick = () => start(data.quizId);
    setStatus(c.mastered ? 'Mastered in this re-test · Practice remains available.' : 'Re-test saved · Compare your improvement below.');
  }

  function showQuiz(data) {
    current = data; generate.hidden = true;
    if (data.attempt) return showResult(data);
    content.innerHTML = `<p>Practice topics: ${data.topics.map(W.escape).join(' · ')}</p>
      <form id="retestForm">${data.questions.map((q,i) => `<fieldset class="quiz-question"><legend>
        <span class="eyebrow">QUESTION ${i+1} / ${data.questions.length} · ${W.escape(q.topic)}</span><span>${W.escape(q.question)}</span></legend>
        ${q.options.map((o,j) => `<label class="quiz-option"><input type="radio" name="question${i}" value="${j}" required><span>${W.escape(o)}</span></label>`).join('')}</fieldset>`).join('')}
        <button class="primary-btn" type="submit">Finish Re-test & compare →</button></form>`;
    const form = content.querySelector('form');
    window.StudyUI?.paginate(form);
    form.onsubmit = async event => {
      event.preventDefault(); if (busy) return;
      const values = new FormData(form), answers = data.questions.map((_,i) => values.get(`question${i}`));
      if (answers.some(a => a === null)) return setStatus('Answer every question before submitting.');
      const button = form.querySelector('button[type="submit"]'); busy = true; button.disabled = true; setStatus('Saving your re-test…');
      try {
        const result = await StudyGenieAPI.request(`/api/quizzes/${encodeURIComponent(data.quizId)}/submit`, { method: 'POST', body: JSON.stringify({ answers: answers.map(Number) }) });
        current = { ...data, ...result }; showResult(current);
      } catch (error) { setStatus(error.message); button.disabled = false; }
      finally { busy = false; }
    };
    setStatus('Re-test ready · Only your original weak topics are included.');
  }

  async function start(previousQuizId) {
    if (busy) return; busy = true;
    const button = content.querySelector('#practiceAgain') || generate;
    button.disabled = true; setStatus('Creating new questions for your weak topics…');
    try {
      const { retest } = await StudyGenieAPI.request(W.base(sourceId) + '/retest', {
        method: 'POST', body: JSON.stringify({ previousQuizId }), lectureSaved: true,
      });
      showQuiz(retest);
    } catch (error) { setStatus(error.message); }
    finally { busy = false; button.disabled = false; }
  }

  try {
    if (!sourceId) throw new Error('Choose a lecture from the workspace first.');
    document.querySelectorAll('a[href="dashboard.html"]').forEach(a => { a.href = W.href('dashboard',sourceId); });
    snapshot = await W.state(sourceId);
    document.getElementById('sourceTitle').textContent = snapshot.source.title || 'Your lecture';
    document.documentElement.lang = snapshot.source.language === 'hi' ? 'hi' : snapshot.source.language === 'hinglish' ? 'en-IN' : 'en';
    W.remember(snapshot.source); W.navigation(document.getElementById('featureNav'), sourceId, snapshot, 'retest');
    if (snapshot.source.status !== 'ready') throw new Error('Your lecture is still processing. Return to the workspace.');
    if (!snapshot.features.revision?.generated) {
      setStatus('Generate Smart Revision after completing your quiz to unlock Re-test.');
      content.innerHTML = reviewLink(); return;
    }
    const result = await StudyGenieAPI.request(W.base(sourceId) + '/retest');
    if (!result.topics.length) {
      setStatus('Your original quiz has no weak topics.');
      content.innerHTML = `<div class="feature-empty"><h2>All answers correct</h2><p>No weak-topic re-test is needed. You can keep practicing the full quiz.</p><a class="primary-btn" href="${W.href('quiz', sourceId)}">Practice Quiz Again →</a></div>`;
    } else if (result.retest) showQuiz(result.retest);
    else {
      setStatus('Ready to practice your weak topics.');
      content.innerHTML = `<div class="feature-empty"><h2>Check your understanding</h2><p>${result.topics.map(W.escape).join(' · ')}</p><p>Compare your result with these topics in the original quiz, then practice again whenever you like.</p></div>`;
      generate.hidden = false; generate.textContent = 'Start Re-test →'; generate.onclick = () => start();
    }
  } catch (error) {
    setStatus(error.message); content.innerHTML = '<p>Reload to try again, or return to Workspace.</p>';
  } finally { content.setAttribute('aria-busy', 'false'); }
})();
