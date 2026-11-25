/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./admin.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          purple: {
            DEFAULT: '#6D28D9', // Primary medium bottle purple
            deep: '#5B21B6',
            rich: '#6D28D9',
            light: '#8B5CF6',   // Secondary vibrant purple
            mountain: '#8B5CF6',
            dark: '#4C1D95',
            vibrant: '#7C3AED',
          },
          lavender: {
            DEFAULT: '#A78BFA', // Accent soft purple
            light: '#EDE9FE',   // Light Lavender
            pure: '#F8F7FF',    // Soft Background
            soft: '#DDD6FE',
            tint: '#F5F3FF',
            dark: '#8B5CF6',
          },
          slate: {
            DEFAULT: '#3B0764', // Deep Purple Text for high-contrast readability
            deep: '#2E0550',
            light: '#4C1D95',
            muted: '#6B21A8',
            subtle: '#7E22CE',
          },
          white: '#FFFFFF',
          // Compatibility aliases
          maroon: {
            DEFAULT: '#6D28D9',
            deep: '#5B21B6',
            rich: '#6D28D9',
            light: '#8B5CF6',
          },
          cream: {
            DEFAULT: '#FFFFFF',
            light: '#FFFFFF',
            pure: '#FFFFFF',
            tint: '#F8F7FF',
            dark: '#EDE9FE',
          },
          bronze: {
            DEFAULT: '#8B5CF6',
            light: '#A78BFA',
            dark: '#6D28D9',
            metallic: '#7C3AED',
          },
          brown: {
            DEFAULT: '#3B0764',
            deep: '#2E0550',
            light: '#4C1D95',
          }
        }
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Playfair Display', 'Georgia', 'serif'],
        sans: ['Manrope', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        frame: '0.875rem',
        tile: '0.625rem',
      },
      boxShadow: {
        'luxury': '0 20px 40px -15px rgba(109, 40, 217, 0.10)',
        'luxury-lg': '0 30px 60px -20px rgba(109, 40, 217, 0.16)',
        'purple-glow': '0 0 30px rgba(139, 92, 246, 0.20)',
        'bronze-glow': '0 0 30px rgba(139, 92, 246, 0.20)',
      },
      backgroundImage: {
        'hero-gradient': 'linear-gradient(180deg, #FFFFFF 0%, #F5F3FF 50%, #EDE9FE 100%)',
        'surface-gradient': 'linear-gradient(180deg, #FFFFFF 0%, #F8F7FF 100%)',
        'lavender-gradient': 'linear-gradient(180deg, #F8F7FF 0%, #EDE9FE 100%)',
        'card-gradient': 'linear-gradient(135deg, #FFFFFF 0%, #F8F7FF 100%)',
        'purple-gradient': 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
        'purple-sheen': 'linear-gradient(135deg, #A78BFA 0%, #8B5CF6 50%, #6D28D9 100%)',
        'maroon-gradient': 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
        'cream-gradient': 'linear-gradient(180deg, #FFFFFF 0%, #EDE9FE 100%)',
        'bronze-sheen': 'linear-gradient(135deg, #A78BFA 0%, #8B5CF6 50%, #6D28D9 100%)',
      }
    },
  },
  plugins: [],
}
