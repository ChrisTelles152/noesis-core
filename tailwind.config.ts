import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: ['./apps/web-demo/index.html', './apps/web-demo/src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        // ──────────────────────────────────────────────────────────────────
        // Brand palette (INTENTION.md "sacred-tech" — cognitive minimalism,
        // calm, timeless, non-exploitative).
        //
        // The five locked names from INTENTION.md are exposed as named
        // Tailwind tokens so application code references the brand by name
        // (e.g. `bg-neural-copper`) rather than by hex. Hex values below are
        // initial interpretations — they are the single source of truth and
        // are easy to update when the final brand-spec hex values are
        // delivered. The shadcn CSS variables further down route to these
        // tokens via `index.css`, so updating the hex here flows through to
        // every shadcn primitive too.
        //
        // Palette intent:
        //   cloudbone-white — base canvas; like aged ivory (light + warmth)
        //   slate-grey      — text + UI chrome (cool charcoal)
        //   neural-copper   — primary accent (burnished, earthy, focused)
        //   iris-bloom      — secondary accent (soft lavender, contemplative)
        //   glacial-cyan    — tertiary accent (icy, sparing, "cool moments")
        // ──────────────────────────────────────────────────────────────────
        'cloudbone-white': '#F4EFE6',
        'slate-grey': '#475569',
        'neural-copper': '#B87333',
        'iris-bloom': '#9F86C0',
        'glacial-cyan': '#B8DCDD',

        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate'), require('@tailwindcss/typography')],
} satisfies Config;
