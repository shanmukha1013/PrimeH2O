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
          maroon: {
            DEFAULT: '#500D18',
            deep: '#3E0912',
            rich: '#5A101C',
            light: '#6E1624',
          },
          cream: {
            DEFAULT: '#F8EFE5',
            light: '#FAF5EE',
            pure: '#FBF7F2',
            tint: '#EFE2D4',
            dark: '#E7D5C2',
          },
          bronze: {
            DEFAULT: '#C69A70',
            light: '#D4B08C',
            dark: '#AF8057',
            metallic: '#B88657',
          },
          brown: {
            DEFAULT: '#49302B',
            deep: '#3B241F',
            light: '#5E3F39',
          }
        }
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Playfair Display', 'Georgia', 'serif'],
        sans: ['Manrope', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'luxury': '0 20px 40px -15px rgba(80, 13, 24, 0.15)',
        'luxury-lg': '0 30px 60px -20px rgba(80, 13, 24, 0.25)',
        'bronze-glow': '0 0 30px rgba(198, 154, 112, 0.25)',
      },
      backgroundImage: {
        'maroon-gradient': 'linear-gradient(180deg, #500D18 0%, #3E0912 100%)',
        'cream-gradient': 'linear-gradient(180deg, #FAF5EE 0%, #F8EFE5 100%)',
        'bronze-sheen': 'linear-gradient(135deg, #D4B08C 0%, #C69A70 50%, #AF8057 100%)',
      }
    },
  },
  plugins: [],
}
