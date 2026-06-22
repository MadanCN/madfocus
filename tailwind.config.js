/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Resolved via CSS custom properties — light + dark auto-switch
        bg:             'var(--c-bg)',
        surface:        'var(--c-surface)',
        'surface-2':    'var(--c-surface-2)',
        border:         'var(--c-border)',
        'border-light': 'var(--c-border-light)',
        text:           'var(--c-text)',
        muted:          'var(--c-muted)',
        faint:          'var(--c-faint)',
        accent:         'var(--c-accent)',
        'accent-fg':    'var(--c-accent-fg)',
        'accent-light': 'var(--c-accent-light)',
        'accent-mid':   'var(--c-accent-mid)',
        danger:         'var(--c-danger)',
        'danger-light': 'var(--c-danger-light)',
        warn:           'var(--c-warn)',
        'warn-light':   'var(--c-warn-light)',
      },
      fontFamily: {
        sans:  ['"DM Sans"', 'sans-serif'],
        serif: ['"Instrument Serif"', 'serif'],
      },
      borderRadius: {
        card: '12px',
      },
      boxShadow: {
        card:  '0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.03)',
        md:    '0 4px 20px rgba(0,0,0,.10)',
        fab:   '0 4px 24px rgba(0,0,0,.22)',
        panel: '0 8px 36px rgba(0,0,0,.18)',
      },
      screens: {
        lg: '960px',
      },
    },
  },
  plugins: [],
}
