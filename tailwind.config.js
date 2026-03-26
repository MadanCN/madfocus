/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg:       '#f9f8f6',
        surface:  '#ffffff',
        border:   '#e8e5e0',
        'border-light': '#f0ede8',
        text:     '#1a1916',
        muted:    '#8a8680',
        faint:    '#c4c0ba',
        accent:   '#2d5a3d',
        'accent-light': '#eef4f0',
        'accent-mid':   '#c8dece',
        danger:   '#c0392b',
        'danger-light': '#fdf0ee',
        warn:     '#b8860b',
        'warn-light':   '#fdf8ec',
      },
      fontFamily: {
        sans:  ['"DM Sans"', 'sans-serif'],
        serif: ['"Instrument Serif"', 'serif'],
      },
      borderRadius: {
        card: '10px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04)',
        md:   '0 4px 16px rgba(0,0,0,.08)',
      },
      screens: {
        // override lg to 960px so sidebar shows earlier than default 1024px
        lg: '960px',
      },
    },
  },
  plugins: [],
}
