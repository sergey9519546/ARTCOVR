import path from 'path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
import { selectPublicCatalog } from './src/lib/artcovr/catalog-visibility';
import {
  getPrerenderedRoutePaths,
  getRouteMetadata,
  type RouteArtwork,
  type RouteMetadata,
} from './src/lib/artcovr/route-metadata';

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

const publicCatalog = selectPublicCatalog(curatedPublic as RouteArtwork[]);
const discoveryCatalog = (curatedPublic as typeof curatedPublic).map((item) => ({
  ...item,
  genres: getArtworkGenres(item).map(displayGenreLabel),
}));

const PRIVATE_BROWSER_MODULES = [
  '/curated-review.json',
  '/staging-intro.json',
] as const;

function privateCatalogIsolationPlugin() {
  return {
    name: 'artcovr-private-catalog-isolation',
    moduleParsed(info: { id: string }) {
      const normalizedId = info.id.replaceAll('\\', '/').split('?')[0];
      const forbidden = PRIVATE_BROWSER_MODULES.find((suffix) =>
        normalizedId.endsWith(suffix),
      );
      if (forbidden) {
        throw new Error(
          `Private catalog module ${forbidden} entered the public browser build.`,
        );
      }
    },
  };
}

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

const ROUTE_META_PATTERN =
  /<!-- ARTCOVR_ROUTE_META_START -->[\s\S]*?<!-- ARTCOVR_ROUTE_META_END -->/;

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!,
  );
}

function cleanSiteUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    url.pathname = '';
    url.search = '';
    url.hash = '';
    url.username = '';
    url.password = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function absoluteUrl(value: string, siteUrl: string) {
  return new URL(value, `${siteUrl}/`).toString();
}

function renderRouteMetadata(
  metadata: RouteMetadata,
  siteUrl: string,
  indexingDisabled: boolean,
) {
  const canonical = absoluteUrl(metadata.path, siteUrl);
  const imageUrl = absoluteUrl(metadata.image?.url ?? '/og-image.png', siteUrl);
  const imageAlt = metadata.image?.alt ?? 'ARTCOVR curated cover art';
  const robots =
    metadata.index && !indexingDisabled
      ? 'index, follow'
      : 'noindex, nofollow, noarchive';
  const openGraphType = metadata.path.startsWith('/product/') ? 'product' : 'website';

  return `<!-- ARTCOVR_ROUTE_META_START -->
    <title>${escapeHtml(metadata.title)}</title>
    <meta name="description" content="${escapeHtml(metadata.description)}" />
    <meta name="robots" content="${robots}" />
    <meta property="og:title" content="${escapeHtml(metadata.title)}" />
    <meta property="og:description" content="${escapeHtml(metadata.description)}" />
    <meta property="og:type" content="${openGraphType}" />
    <meta property="og:site_name" content="ARTCOVR" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:alt" content="${escapeHtml(imageAlt)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(metadata.title)}" />
    <meta name="twitter:description" content="${escapeHtml(metadata.description)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
    <meta name="twitter:image:alt" content="${escapeHtml(imageAlt)}" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <!-- ARTCOVR_ROUTE_META_END -->`;
}

function routeHtmlFileName(routePath: string) {
  return `${routePath.replace(/^\/+|\/+$/g, '')}/index.html`;
}

function routeMetadataPlugin(
  siteUrl: string,
  indexingDisabled: boolean,
  outputDirectory: string,
) {
  const paths = getPrerenderedRoutePaths(publicCatalog);
  const metadataForPath = (routePath: string) =>
    getRouteMetadata(routePath, publicCatalog, (artwork) =>
      getArtworkGenres(artwork).map(displayGenreLabel),
    );

  return {
    name: 'artcovr-route-metadata',
    transformIndexHtml(
      html: string,
      context: { originalUrl?: string; path: string },
    ) {
      const requestedPath = new URL(
        context.originalUrl ?? context.path,
        'https://artcovr.local',
      ).pathname;
      const routePath = requestedPath === '/index.html' ? '/' : requestedPath;
      return html.replace(
        ROUTE_META_PATTERN,
        renderRouteMetadata(metadataForPath(routePath), siteUrl, indexingDisabled),
      );
    },
    async closeBundle() {
      const indexPath = path.join(outputDirectory, 'index.html');
      const shell = await readFile(indexPath, 'utf8');
      if (!ROUTE_META_PATTERN.test(shell)) {
        throw new Error('The route metadata markers are missing from index.html.');
      }

      for (const routePath of paths) {
        const metadata = metadataForPath(routePath);
        const html = shell.replace(
          ROUTE_META_PATTERN,
          renderRouteMetadata(metadata, siteUrl, indexingDisabled),
        );
        const fileName =
          routePath === '/' ? 'index.html' : routeHtmlFileName(routePath);
        const outputPath = path.resolve(outputDirectory, fileName);
        if (!outputPath.startsWith(`${path.resolve(outputDirectory)}${path.sep}`)) {
          throw new Error(`Refusing to emit route HTML outside the output directory: ${routePath}`);
        }
        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, html);
      }

      const notFoundMetadata = getRouteMetadata('/404', publicCatalog);
      await writeFile(
        path.join(outputDirectory, '404.html'),
        shell.replace(
          ROUTE_META_PATTERN,
          renderRouteMetadata(notFoundMetadata, siteUrl, true),
        ),
      );
    },
  };
}

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, path.resolve(import.meta.dirname), '');
  const discoverySiteUrl = env.VITE_SITE_URL || process.env.VITE_SITE_URL || '';
  const metadataSiteUrl =
    cleanSiteUrl(discoverySiteUrl) || 'https://artcovr.com';
  const indexingDisabled =
    env.ARTCOVR_ALLOW_INDEXING === '0' ||
    env.VITE_ARTCOVR_PRIVATE_STAGING === '1';
  const outputDirectory = path.resolve(import.meta.dirname, 'dist/public');

  return {
    base: basePath,
    plugins: [
      privateCatalogIsolationPlugin(),
      discoveryPlugin(discoverySiteUrl),
      routeMetadataPlugin(metadataSiteUrl, indexingDisabled, outputDirectory),
      react(),
      tailwindcss({ optimize: false }),
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
      outDir: outputDirectory,
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
