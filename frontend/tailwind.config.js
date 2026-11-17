/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff5ff',
          100: '#dbe7fe',
          200: '#bfd4fe',
          300: '#93b7fd',
          400: '#5f91fa',
          500: '#3b6ef5',
          600: '#2557e0',
          700: '#1d45bf',
          800: '#1e3b9a',
          900: '#1e357a',
        },
        ink: '#1f2328',
        series: { created: '#2a78d6', completed: '#1baf7a' },
        critical: '#d03b3b',
      },
    },
  },
  plugins: [],
};
