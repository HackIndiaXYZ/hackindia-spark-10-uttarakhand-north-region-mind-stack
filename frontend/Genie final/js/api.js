const StudyGenieAPI = (() => {
  const API_BASE = window.STUDYGENIE_API_BASE_URL || "http://localhost:4000";
  let configPromise;
  const loadConfig = async () => {
    if (!configPromise) {
      configPromise = fetch(`${API_BASE}/api/config/public`, {
        credentials: "omit",
      })
        .then((r) =>
          r.ok ? r.json() : Promise.reject(new Error("Backend unavailable.")),
        )
        .catch((error) => {
          configPromise = null;
          throw error;
        });
    }
    return configPromise;
  };

  const getSupabase = async () => {
    const config = await loadConfig();
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error("Supabase public configuration is missing.");
    }
    if (!window.supabaseClient) {
      if (!window.supabase?.createClient)
        throw new Error("Supabase library failed to load.");
      window.supabaseClient = window.supabase.createClient(
        config.supabaseUrl,
        config.supabaseAnonKey,
      );
    }
    return window.supabaseClient;
  };

  const session = async () => {
    const sb = await getSupabase();
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    return data.session;
  };

  function friendlyError(error, lectureSaved = false) {
    const status = Number(error.status || 0);
    const saved = lectureSaved ? " Your lecture is already saved." : "";
    let message = error.message;
    if (status === 429)
      message =
        (lectureSaved
          ? "AI request limit reached."
          : "Request limit reached.") +
        saved +
        " Please retry later.";
    else if (status >= 500)
      message =
        (lectureSaved
          ? "AI is temporarily busy."
          : "The service is temporarily busy.") +
        saved +
        " Please retry later.";
    else if (
      error.network ||
      error instanceof TypeError ||
      /fetch|network|offline|Backend unavailable/i.test(message)
    )
      message =
        "Unable to connect. Check your connection." +
        saved +
        " Please retry later.";
    return Object.assign(new Error(message), {
      status,
      code: error.code || (error.network ? "NETWORK_ERROR" : "REQUEST_ERROR"),
      retryable: !!(
        error.retryable ||
        error.network ||
        status === 429 ||
        status >= 500
      ),
    });
  }
  const request = async (path, options = {}) => {
    const { lectureSaved = false, ...fetchOptions } = options;
    try {
      const sbSession = await session();
      const headers = new Headers(options.headers || {});
      headers.set("Content-Type", "application/json");
      if (sbSession?.access_token)
        headers.set("Authorization", `Bearer ${sbSession.access_token}`);

      const response = await fetch(`${API_BASE}${path}`, {
        ...fetchOptions,
        headers,
        credentials: "omit",
      }).catch((error) => {
        error.network = true;
        throw error;
      });

      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json")
        ? await response.json()
        : await response.text();
      if (!response.ok) {
        const message =
          typeof payload?.error === "string"
            ? payload.error
            : "Request failed (" + response.status + "). Please retry later.";
        throw Object.assign(new Error(message), {
          status: response.status,
          code: payload?.code,
          retryable: payload?.retryable,
        });
      }
      return payload;
    } catch (error) {
      throw friendlyError(error, lectureSaved);
    }
  };

  return { loadConfig, getSupabase, session, request, friendlyError };
})();

window.StudyGenieAPI = StudyGenieAPI;
