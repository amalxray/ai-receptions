/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    deviceSizes: [400, 800, 1200, 1600, 1920],
    imageSizes: [32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/clinic-public-media/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/images/supabase/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
