/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
    serverComponentsExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  },
};

module.exports = nextConfig;
