import axios from 'axios';

/**
 * Safe AI Tutor error mapping (Phase 11). Backend contracts:
 * 429 RATE_LIMITED, 503 AI_NOT_CONFIGURED, 503 PROVIDER_UNAVAILABLE.
 * Never exposes stack traces, keys, headers, or internal URLs.
 */
export function getAiTutorErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return 'Unable to reach AI Tutor. Please try again.';
    }
    const status = error.response.status;
    const code = (error.response.data as { error?: string })?.error ?? '';
    if (status === 429 || code === 'RATE_LIMITED') {
      return 'AI Tutor is temporarily rate-limited. Please try again shortly.';
    }
    if (code === 'AI_NOT_CONFIGURED') {
      return 'AI Tutor configuration is invalid. Please contact the administrator.';
    }
    if (code === 'AI_TIMEOUT' || status === 504) {
      return 'AI Tutor took too long to respond. Please try again.';
    }
    if (code === 'AI_BAD_REQUEST' || status === 400) {
      return 'The AI Tutor request could not be processed.';
    }
    if (status === 503 || code === 'PROVIDER_UNAVAILABLE' || (status >= 500 && status !== 504)) {
      return 'AI Tutor is temporarily unavailable. Please try again.';
    }
    if (status === 401) {
      return 'Your session has expired. Please log in again.';
    }
    if (status === 403) {
      return 'You are not enrolled in this course, so the tutor cannot answer questions about it.';
    }
    return 'AI Tutor is temporarily unavailable. Please try again.';
  }
  return 'AI Tutor is temporarily unavailable. Please try again.';
}

/** Human-friendly message for API failures: network / 401 / 403 / 404 / validation / server. */
export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return 'Network error — the server could not be reached. Check your connection and try again.';
    }
    const status = error.response.status;
    const backendMessage =
      (error.response.data as { message?: string; error?: string })?.message ??
      (error.response.data as { message?: string; error?: string })?.error;
    switch (status) {
      case 400:
        return backendMessage ? `Invalid input: ${backendMessage}` : 'Invalid input. Please check the form and try again.';
      case 401:
        return 'Your session has expired. Please log in again.';
      case 403:
        return backendMessage ?? 'You do not have permission to do that.';
      case 404:
        return backendMessage ?? 'The requested item was not found.';
      case 409:
        return backendMessage ?? 'This action conflicts with the current state.';
      case 429:
        return 'Too many requests — please wait a moment and retry.';
      default:
        if (status >= 500) return 'Server error — please try again in a moment.';
        return backendMessage ?? 'Something went wrong. Please try again.';
    }
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
