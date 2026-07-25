/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  },
  serverRuntimeConfig: {
    maxDuration: 60,
  },
};

module.exports = nextConfig;
