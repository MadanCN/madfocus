/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Resolved via CSS custom properties — light + dark auto-switch
        paper:          'var(--c-paper)',
        surface:        'var(--c-surface)',
        sunken:         'var(--c-sunken)',
        line:           'var(--c-line)',
        'line-soft':    'var(--c-line-soft)',
        ink:            'var(--c-ink)',
        muted:          'var(--c-muted)',
        faint:          'var(--c-faint)',
        accent:         'var(--c-accent)',
        'accent-fg':    'var(--c-accent-fg)',
        'accent-soft':  'var(--c-accent-soft)',
        'accent-mid':   'var(--c-accent-mid)',
        live:           'var(--c-live)',
        'live-ink':     'var(--c-live-ink)',
        danger:         'var(--c-danger)',
        'danger-soft':  'var(--c-danger-soft)',
        warn:           'var(--c-warn)',
        'warn-soft':    'var(--c-warn-soft)',
        good:           'var(--c-good)',
        'good-soft':    'var(--c-good-soft)',
        // Module wayfinding hues
        'm-tasks':      'var(--m-tasks)',
        'm-habits':     'var(--m-habits)',
        'm-goals':      'var(--m-goals)',
        'm-journal':    'var(--m-journal)',
        'm-library':    'var(--m-library)',
        'm-notes':      'var(--m-notes)',
      },
      fontFamily: {
        sans:  ['"Schibsted Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Literata', 'ui-serif', 'Georgia', 'serif'],
      },
      fontSize: {
        // Classical scale: 11 · 12 · 13 · 14 · 16 · 18 · 21 · 24 · 30 · 36 · 48
        '2xs':  ['11px', { lineHeight: '15px' }],
        xs:     ['12px', { lineHeight: '16px' }],
        sm:     ['13px', { lineHeight: '18px' }],
        base:   ['14px', { lineHeight: '21px' }],
        md:     ['16px', { lineHeight: '24px' }],
        lg:     ['18px', { lineHeight: '26px' }],
        xl:     ['21px', { lineHeight: '28px' }],
        '2xl':  ['24px', { lineHeight: '31px' }],
        '3xl':  ['30px', { lineHeight: '36px' }],
        '4xl':  ['36px', { lineHeight: '42px' }],
        '5xl':  ['48px', { lineHeight: '52px' }],
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '8px',
        md: '10px',
        lg: '14px',
        xl: '20px',
      },
      boxShadow: {
        float: 'var(--shadow-float)',
        pop:   'var(--shadow-pop)',
      },
      transitionTimingFunction: {
        out:    'cubic-bezier(0.23, 1, 0.32, 1)',
        'in-out': 'cubic-bezier(0.77, 0, 0.175, 1)',
        drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      screens: {
        xs: '420px',
      },
    },
  },
  plugins: [],
}
