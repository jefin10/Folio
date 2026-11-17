import type { NextConfig } from 'next';

// Fully static site: every page is client-rendered against the Supabase APIs,
// so the build is plain files served by the Caddy gateway (no Node server).
const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ['@folio/core', '@folio/api'],
  reactStrictMode: true,
  poweredByHeader: false,
};

export default config;
