/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep @pgsql/parser out of the server bundle so libpg-query.wasm resolves
  // from node_modules via __dirname instead of a rewritten /ROOT/ path.
  serverExternalPackages: ['@pgsql/parser'],
  outputFileTracingIncludes: {
    '/*': ['./node_modules/@pgsql/parser/wasm/**/*.wasm'],
  },
}

module.exports = nextConfig
