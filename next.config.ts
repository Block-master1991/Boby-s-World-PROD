
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  ...(process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEV_ORIGIN && {
  experimental: {
    allowedDevOrigins: [process.env.NEXT_PUBLIC_DEV_ORIGIN],
  },
}), // Only add this in development mode if NEXT_PUBLIC_DEV_ORIGIN is set
  webpack: (config, { isServer }) => {
    // Add a rule to handle JSON files properly
    config.module.rules.push({
      test: /\.json$/,
      use: 'json-loader',
      type: 'javascript/auto',
    });

    config.module.rules.push({
      test: /\.(glsl|vs|fs|vert|frag)$/,
      use: ['raw-loader'],
    });

    return config;
  },
};

export default nextConfig;
