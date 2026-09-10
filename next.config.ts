import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Releases build into an isolated directory and activate it only after the
  // build has completed successfully. Runtime defaults to the conventional
  // .next directory after activation.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(), payment=(), usb=()" },
        { key: "X-Frame-Options", value: "DENY" },
        // MapLibre needs a blob worker; OSM is the only external map origin.
        // Next.js production runtime currently needs inline bootstrap/style code.
        { key: "Content-Security-Policy", value: "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tile.openstreetmap.org https://t.plnspttrs.net https://www.planespotters.net; connect-src 'self' https://tile.openstreetmap.org; worker-src 'self' blob:; child-src blob:; font-src 'self' data:;" },
      ],
    }];
  },
};
export default nextConfig;
