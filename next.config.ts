import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a traced runtime bundle so validated CI artifacts can run without
  // coupling the server process to the full development dependency tree.
  output: "standalone",
  // Releases build into an isolated directory and activate it only after the
  // build has completed successfully. Runtime defaults to the conventional
  // .next directory after activation.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The repository maintains its own AGENTS.md instructions. Next.js must not
  // mutate that tracked file when a development server detects an AI agent.
  agentRules: false,
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  // CI sets this only after the same SHA has passed the explicit typecheck
  // job. Local/manual builds retain Next's independent safety check.
  typescript: {
    ignoreBuildErrors: process.env.AIRRADAR_SKIP_BUILD_TYPECHECK === "1",
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), geolocation=(self), microphone=(), payment=(), usb=()" },
        { key: "X-Frame-Options", value: "DENY" },
        // MapLibre needs a blob worker; allow only configured basemap, satellite and DEM tile origins.
        // Next.js production runtime currently needs inline bootstrap/style code.
        { key: "Content-Security-Policy", value: "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tile.openstreetmap.org https://tiles.openfreemap.org https://tiles.maps.eox.at https://tiles.mapterhorn.com https://t.plnspttrs.net https://www.planespotters.net; connect-src 'self' data: https://tile.openstreetmap.org https://tiles.openfreemap.org https://tiles.maps.eox.at https://tiles.mapterhorn.com; worker-src 'self' blob:; child-src blob:; frame-src https://www.youtube-nocookie.com; font-src 'self' data:;" },
      ],
    }];
  },
};
export default nextConfig;
