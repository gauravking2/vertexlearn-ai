import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/common/Input';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { LogIn } from 'lucide-react';

export const LoginPage = () => {
  const { login, isLoggingIn, loginError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login({ email, password });
  };

  return (
    <Card className="p-8 animate-fade-up">
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#F2E3D6] to-[#FBF9F5] dark:from-[#2c241c] dark:to-[#23261f] ring-1 ring-[#E7E1D7] dark:ring-[#2c2f2a] flex items-center justify-center mb-5">
        <LogIn className="text-[#C4612F] dark:text-[#e8a06f]" size={20} />
      </div>
      <h2 className="text-2xl font-serif font-normal text-[#1F2421] dark:text-[#ece9e2] mb-1">
        Welcome <span className="italic text-[#C4612F] dark:text-[#e8a06f]">back</span>
      </h2>
      <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] mb-6">Sign in to continue your learning journey.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {loginError && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-sm text-red-800 dark:text-red-200">
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

      <div className="mt-6 pt-5 border-t border-[#E7E1D7] dark:border-[#2c2f2a] text-center text-sm text-[#5C635D] dark:text-[#b9beb4]">
        Don't have an account?{' '}
        <Link to="/register" className="text-[#A94E22] dark:text-[#e8a06f] hover:underline font-medium">
          Sign up
        </Link>
      </div>
    </Card>
  );
};
