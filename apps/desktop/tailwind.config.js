/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#3b82f6', // electric blue
          hover: '#2563eb',
          purple: '#8b5cf6', // violet
          purpleHover: '#7c3aed'
        },
        dark: {
          900: '#030712', // deep black/blue
          800: '#0b0f19', // panel background
          700: '#1f2937', // border / secondary
          600: '#374151'
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      backdropBlur: {
        xs: '2px',
      }
    },
  },
  plugins: [],
}
