import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authService } from '@/services/authService';
import { authStore } from '@/store/authStore';
import { LoginCredentials, RegisterData } from '@/types';
import { useNavigate } from 'react-router-dom';

export const useAuth = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user, isAuthenticated, setUser, setTokens, logout: storeLogout } = authStore();

  const loginMutation = useMutation({
    mutationFn: (credentials: LoginCredentials) => authService.login(credentials),
    onSuccess: (data) => {
      setUser(data.user);
      setTokens(data.accessToken, data.refreshToken);
      queryClient.invalidateQueries();
      navigate('/dashboard');
    },
  });

  // Register returns only the user; after success, automatically log in.
  const registerMutation = useMutation({
    mutationFn: async (data: RegisterData) => {
      await authService.register(data);
      // Auto-login after registration
      return authService.login({ email: data.email, password: data.password });
    },
    onSuccess: (data) => {
      setUser(data.user);
      setTokens(data.accessToken, data.refreshToken);
      queryClient.invalidateQueries();
      navigate('/dashboard');
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const refreshToken = authStore.getState().refreshToken;
      if (refreshToken) {
        await authService.logout(refreshToken);
      }
    },
    onSettled: () => {
      storeLogout();
      queryClient.clear();
      navigate('/login');
    },
  });

  const { data: currentUserData, isLoading: isLoadingUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: authService.getCurrentUser,
    enabled: isAuthenticated && !user,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // Sync fetched user with store
  if (currentUserData?.user && !user) {
    setUser(currentUserData.user);
  }

  return {
    user,
    isAuthenticated,
    isLoadingUser,
    login: loginMutation.mutate,
    register: registerMutation.mutate,
    logout: logoutMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    isRegistering: registerMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
    loginError: loginMutation.error,
    registerError: registerMutation.error,
  };
};
