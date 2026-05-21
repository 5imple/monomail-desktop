/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}'
  ],
  safelist: ['text-md', 'bg-blue-500', 'text-accent', 'text-blue-600', 'p-3', 'p-4'],
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px'
      }
    },
    extend: {
      screens: {
        xxs: '300px', // min-width
        xs: '540px' // min-width
      },
      fontFamily: {
        // Inter for body + headings (Newton's primary typeface).
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif'
        ],
        // IBM Plex Mono for tracked uppercase labels (FROM/TO/SUBJECT,
        // date dividers, kbd badges, file sizes, version info, timestamps).
        // Components opt in via the `font-mono` utility.
        mono: [
          'IBM Plex Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'Liberation Mono',
          'monospace'
        ]
      },
      transitionTimingFunction: {
        'bouncy-in-out': 'cubic-bezier(.47,1.14,.41,1)'
      },
      animationTimingFunction: {
        'bouncy-in-out': 'cubic-bezier(.47,1.14,.41,1)'
      },
      transitionDuration: {
        400: '400ms',
        1200: '1200ms',
        2000: '2000ms',
        3000: '3000ms',
        4000: '4000ms',
        5000: '5000ms',
        6000: '6000ms'
      },
      ringOffsetWidth: {
        '-1': '-1px',
        '-2': '-2px',
        '-4': '-4px',
        '-8': '-8px'
      },
      outlineOffset: {
        '-1': '-1px',
        '-2': '-2px',
        '-4': '-4px',
        '-8': '-8px'
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          gradient: 'var(--primary-gradient)'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
          gradient: 'var(--secondary-gradient)'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
          high: 'hsl(var(--muted-high))',
          low: 'hsl(var(--muted-low))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        'secondary-accent': {
          DEFAULT: 'hsl(var(--secondary-accent))',
          foreground: 'hsl(var(--secondary-accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))'
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))'
        }
      },
      borderRadius: {
        xl: 'calc(var(--radius) + 4px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        default: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        },
        'collapsible-down': {
          from: { height: '0', opacity: '0' },
          to: { height: 'var(--radix-collapsible-content-height)', opacity: '1' }
        },
        'collapsible-up': {
          from: { height: 'var(--radix-collapsible-content-height)', opacity: '1' },
          to: { height: '0', opacity: '0' }
        },
        blink: {
          '0%, 100%': { borderColor: 'transparent' },
          '50%': { borderColor: '#fff' }
        },
        tilt: {
          '0%, 50%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(1.5deg)' },
          '75%': { transform: 'rotate(-1.5deg)' }
        },
        'gradient-flow': {
          '0%': {
            'background-size': '200% 200%',
            'background-position': '0% 50%'
            // transform: 'rotate(0deg) scale(1)'
          },
          '25%': {
            'background-size': '200% 200%',
            'background-position': '50% 0%'
            // transform: 'rotate(0.5deg)'
          },
          '50%': {
            'background-size': '200% 200%',
            'background-position': '100% 50%'
          },
          '75%': {
            'background-size': '200% 200%',
            'background-position': '150% 100%'
            // transform: 'rotate(-0.5deg)'
          },
          '100%': {
            'background-size': '200% 200%',
            'background-position': '200% 50%'
          }
        }
      },
      animation: {
        tilt: 'tilt 3s linear infinite',
        'accordion-down': 'accordion-down 0.2s ease-in-out',
        'accordion-up': 'accordion-up 0.2s ease-in-out',
        'collapsible-down': 'collapsible-down 0.2s ease-in-out',
        'collapsible-up': 'collapsible-up 0.2s ease-in-out', // ease-out
        blink: 'blink 1s step-end infinite',
        'gradient-flow': 'gradient-flow 6s linear infinite'
      },
      boxShadow: {
        '3xl': '0 12px 80px -15px rgba(0, 0, 0, 0.5)',
        '4xl': '0 12px 100px -15px rgba(0, 0, 0, 0.6)',
        '5xl': '0 12px 2000px -15px rgba(0, 0, 0, 0.4)'
      },
      backgroundImage: {
        'gradient-multi': 'linear-gradient(to right, #ec4899, #8b5cf6, #06b6d4, #ec4899)'
      }
    }
  },
  plugins: [
    require('tailwindcss-animate', function ({ addUtilities }) {
      const newUtilities = {
        '.clip-squircle': {
          'clip-path': 'url(#squircleClip)'
        }
      };
      addUtilities(newUtilities);
    }),
    require('@tailwindcss/typography')
  ]
};
