import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/common/Input';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';

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
    <Card>
      <h2 className="text-2xl font-serif font-normal text-[#1F2421] mb-6 text-center">
        Create your <span className="italic text-[#C4612F]">account</span>
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {registerError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
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

      <div className="mt-6 text-center text-sm text-[#5C635D]">
        Already have an account?{' '}
        <Link to="/login" className="text-[#A94E22] dark:text-[#e8a06f] hover:underline font-medium">
          Sign in
        </Link>
      </div>
    </Card>
  );
};
