const apiOrigin = process.env.MODELCOMPARE_API_ORIGIN || 'http://127.0.0.1:3456';

const shareOrigin = process.env.MODELCOMPARE_SHARE_ORIGIN || 'http://127.0.0.1:3457';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Image generation can take up to 120 seconds at the provider.
  experimental: { proxyTimeout: 150_000 },
  async rewrites() {
    return [
      { source: '/api/share-image', destination: `${shareOrigin}/share-image` },
      { source: '/modelcompare/api/share-image', destination: `${shareOrigin}/share-image` },
      { source: '/api/:path*', destination: `${apiOrigin}/:path*` },
      { source: '/modelcompare/api/:path*', destination: `${apiOrigin}/:path*` },
    ];
  },
};

export default nextConfig;
