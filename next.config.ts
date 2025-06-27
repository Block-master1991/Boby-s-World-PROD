
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
  ...(process.env.NODE_ENV === 'development' && {
  experimental: {
    allowedDevOrigins: ['https://divine-bedbug-valued.ngrok-free.app'],
  },
}), // Only add this in development mode
}



export default nextConfig;
