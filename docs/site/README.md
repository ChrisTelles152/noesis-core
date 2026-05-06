# Noesis docs site

Astro Starlight site at `docs/site/`. Sourced from existing repo
content (`packages/core/README.md`, `docs/API_REFERENCE.md`,
`docs/architecture/*`) plus pilot-product overviews.

## Local development

```bash
cd docs/site
npm install
npm run dev
# → http://localhost:4321
```

## Build

```bash
cd docs/site
npm run build
# → docs/site/dist/
```

## Why a separate `node_modules`

`docs/site/` deliberately sits **outside** the root npm workspaces
(`packages/*`, `apps/*`). Astro pulls in a few hundred MB of build
dependencies that the engine, server, and web-demo never need. Keeping
it isolated means a `npm ci` at the repo root stays fast.

## Deploying to Vercel

`vercel.json` at the repo root wires:

```json
{
  "buildCommand": "cd docs/site && npm install && npm run build",
  "outputDirectory": "docs/site/dist",
  "framework": "astro"
}
```

The first deploy needs you to create the project on
[vercel.com](https://vercel.com):

1. Import the GitHub repo.
2. Vercel reads `vercel.json` and uses Astro defaults for the rest.
3. Set production branch to `main`; previews on every PR.
4. After deploy, update `astro.config.mjs` `site:` to the production
   URL Vercel assigns.

No environment variables are required — the docs are static.
