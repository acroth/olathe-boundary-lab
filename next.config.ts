import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // The map libraries ship modern ESM; let Next compile them for the browser bundle.
  transpilePackages: ['terra-draw', 'terra-draw-maplibre-gl-adapter'],
  async headers() {
    return [
      // Data files keep the same names between releases: browsers must check for a newer copy before using one.
      { source: '/data/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate, s-maxage=86400' }] },
      { source: '/fonts/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ];
  },
};
export default config;
