/* Print the live, already-rendered document. No canvas, clones, or API calls. */
window.StudyPrint = (() => {
  let active = false, restore = null;
  const content = () => document.getElementById('featureContent');
  function finish() {
    restore?.();
    restore = null;
    active = false;
  }
  function prepare() {
    if (restore || !content()) return;
    const details = [...content().querySelectorAll('details')].map(el => [el, el.open]);
    const title = document.title;
    const type = document.body.dataset.feature;
    const label = type === 'quiz' ? 'Quiz Result' : StudyWorkspace.titles[type];
    document.title = `${document.getElementById('sourceTitle')?.textContent || 'StudyGenie'} — ${label}`;
    details.forEach(([el]) => { el.open = true; });
    // Establish print geometry explicitly before measuring. Fit the complete
    // visual map onto one landscape sheet, then redraw its vector connectors.
    const map = content().querySelector('.mindmap');
    const oldZoom = map?.style.zoom || '';
    if (map) {
      document.body.classList.add('sg-print-map');
      map.style.setProperty('--print-columns', map.querySelectorAll('.map-branch').length > 6 ? '4' : '3');
      map.style.zoom = '1';
      map.style.zoom = String(Math.min(1, (145 * 96 / 25.4) / map.offsetHeight));
      window.dispatchEvent(new Event('studygenie:print-layout'));
    }
    restore = () => {
      details.forEach(([el, open]) => { el.open = open; });
      document.title = title;
      if (map) {
        document.body.classList.remove('sg-print-map');
        map.style.removeProperty('--print-columns');
        map.style.zoom = oldZoom;
        requestAnimationFrame(() => window.dispatchEvent(new Event('studygenie:print-layout')));
      }
    };
  }
  async function exportPdf() {
    if (active) return;
    const el = content();
    if (!el || el.getAttribute('aria-busy') === 'true' || !el.textContent.trim()) throw new Error('Wait for your saved content to finish loading.');
    if (document.body.dataset.feature === 'quiz' && !el.querySelector('.quiz-score')) throw new Error('Complete the quiz first to print your result.');
    active = true;
    try {
      await StudyWorkspace.mathReady();
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.print();
    } catch (error) {
      finish();
      throw error;
    } finally {
      // Most browsers block until the dialog closes; afterprint handles browsers
      // which return early. Do not tear down print layout on a timer.
      if (!restore) active = false;
    }
  }
  window.addEventListener('beforeprint', prepare);
  window.addEventListener('afterprint', finish);
  return { exportPdf };
})();
