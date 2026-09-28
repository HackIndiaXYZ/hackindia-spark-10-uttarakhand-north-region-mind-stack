(async () => {
  const text = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  try {
    const [me, progress] = await Promise.all([
      StudyGenieAPI.request('/api/me'),
      StudyGenieAPI.request('/api/progress').catch(() => ({})),
    ]);
    const name = me.user.profile?.full_name || me.user.email?.split('@')[0] || 'Student';
    text('profileNameLarge', name);
    text('profileContact', me.user.email || me.user.profile?.mobile || '');
    text('profileAvatar', name[0]?.toUpperCase() || 'S');

    text('lectureCount', progress.lectureCount ?? 0);
    text('toolCount', progress.toolCount ?? 0);
    text('quizScore', progress.latestScore ?? '—');
  } catch (error) {
    text('profileContact', error.message);
  }
})();
