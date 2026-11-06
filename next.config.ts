import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Uploads are capped at 1 MB and live saves at SAVE_B64_MAX_CHARS by our own checks; leave
    // room for overhead so oversize input gets our message instead of a framework error.
    serverActions: { bodySizeLimit: '2mb' },
  },
}

export default nextConfig
