import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { authStore } from '@/store/authStore';

describe('ProtectedRoute', () => {
  beforeEach(() => {
    authStore.getState().logout();
    vi.clearAllMocks();
  });

  it('redirects unauthenticated users to /login', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Dashboard</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders children when authenticated', () => {
    authStore.setState({
      user: { id: '1', email: 'a@b.com', name: 'A', roles: ['student'], createdAt: '' },
      accessToken: 'token',
      refreshToken: 'refresh',
      isAuthenticated: true,
    });
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('redirects to /unauthorized when role is missing', () => {
    authStore.setState({
      user: { id: '1', email: 'a@b.com', name: 'A', roles: ['student'], createdAt: '' },
      accessToken: 'token',
      refreshToken: 'refresh',
      isAuthenticated: true,
    });
    render(
      <MemoryRouter initialEntries={['/instructor']}>
        <Routes>
          <Route
            path="/instructor"
            element={
              <ProtectedRoute requiredRoles={['instructor']}>
                <div>Instructor</div>
              </ProtectedRoute>
            }
          />
          <Route path="/unauthorized" element={<div>Unauthorized</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Unauthorized')).toBeInTheDocument();
  });
});
