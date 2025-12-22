/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  safelist: [
    // Hash-based badge colors (dynamically selected, must be safelisted)
    'bg-rose-100', 'text-rose-800', 'dark:bg-rose-900/30', 'dark:text-rose-400',
    'bg-amber-100', 'text-amber-800', 'dark:bg-amber-900/30', 'dark:text-amber-400',
    'bg-lime-100', 'text-lime-800', 'dark:bg-lime-900/30', 'dark:text-lime-400',
    'bg-emerald-100', 'text-emerald-800', 'dark:bg-emerald-900/30', 'dark:text-emerald-400',
    'bg-sky-100', 'text-sky-800', 'dark:bg-sky-900/30', 'dark:text-sky-400',
    'bg-violet-100', 'text-violet-800', 'dark:bg-violet-900/30', 'dark:text-violet-400',
    'bg-fuchsia-100', 'text-fuchsia-800', 'dark:bg-fuchsia-900/30', 'dark:text-fuchsia-400',
    'bg-stone-200', 'text-stone-800', 'dark:bg-stone-800/50', 'dark:text-stone-300',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
      },
    },
  },
  plugins: [],
}
