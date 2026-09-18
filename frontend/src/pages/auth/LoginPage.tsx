import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/common/Input';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';

export const LoginPage = () => {
  const { login, isLoggingIn, loginError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login({ email, password });
  };

  return (
    <Card>
      <h2 className="text-2xl font-serif font-normal text-[#1F2421] mb-6 text-center">
        Welcome <span className="italic text-[#C4612F]">back</span>
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {loginError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            {loginError instanceof Error ? loginError.message : 'Login failed. Please try again.'}
          </div>
        )}

        <Input
          type="email"
          label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          autoComplete="email"
        />

        <Input
          type="password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          autoComplete="current-password"
        />

        <Button type="submit" fullWidth loading={isLoggingIn}>
          Sign in
        </Button>
      </form>

      <div className="mt-6 text-center text-sm text-[#5C635D]">
        Don't have an account?{' '}
        <Link to="/register" className="text-[#A94E22] dark:text-[#e8a06f] hover:underline font-medium">
          Sign up
        </Link>
      </div>
    </Card>
  );
};
