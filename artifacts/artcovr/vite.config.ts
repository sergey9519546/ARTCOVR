import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';
import curatedPublic from './src/lib/artcovr/curated-public.json' with { type: 'json' };
import {
  buildLlmsFullTxt,
  buildLlmsTxt,
  buildSitemapXml,
} from './src/lib/artcovr/discovery';
import { displayGenreLabel, getArtworkGenres } from './src/lib/artcovr/genre-index';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

const publicCatalog = curatedPublic as Parameters<typeof buildSitemapXml>[0];
const discoveryCatalog = (curatedPublic as typeof curatedPublic).map((item) => ({
  ...item,
  genres: getArtworkGenres(item).map(displayGenreLabel),
}));

function discoveryPlugin(siteUrl: string) {
  const files = {
    ...(siteUrl ? { 'sitemap.xml': buildSitemapXml(publicCatalog, siteUrl) } : {}),
    'llms.txt': buildLlmsTxt(discoveryCatalog, siteUrl),
    'llms-full.txt': buildLlmsFullTxt(discoveryCatalog, siteUrl),
    'robots.txt': `User-agent: *\nAllow: /\n${siteUrl ? `Sitemap: ${siteUrl}/sitemap.xml\n` : ''}`,
  };

  return {
    name: 'artcovr-discovery-files',
    configureServer(server: { middlewares: { use: (handler: Function) => void } }) {
      server.middlewares.use((request: any, response: any, next: Function) => {
        const pathname = String(request.url || '').split('?')[0].replace(/^\/+/, '');
        const source = files[pathname as keyof typeof files];
        if (!source) {
          next();
          return;
        }
        response.statusCode = 200;
        response.setHeader(
          'Content-Type',
          pathname === 'sitemap.xml' ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8',
        );
        response.end(source);
      });
    },
    generateBundle(this: { emitFile: (file: { type: 'asset'; fileName: string; source: string }) => void }) {
      for (const [fileName, source] of Object.entries(files)) {
        this.emitFile({ type: 'asset', fileName, source });
      }
    },
  };
}

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, path.resolve(import.meta.dirname), '');
  const discoverySiteUrl = env.VITE_SITE_URL || process.env.VITE_SITE_URL || '';

  return {
    base: basePath,
    plugins: [
      discoveryPlugin(discoverySiteUrl),
      react(),
      tailwindcss(),
      runtimeErrorOverlay(),
      ...(process.env.NODE_ENV !== 'production' &&
      process.env.REPL_ID !== undefined
        ? [
            await import('@replit/vite-plugin-cartographer').then((m) =>
              m.cartographer({
                root: path.resolve(import.meta.dirname, '..'),
              }),
            ),
            await import('@replit/vite-plugin-dev-banner').then((m) =>
              m.devBanner(),
            ),
          ]
        : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
        '@assets': path.resolve(
          import.meta.dirname,
          '..',
          '..',
          'attached_assets',
        ),
      },
      dedupe: ['react', 'react-dom'],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, 'dist/public'),
      emptyOutDir: true,
    },
    server: {
      port,
      strictPort: true,
      host: '0.0.0.0',
      allowedHosts: true,
      fs: {
        strict: true,
      },
    },
    preview: {
      port,
      host: '0.0.0.0',
      allowedHosts: true,
    },
  };
});
