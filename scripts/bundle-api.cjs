/**
 * Bundle server.ts (Express app) into api/handler.js so the Vercel function
 * has a single file with no separate module resolution.
 */
const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "api");
fs.mkdirSync(outDir, { recursive: true });

esbuild
  .build({
    entryPoints: [path.join(root, "server.ts")],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "esm",
    outfile: path.join(outDir, "handler.js"),
    packages: "external",
  })
  .then(() => console.log("Bundled api/handler.js"))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
