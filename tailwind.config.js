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
            DEFAULT: '#5812B8', // Deep PRIME Purple
            deep: '#321064',    // Dark Purple (contrast sections)
            rich: '#45108A',
            light: '#792BE0',   // Mountain Purple
            mountain: '#792BE0',
            dark: '#240B48',
          },
          lavender: {
            DEFAULT: '#B99AE8', // Soft Lavender (accents)
            light: '#EDE5F8',   // Light Lavender (card backgrounds)
            pure: '#F9F6FE',    // Ultra-light surface
            tint: '#F0EAF9',
            dark: '#9B72CF',
          },
          slate: {
            DEFAULT: '#2D1854', // Dark purple text
            deep: '#1A0B36',
            light: '#584577',
            muted: '#7E6C9E',
          },
          white: '#FFFFFF',     // Pure White
          // Backward compatibility mappings ensuring any remaining legacy classes render in the new palette
          maroon: {
            DEFAULT: '#5812B8',
            deep: '#321064',
            rich: '#45108A',
            light: '#792BE0',
          },
          cream: {
            DEFAULT: '#FFFFFF',
            light: '#FFFFFF',
            pure: '#FFFFFF',
            tint: '#F9F6FE',
            dark: '#EDE5F8',
          },
          bronze: {
            DEFAULT: '#792BE0',
            light: '#B99AE8',
            dark: '#5812B8',
            metallic: '#6822C8',
          },
          brown: {
            DEFAULT: '#2D1854',
            deep: '#1A0B36',
            light: '#584577',
          }
        }
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Playfair Display', 'Georgia', 'serif'],
        sans: ['Manrope', 'system-ui', '-apple-system', 'sans-serif'],
      },
      // Image corners: one subtle scale used site-wide (frames = large image panels and cards,
      // tiles = smaller images and thumbnails inside them).
      borderRadius: {
        frame: '0.875rem',
        tile: '0.625rem',
      },
      boxShadow: {
        'luxury': '0 20px 40px -15px rgba(88, 18, 184, 0.12)',
        'luxury-lg': '0 30px 60px -20px rgba(50, 16, 100, 0.22)',
        'bronze-glow': '0 0 30px rgba(121, 43, 224, 0.25)',
        'purple-glow': '0 0 30px rgba(121, 43, 224, 0.25)',
      },
      backgroundImage: {
        'purple-gradient': 'linear-gradient(180deg, #5812B8 0%, #321064 100%)',
        'lavender-gradient': 'linear-gradient(180deg, #FFFFFF 0%, #EDE5F8 100%)',
        'surface-gradient': 'linear-gradient(180deg, #FFFFFF 0%, #F9F6FE 100%)',
        'purple-sheen': 'linear-gradient(135deg, #B99AE8 0%, #792BE0 50%, #5812B8 100%)',
        'maroon-gradient': 'linear-gradient(180deg, #5812B8 0%, #321064 100%)',
        'cream-gradient': 'linear-gradient(180deg, #FFFFFF 0%, #EDE5F8 100%)',
        'bronze-sheen': 'linear-gradient(135deg, #B99AE8 0%, #792BE0 50%, #5812B8 100%)',
      }
    },
  },
  plugins: [],
}
