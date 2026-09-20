/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#081c15',
          primary: '#1b4332',
          medium: '#2d6a4f',
          light: '#40916c',
          sage: '#52b788',
          leaf: '#74c69d',
          tint: '#d8f3dc',
          bg: '#eef8f1',
        },
        surface: {
          base: '#f8f9fa',
          subtle: '#f1f3f2',
          panel: '#ffffff',
          dark: '#1e2522',
        },
        charcoal: {
          DEFAULT: '#191f1d',
          dark: '#111827',
          medium: '#374151',
          muted: '#6b7280',
          light: '#9ca3af',
        },
        status: {
          success: '#15803d',
          'success-bg': '#f0fdf4',
          warning: '#b45309',
          'warning-bg': '#fffbeb',
          error: '#b91c1c',
          'error-bg': '#fef2f2',
          info: '#1d4ed8',
          'info-bg': '#eff6ff',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
