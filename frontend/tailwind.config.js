/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Legacy warm palette (still referenced across pages)
        cream: '#F7F4EF',
        'surface-light': '#FBF9F5',
        'border-warm': '#E7E1D7',
        ink: '#1F2421',
        'text-muted': '#5C635D',
        charcoal: '#1F2421',
        terracotta: {
          DEFAULT: '#C4612F',
          hover: '#A94E22',
          tint: '#F2E3D6',
        },
        // Modern EdTech SaaS palette (Phase 17/18 design system)
        brand: {
          50: '#F5F3FF',
          100: '#EDE9FE',
          200: '#DDD6FE',
          300: '#C4B5FD',
          400: '#A78BFA',
          500: '#8B5CF6',
          600: '#7C3AED',
          700: '#6D28D9',
          800: '#5B21B6',
          900: '#4C1D95',
        },
        accent: {
          cyan: '#06B6D4',
          blue: '#3B82F6',
          green: '#10B981',
          amber: '#F59E0B',
          red: '#EF4444',
          orange: '#F97316',
        },
        night: {
          950: '#0B1020',
          900: '#111827',
          800: '#172033',
          700: '#1E293B',
          600: '#243149',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Fraunces', 'Georgia', 'serif'],
      },
      borderRadius: {
        pill: '999px',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.08)',
        lift: '0 10px 24px -8px rgba(15, 23, 42, 0.18), 0 4px 10px -4px rgba(15, 23, 42, 0.10)',
        glow: '0 0 0 1px rgba(124, 58, 237, 0.25), 0 8px 24px -8px rgba(124, 58, 237, 0.35)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out both',
        'fade-up': 'fade-up 260ms ease-out both',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
};
