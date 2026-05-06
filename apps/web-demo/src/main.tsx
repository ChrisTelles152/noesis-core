import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './lib/i18n';
import { ThemeProvider } from 'next-themes';
import faviconUrl from '@/assets/spiral-eye.svg';

// Single source of truth for the spiral-eye logo: src/assets/spiral-eye.svg.
// Vite hashes the asset on build; we set the favicon at boot so prod builds
// and dev mode both work without duplicating the file into public/.
const link = document.createElement('link');
link.rel = 'icon';
link.type = 'image/svg+xml';
link.href = faviconUrl;
document.head.appendChild(link);

if (typeof document !== 'undefined' && !document.title) {
  document.title = 'Noesis';
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in document');
}
createRoot(rootElement).render(
  <ThemeProvider attribute="class">
    <App />
  </ThemeProvider>
);
