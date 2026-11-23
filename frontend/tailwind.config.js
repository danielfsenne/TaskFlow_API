/** @type {import('tailwindcss').Config} */
// neutros vêm de variáveis CSS: o tema escuro só troca as variáveis (styles.scss)
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const slate = Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((s) => [s, v(`slate-${s}`)]),
);

module.exports = {
  content: ['./src/**/*.{html,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        white: v('white'),
        slate,
        page: v('page'),
        column: v('column'),
        brand: {
          50: '#eff5ff',
          100: '#dbe7fe',
          200: '#bfd4fe',
          300: '#93b7fd',
          400: '#5f91fa',
          500: '#3b6ef5',
          600: '#2557e0',
          700: v('brand-700'),
          800: '#1e3b9a',
          900: '#1e357a',
        },
        ink: v('ink'),
        series: { created: v('series-created'), completed: v('series-completed') },
        critical: v('critical'),
      },
    },
  },
  plugins: [],
};
