import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/common/Input';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { UserPlus } from 'lucide-react';

export const RegisterPage = () => {
  const { register, isRegistering, registerError } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (formData.name.length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      register({
        name: formData.name,
        email: formData.email,
        password: formData.password,
      });
    }
  };

  return (
    <Card className="p-8 animate-fade-up">
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#F2E3D6] to-[#FBF9F5] dark:from-[#2c241c] dark:to-[#23261f] ring-1 ring-[#E7E1D7] dark:ring-[#2c2f2a] flex items-center justify-center mb-5">
        <UserPlus className="text-[#C4612F] dark:text-[#e8a06f]" size={20} />
      </div>
      <h2 className="text-2xl font-serif font-normal text-[#1F2421] dark:text-[#ece9e2] mb-1">
        Create your <span className="italic text-[#C4612F] dark:text-[#e8a06f]">account</span>
      </h2>
      <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] mb-6">Start learning with an AI tutor in minutes.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {registerError && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-sm text-red-800 dark:text-red-200">
            {registerError instanceof Error
              ? registerError.message
              : 'Registration failed. Please try again.'}
          </div>
        )}

        <Input
          label="Full Name"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="John Doe"
          required
          error={errors.name}
          autoComplete="name"
        />

        <Input
          type="email"
          label="Email"
          value={formData.email}
          onChange={(e) => handleChange('email', e.target.value)}
          placeholder="your@email.com"
          required
          error={errors.email}
          autoComplete="email"
        />

        <Input
          type="password"
          label="Password"
          value={formData.password}
          onChange={(e) => handleChange('password', e.target.value)}
          placeholder="••••••••"
          required
          error={errors.password}
          autoComplete="new-password"
        />

        <Input
          type="password"
          label="Confirm Password"
          value={formData.confirmPassword}
          onChange={(e) => handleChange('confirmPassword', e.target.value)}
          placeholder="••••••••"
          required
          error={errors.confirmPassword}
          autoComplete="new-password"
        />

        <Button type="submit" fullWidth loading={isRegistering}>
          Create account
        </Button>
      </form>

      <div className="mt-6 pt-5 border-t border-[#E7E1D7] dark:border-[#2c2f2a] text-center text-sm text-[#5C635D] dark:text-[#b9beb4]">
        Already have an account?{' '}
        <Link to="/login" className="text-[#A94E22] dark:text-[#e8a06f] hover:underline font-medium">
          Sign in
        </Link>
      </div>
    </Card>
  );
};
