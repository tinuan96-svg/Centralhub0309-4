/** @type {import('next').NextConfig} */
const isStaticExport = process.env.NEXT_OUTPUT?.trim() === 'export';

const nextConfig = {
  output: isStaticExport ? 'export' : undefined,
  images: {
    // Capacitor/static export cannot use the Next image optimiser. Netlify web
    // can, so do not disable optimisation globally.
    unoptimized: isStaticExport,
  },
  reactStrictMode: false,
  typescript: {
    // CI already type-checks before building; production should fail closed too.
    ignoreBuildErrors: false,
  },
  productionBrowserSourceMaps: false,
};

module.exports = nextConfig;
