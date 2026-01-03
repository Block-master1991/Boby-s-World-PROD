
import type { NextConfig } from 'next';
import withBundleAnalyzer from '@next/bundle-analyzer';

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
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
  async headers() {
    return [
      {
        // Cache game textures and models for long term
        source: '/textures/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable', // 1 year cache
          },
        ],
      },
      {
        source: '/models/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable', // 1 year cache
          },
        ],
      },
      {
        // Cache libs for long term (WebGL, Draco, etc.)
        source: '/libs/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable', // 1 year cache
          },
        ],
      },
      {
        // Cache audio files
        source: '/audio/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable', // 1 year cache
          },
        ],
      },
      {
        // Security Headers
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          // Slowloris Protection: Connect Timeout
          {
            key: 'Keep-Alive',
            value: 'timeout=5, max=1000'
          },
          {
            key: 'Connection',
            value: 'keep-alive'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self), payment=(self), usb=(), bluetooth=(), magnetometer=(), gyroscope=(), accelerometer=(self)'
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups'
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://challenges.cloudflare.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' https: data: blob:",
              "media-src 'self' blob:",
              "connect-src 'self' https: wss: blob: data:",
              "frame-src 'self' https://www.google.com/recaptcha/ https://challenges.cloudflare.com",
              "worker-src 'self' blob: data:",
              "child-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
              "upgrade-insecure-requests"
            ].join('; ')
          }
        ],
      }
    ];
  },

  // Performance optimizations for webpack
  webpack: (config, { isServer, dev }) => {
    // Add a rule to handle JSON files properly
    config.module.rules.push({
      test: /\.json$/,
      use: 'json-loader',
      type: 'javascript/auto',
    });

    const pinoAliases = !isServer ? {
      'pino': 'pino/browser',
      'pino-pretty': 'pino-pretty/lib/browser',
      'sonic-boom': false,
      'thread-stream': false,
    } : {};

    config.resolve.alias = {
      ...config.resolve.alias,
      ...pinoAliases,
      'fastbench': false,
      'pino-elasticsearch': false,
      'tap': false,
      'tape': false,
      'desm': false,
      'why-is-node-running': false,
    };

    config.module.rules.push({
      test: /\.(glsl|vs|fs|vert|frag)$/,
      use: ['raw-loader'],
    });

    // Performance optimizations for client-side bundles
    if (!isServer) {
      // Optimize chunks for better code splitting
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            // Three.js core chunk
            three: {
              test: /[\\/]node_modules[\\/]three[\\/]/,
              name: 'three-core',
              priority: 20,
              enforce: true,
            },
            // React and related libraries
            framework: {
              test: /[\\/]node_modules[\\/](react|react-dom|next|@radix-ui)[\\/]/,
              name: 'framework',
              priority: 15,
            },
            // Solana and crypto libraries
            crypto: {
              test: /[\\/]node_modules[\\/](@solana|tweetnacl)[\\/]/,
              name: 'crypto',
              priority: 10,
            },
            // Firebase
            firebase: {
              test: /[\\/]node_modules[\\/]firebase[\\/]/,
              name: 'firebase',
              priority: 10,
            },
            // Other vendor libraries
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendor',
              priority: 5,
            },
          },
        },
        // Enable more aggressive optimizations in production
        ...(dev ? {} : {
          moduleIds: 'deterministic',
          chunkIds: 'deterministic',
          minimize: true,
          minimizer: [
            ...config.optimization.minimizer,
          ],
        }),
      };

      // Add performance hints
      config.performance = {
        hints: dev ? false : 'warning',
        maxEntrypointSize: 512000, // 512KB
        maxAssetSize: 512000, // 512KB
      };
    }

    return config;
  },
};

export default process.env.ANALYZE === 'true' ? withBundleAnalyzer({
  enabled: true,
  openAnalyzer: false,
})(nextConfig) : nextConfig;
