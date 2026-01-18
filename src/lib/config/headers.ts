/**
 * Security and Caching Headers for next.config.ts
 */

export const CACHE_HEADERS = [
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
];

export const SECURITY_HEADERS = [
    {
        // Global Security Headers
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
                value: 'strict-origin-when-cross-origin'
            },
            {
                key: 'Permissions-Policy',
                value: 'camera=(), microphone=(), geolocation=(self), payment=(self), usb=(), bluetooth=(), magnetometer=(), gyroscope=(), accelerometer=(self)'
            },
            {
                key: 'Cross-Origin-Opener-Policy',
                value: 'same-origin-allow-popups'
            }
        ],
    }
];

/**
 * Combined headers configuration
 */
export const GLOBAL_HEADERS = [...CACHE_HEADERS, ...SECURITY_HEADERS];
