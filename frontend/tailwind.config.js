/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
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
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Fraunces', 'Georgia', 'serif'],
      },
      borderRadius: {
        pill: '999px',
      },
    },
  },
  plugins: [],
};
