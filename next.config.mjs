/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El SDK de Anthropic corre en el runtime de Node, no en Edge.
  serverExternalPackages: ['@anthropic-ai/sdk'],
};

export default nextConfig;
