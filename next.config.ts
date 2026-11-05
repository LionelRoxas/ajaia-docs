import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Uploads are capped at 1 MB by our own validation; leave room for multipart overhead
    // so oversize files get our message instead of a framework error.
    serverActions: { bodySizeLimit: '2mb' },
  },
}

export default nextConfig
