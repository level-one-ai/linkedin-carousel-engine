/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  turbopack: {
    // react-pdf pulls in the optional Node-only "canvas" package. Aliasing it to
    // an empty module keeps it out of the browser bundle.
    resolveAlias: { canvas: './empty-module.ts' },
  },
};

export default nextConfig;
