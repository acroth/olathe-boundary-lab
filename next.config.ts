import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // The map libraries ship modern ESM; let Next compile them for the browser bundle.
  transpilePackages: ['terra-draw', 'terra-draw-maplibre-gl-adapter'],
  async headers() {
    return [
      // Data files are versioned by the pipeline's publish step; cache them at the edge, revalidate in the browser.
      { source: '/data/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800' }] },
      { source: '/fonts/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ];
  },
};
export default config;
