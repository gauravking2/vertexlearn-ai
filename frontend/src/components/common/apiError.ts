import axios from 'axios';

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
