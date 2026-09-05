import path from 'path';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
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
import {
  renderStaticRoute,
  renderStaticRouteMetadata,
} from './src/lib/artcovr/static-render';

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

const usePreviewProxyHmr = process.env.ARTCOVR_PREVIEW_PROXY === '1';
const apiProxyTarget = process.env.PLAYWRIGHT_API_URL;

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
    'sitemap.xml': buildSitemapXml(publicCatalog, siteUrl),
    'llms.txt': buildLlmsTxt(discoveryCatalog, siteUrl),
    'llms-full.txt': buildLlmsFullTxt(discoveryCatalog, siteUrl),
    'robots.txt': `User-agent: *\nAllow: /\n\nUser-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: ChatGPT-User\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
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
    async writeBundle() {
      for (const fileName of ['sitemap.xml', 'robots.txt']) {
        try {
          await access(path.join(path.resolve(import.meta.dirname, 'dist/public'), fileName));
        } catch {
          throw new Error(`Required discovery file was not emitted: ${fileName}`);
        }
      }

      const sitemap = await readFile(
        path.resolve(import.meta.dirname, 'dist/public/sitemap.xml'),
        'utf8',
      );
      const robots = await readFile(
        path.resolve(import.meta.dirname, 'dist/public/robots.txt'),
        'utf8',
      );
      const rootLocation = `<loc>${escapeXmlForAssertion(`${siteUrl}/`)}</loc>`;
      if (!sitemap.includes(rootLocation)) {
        throw new Error(
          `sitemap.xml does not use the configured canonical origin: expected ${siteUrl}`,
        );
      }
      if (!robots.includes(`Sitemap: ${siteUrl}/sitemap.xml`)) {
        throw new Error('robots.txt does not advertise the canonical sitemap URL.');
      }
    },
  };
}

function escapeXmlForAssertion(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[character]!,
  );
}

const ROUTE_META_PATTERN =
  /<!-- ARTCOVR_ROUTE_META_START -->[\s\S]*?<!-- ARTCOVR_ROUTE_META_END -->/;
const STATIC_CONTENT_PATTERN =
  /<!-- ARTCOVR_STATIC_CONTENT_START -->[\s\S]*?<!-- ARTCOVR_STATIC_CONTENT_END -->/;
const STRUCTURED_DATA_PATTERN =
  /<!-- ARTCOVR_ROUTE_STRUCTURED_DATA_START -->[\s\S]*?<!-- ARTCOVR_ROUTE_STRUCTURED_DATA_END -->/;
const HOME_NOSCRIPT_PATTERN =
  /<!-- ARTCOVR_HOME_NOSCRIPT_START -->[\s\S]*?<!-- ARTCOVR_HOME_NOSCRIPT_END -->/;

function resolveSiteUrl(value: string, productionBuild: boolean) {
  if (!value) {
    if (productionBuild) {
      throw new Error(
        'VITE_SITE_URL is required for production builds. Set it to the canonical HTTPS site origin.',
      );
    }
    return 'https://artcovr.local';
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('VITE_SITE_URL must use http or https.');
    }
    if (productionBuild && url.protocol !== 'https:') {
      throw new Error('VITE_SITE_URL must use HTTPS for production builds.');
    }
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== '' && url.pathname !== '/')
    ) {
      throw new Error(
        'VITE_SITE_URL must be an origin only, without credentials, a path, a query, or a hash.',
      );
    }
    return url.origin;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('VITE_SITE_URL')) {
      throw error;
    }
    throw new Error(
      `Invalid VITE_SITE_URL "${value}". Set it to the canonical site origin, for example https://artcovr.com.`,
    );
  }
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
  const routeDocument = (html: string, routePath: string) => {
    const metadata = metadataForPath(routePath);
    const rendered = renderStaticRoute({
      artworks: publicCatalog,
      siteUrl,
      metadata,
      getGenres: (artwork) => getArtworkGenres(artwork).map(displayGenreLabel),
    });
    // The homepage has a React-owned preloader. Any static body content here
    // would paint before React mounts and flash as a false first frame.
    const staticBody = routePath === "/" ? "" : rendered.bodyHtml;
    return html
      .replace(
        ROUTE_META_PATTERN,
        renderStaticRouteMetadata(metadata, siteUrl, indexingDisabled),
      )
      .replace(STATIC_CONTENT_PATTERN, staticBody)
      .replace(STRUCTURED_DATA_PATTERN, rendered.structuredDataHtml)
      .replace(
        HOME_NOSCRIPT_PATTERN,
        routePath === "/"
          ? `<!-- ARTCOVR_HOME_NOSCRIPT_START -->\n    <noscript>\n      <h1>Curated cover art for music releases and artists.</h1>\n      <p>ARTCOVR is a curated storefront for distinctive square cover art with commercial licensing and prompt-based editing.</p>\n      <p><a href="/archive">Browse the cover art archive</a> · <a href="/license">Read the commercial license</a></p>\n    </noscript>\n    <!-- ARTCOVR_HOME_NOSCRIPT_END -->`
          : "",
      );
  };

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
        renderStaticRouteMetadata(
          metadataForPath(routePath),
          siteUrl,
          indexingDisabled,
        ),
      );
    },
    async closeBundle() {
      const indexPath = path.join(outputDirectory, 'index.html');
      const shell = await readFile(indexPath, 'utf8');
      if (!ROUTE_META_PATTERN.test(shell)) {
        throw new Error('The route metadata markers are missing from index.html.');
      }
      if (!STATIC_CONTENT_PATTERN.test(shell)) {
        throw new Error('The static content markers are missing from index.html.');
      }
      if (!STRUCTURED_DATA_PATTERN.test(shell)) {
        throw new Error('The structured data markers are missing from index.html.');
      }
      if (!HOME_NOSCRIPT_PATTERN.test(shell)) {
        throw new Error('The homepage noscript marker is missing from index.html.');
      }

      const homepage = routeDocument(shell, '/');
      if (/<main\b/.test(homepage)) {
        throw new Error(
          'Homepage static content would paint before the React preloader. Keep the homepage root empty.',
        );
      }

      for (const routePath of paths) {
        const html = routeDocument(shell, routePath);
        const fileName =
          routePath === '/' ? 'index.html' : routeHtmlFileName(routePath);
        const outputPath = path.resolve(outputDirectory, fileName);
        if (!outputPath.startsWith(`${path.resolve(outputDirectory)}${path.sep}`)) {
          throw new Error(`Refusing to emit route HTML outside the output directory: ${routePath}`);
        }
        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, html);
      }

      await writeFile(
        path.join(outputDirectory, '404.html'),
        routeDocument(shell, '/404').replace(
          `content="index, follow"`,
          `content="noindex, nofollow, noarchive"`,
        ),
      );
    },
  };
}

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, path.resolve(import.meta.dirname), '');
  const configuredSiteUrl = env.VITE_SITE_URL || process.env.VITE_SITE_URL || '';
  const metadataSiteUrl = resolveSiteUrl(configuredSiteUrl, mode === 'production');
  const indexingDisabled =
    env.ARTCOVR_ALLOW_INDEXING === '0' ||
    env.VITE_ARTCOVR_PRIVATE_STAGING === '1';
  const outputDirectory = path.resolve(import.meta.dirname, 'dist/public');

  return {
    base: basePath,
    plugins: [
      privateCatalogIsolationPlugin(),
      discoveryPlugin(metadataSiteUrl),
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
      rollupOptions: {
        output: {
          // Keep the homepage's required motion and auth runtimes cacheable
          // independently from its preloader/catalog entry. Route-only code
          // is split at the lazy imports in App.tsx; these named chunks keep
          // the remaining homepage entry below Vite's warning threshold
          // without delaying any part of the existing homepage journey.
          manualChunks: {
            clerk: ['@clerk/react', '@clerk/themes'],
            motion: ['gsap', 'lenis'],
          },
        },
      },
    },
    server: {
      port,
      strictPort: true,
      host: '0.0.0.0',
      allowedHosts: true,
      ...(apiProxyTarget
        ? {
            proxy: {
              '/api': {
                target: apiProxyTarget,
                changeOrigin: false,
              },
            },
          }
        : {}),
      ...(usePreviewProxyHmr ? { hmr: { clientPort: 80 } } : {}),
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
