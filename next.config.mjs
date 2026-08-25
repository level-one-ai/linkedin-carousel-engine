/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  /**
   * playwright-core has to be copied whole into the standalone build.
   *
   * Next traces the files a route imports and copies only those. That works for
   * ordinary modules, but playwright-core reads `browsers.json` at runtime from
   * inside its own bundled code, which the tracer cannot see — so the standalone
   * output ships 84 of its 111 files and omits the one it needs. The failure is
   * not at build time: `next build` succeeds, the image builds, the site serves
   * pages, and then every route that touches Chromium throws
   * "Cannot find module .../playwright-core/browsers.json" and returns 500.
   *
   * That is /api/health, /api/generate and /api/posts/[id]/image — in other
   * words, all carousel rendering. Forcing the whole package in costs 14MB.
   */
  outputFileTracingIncludes: {
    '/api/**': ['./node_modules/playwright-core/**'],
  },

  turbopack: {
    // react-pdf pulls in the optional Node-only "canvas" package. Aliasing it to
    // an empty module keeps it out of the browser bundle.
    resolveAlias: { canvas: './empty-module.ts' },
  },
};

export default nextConfig;
