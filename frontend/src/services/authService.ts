import { api } from './api';
import { User } from '@/types';

interface AuthTokensResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export const authService = {
  // Register returns only the created user (no tokens); caller then logs in.
  async register(data: {
    name: string;
    email: string;
    password: string;
    role?: 'student' | 'instructor';
  }): Promise<{ user: User }> {
    const response = await api.post<{ user: User }>('/auth/register', data);
    return response.data;
  },

  async login(data: { email: string; password: string }): Promise<AuthTokensResponse> {
    const response = await api.post<AuthTokensResponse>('/auth/login', data);
    return response.data;
  },

  // Logout revokes the presented refresh token (204 No Content).
  async logout(refreshToken: string): Promise<void> {
    await api.post('/auth/logout', { refreshToken });
  },

  async getCurrentUser(): Promise<{ user: User }> {
    const response = await api.get<{ user: User }>('/auth/me');
    return response.data;
  },

  async refreshToken(
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const response = await api.post<{ accessToken: string; refreshToken: string }>(
      '/auth/refresh',
      { refreshToken }
    );
    return response.data;
  },
};
