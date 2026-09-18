import { describe, it, expect } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { getAiTutorErrorMessage } from './apiError';

// Backend contract: 429 RATE_LIMITED, 400 AI_BAD_REQUEST, 504 AI_TIMEOUT,
// 503 AI_NOT_CONFIGURED / PROVIDER_UNAVAILABLE. Messages must stay user-safe
// (no stack traces, provider internals, URLs, or key material).
function axiosError(status: number, code?: string): AxiosError {
  const config = { headers: new AxiosHeaders() };
  const response = { status, data: code ? { error: code } : {}, headers: {} };
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, {}, response as never);
}

describe('AI Tutor error mapping', () => {
  it('maps 429 / RATE_LIMITED', () => {
    expect(getAiTutorErrorMessage(axiosError(429, 'RATE_LIMITED'))).toMatch(/rate-limited/i);
    expect(getAiTutorErrorMessage(axiosError(429))).toMatch(/rate-limited/i);
  });

  it('maps AI_NOT_CONFIGURED (401-style config problems)', () => {
    expect(getAiTutorErrorMessage(axiosError(503, 'AI_NOT_CONFIGURED'))).toMatch(/configuration is invalid/i);
  });

  it('maps 400 / AI_BAD_REQUEST', () => {
    expect(getAiTutorErrorMessage(axiosError(400, 'AI_BAD_REQUEST'))).toMatch(/could not be processed/i);
  });

  it('maps 504 / AI_TIMEOUT', () => {
    expect(getAiTutorErrorMessage(axiosError(504, 'AI_TIMEOUT'))).toMatch(/took too long/i);
    expect(getAiTutorErrorMessage(axiosError(504))).toMatch(/took too long/i);
  });

  it('maps PROVIDER_UNAVAILABLE and other 5xx', () => {
    expect(getAiTutorErrorMessage(axiosError(503, 'PROVIDER_UNAVAILABLE'))).toMatch(/temporarily unavailable/i);
    expect(getAiTutorErrorMessage(axiosError(500))).toMatch(/temporarily unavailable/i);
  });

  it('never leaks provider internals', () => {
    const msg = getAiTutorErrorMessage(axiosError(500));
    expect(msg).not.toMatch(/openrouter|api\.|Bearer|sk-/i);
  });
});
