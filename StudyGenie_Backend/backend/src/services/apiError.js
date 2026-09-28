// Keep provider details in server logs; return stable, actionable messages.
export function apiError(error, { lectureSaved = false } = {}) {
  const raw = String(error?.message || 'Unexpected server error.');
  const status = Number(error?.status || error?.code || error?.cause?.status);
  const saved = lectureSaved ? ' Your lecture is already saved.' : '';
  const retry = `${saved} Please retry later.`;
  if (status === 429 || /RESOURCE_EXHAUSTED/i.test(raw)) return { status: 429, code: 'RATE_LIMITED', retryable: true, error: (error?.provider === 'gemini' ? 'AI request limit reached.' : 'Request limit reached.') + retry };
  if ([500,502,503,504].includes(status) || /overload|fetch failed|ECONN|ETIMEDOUT|network|empty response|fallback/i.test(raw) || error?.fallbackExhausted) {
    return { status: 503, code: error?.fallbackExhausted ? 'AI_FALLBACK_EXHAUSTED' : 'TEMPORARILY_UNAVAILABLE', retryable: true, error: (error?.provider === 'gemini' || error?.fallbackExhausted ? 'AI is temporarily busy.' : 'The service is temporarily unavailable.') + retry };
  }
  if (status >= 400 && status < 500) return { status, code: 'REQUEST_ERROR', retryable: false, error: raw };
  if (/^(Lecture|Transcript|Quiz) not found\.?$/i.test(raw)) return {status:404, code:'NOT_FOUND', retryable:false, error:raw};
  if (/^(Enter a valid YouTube URL|Transcript is not ready|Complete a quiz first)/i.test(raw)) return {status:400, code:'INVALID_REQUEST', retryable:false, error:raw};
  return { status:500, code:'TEMPORARY_FAILURE', retryable:true, error:'We could not complete this request just now.' + retry };
}
