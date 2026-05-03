import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Brand palette mirrors the Tailwind tokens in the web app
// (apps/web-demo/tailwind.config.ts → theme.extend.colors). Kept hand-typed
// rather than imported so the docs site doesn't pull in the app's build.
const NOESIS_PALETTE = {
  cloudboneWhite: '#F4EFE6',
  slateGrey: '#475569',
  neuralCopper: '#B87333',
  irisBloom: '#9F86C0',
  glacialCyan: '#B8DCDD',
};

export default defineConfig({
  site: 'https://noesis-docs.vercel.app',
  integrations: [
    starlight({
      title: 'Noesis',
      description:
        'Adaptive learning infrastructure: SDK, server, and pilot product. Open source under MIT.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/ChrisTelles152/noesis-core',
        },
      ],
      // Brand colors applied via custom CSS — see src/styles/brand.css.
      customCss: ['./src/styles/brand.css'],
      sidebar: [
        {
          label: 'Get started',
          items: [
            { label: 'What is Noesis?', slug: 'overview' },
            { label: 'Quickstart', slug: 'quickstart' },
          ],
        },
        {
          label: 'Core SDK',
          items: [
            { label: 'Engine model', slug: 'core/engine' },
            { label: 'Determinism contract', slug: 'core/determinism' },
            { label: 'Canonical learning loop', slug: 'core/canonical-loop' },
          ],
        },
        {
          label: 'Server API',
          items: [{ label: 'API reference', slug: 'api/reference' }],
        },
        {
          label: 'Pilot product (Brazil STEM)',
          items: [
            { label: 'pt-BR math content pack', slug: 'pilot/content-pack' },
            { label: 'Diagnostic + path + canonical loop', slug: 'pilot/learner-flow' },
            { label: 'Mentor + authoring admin', slug: 'pilot/admin-surfaces' },
          ],
        },
      ],
    }),
  ],
  // Make the brand palette available as Astro/Starlight global so future
  // shortcodes / components can reference it without re-typing hexes.
  vite: {
    define: {
      __NOESIS_PALETTE__: JSON.stringify(NOESIS_PALETTE),
    },
  },
});
