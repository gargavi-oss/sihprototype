/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:5050";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/:path*`
      },
    ];
  },
  devIndicators: false
};

export default nextConfig;
