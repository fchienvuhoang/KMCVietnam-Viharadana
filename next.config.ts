import type { NextConfig } from "next";
import { realpathSync } from "node:fs";
import { relative } from "node:path";

// Trace the real file: pnpm package directories are symlinks.
const pdfWorkerPath = relative(process.cwd(), realpathSync("node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"));

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/import": [pdfWorkerPath],
  },
  async headers() {
    return [
      {
        source: "/bao-cao/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
