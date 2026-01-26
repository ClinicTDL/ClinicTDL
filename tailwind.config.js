/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'selector',
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"SF Thonburi"', 'system-ui', 'sans-serif'],
      },
      colors: {
        clinic: {
          light: '#f5f9ff',
          blue: '#1d4ed8',
          border: '#dbeafe',
        },
      },
    },
  },
  plugins: [],
}
