import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      new URL("https://res.cloudinary.com/fahmialfareza97/image/upload/**"),
    ],
  },
};

export default nextConfig;
