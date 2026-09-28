(async () => {
  const message = document.getElementById('settingsMessage');
  const saveMsg = document.getElementById('saveMsg');
  const setMessage = (text) => { if (message) message.textContent = text; };

  try {
    const me = await StudyGenieAPI.request('/api/me');
    const profile = me.user.profile || {};
    const nameInput = document.getElementById('setName');
    const emailInput = document.getElementById('setEmail');
    const mobileInput = document.getElementById('setMobile');
    if (nameInput) nameInput.value = profile.full_name || '';
    if (emailInput) emailInput.value = me.user.email || '';
    if (mobileInput) mobileInput.value = profile.mobile || '';

    // Load saved study preferences
    const prefs = JSON.parse(localStorage.getItem('studygeniePreferences') || '{}');
    const diffEl = document.getElementById('difficulty');
    const studyRemEl = document.getElementById('studyReminder');
    const quizRemEl = document.getElementById('quizReminder');
    if (diffEl && prefs.difficulty) diffEl.value = prefs.difficulty;
    if (studyRemEl && typeof prefs.studyReminder === 'boolean') studyRemEl.checked = prefs.studyReminder;
    if (quizRemEl && typeof prefs.quizReminder === 'boolean') quizRemEl.checked = prefs.quizReminder;
  } catch (error) {
    setMessage(error.message);
  }

  // Settings navigation tab indicator
  const navLinks = document.querySelectorAll('.settings-nav a');
  navLinks.forEach((link) => {
    link.addEventListener('click', () => {
      navLinks.forEach((l) => l.classList.remove('active'));
      link.classList.add('active');
    });
  });

  document.getElementById('saveProfile')?.addEventListener('click', async () => {
    try {
      const result = await StudyGenieAPI.request('/api/me', {
        method: 'PATCH',
        body: JSON.stringify({
          full_name: document.getElementById('setName')?.value.trim(),
          mobile: document.getElementById('setMobile')?.value.trim(),
        }),
      });

      // Save study preferences locally
      const prefs = {
        difficulty: document.getElementById('difficulty')?.value || 'Balanced',
        studyReminder: Boolean(document.getElementById('studyReminder')?.checked),
        quizReminder: Boolean(document.getElementById('quizReminder')?.checked),
      };
      localStorage.setItem('studygeniePreferences', JSON.stringify(prefs));

      if (saveMsg) { saveMsg.classList.remove('hidden'); saveMsg.textContent = '✓ Settings saved successfully.'; }
      if (message) message.textContent = result.profile?.full_name ? `Saved for ${result.profile.full_name}.` : 'Saved.';
    } catch (error) {
      setMessage(error.message || 'Could not save settings.');
    }
  });

  document.getElementById('saveSecurity')?.addEventListener('click', async () => {
    const newPassword = document.getElementById('newPassword')?.value;
    if (!newPassword || newPassword.length < 8) return setMessage('Use at least 8 characters for a new password.');
    try {
      const sb = await StudyGenieAPI.getSupabase();
      const { error } = await sb.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setMessage('Password updated securely.');
      document.getElementById('newPassword').value = '';
    } catch (error) {
      setMessage(error.message || 'Could not update password.');
    }
  });
})();
