(async () => {
  try {
    const session = await StudyGenieAPI.session();
    if (!session) {
      location.replace('login.html');
      return;
    }
    window.studyGenieSession = session;
  } catch (_error) {
    location.replace('login.html');
  }
})();
