/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      // PDF.js uses Canvas only for page rendering/OCR. This endpoint
      // extracts text coordinates exclusively; do not bundle native canvas.
      config.resolve.alias = { ...config.resolve.alias, canvas: false }
    }
    return config
  },
}

module.exports = nextConfig
