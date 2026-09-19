import axios from 'axios';
import { authStore } from '@/store/authStore';

// Backend REST base. The frontend talks ONLY to the core backend under /api/v1;
// it must never call the FastAPI AI service directly.
const API_BASE_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/v1`;

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to attach the access token.
api.interceptors.request.use(
  (config) => {
    const token = authStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Login path that respects the Vite base (GitHub Pages serves from
// /vertexlearn-ai/, local dev from /). Keeps auth redirects working in both.
function loginPath(): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${base}/login`;
}

// Response interceptor: on 401, rotate the refresh token once and retry.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = authStore.getState().refreshToken;
      if (refreshToken) {
        try {
          // Refresh tokens are single-use and rotated: the backend returns a NEW
          // pair, so we must persist both, not reuse the presented refresh token.
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refreshToken,
          });

          const { accessToken, refreshToken: newRefreshToken } = response.data;
          authStore.getState().setTokens(accessToken, newRefreshToken);

          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        } catch (refreshError) {
          authStore.getState().logout();
          window.location.href = loginPath();
          return Promise.reject(refreshError);
        }
      } else {
        authStore.getState().logout();
        window.location.href = loginPath();
      }
    }

    return Promise.reject(error);
  }
);
