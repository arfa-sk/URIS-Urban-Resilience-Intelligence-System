/**
 * Copies server.ts into api/server.ts so Vercel bundles it with the serverless function.
 * Replaces "./src/types" with "../src/types" so imports resolve from api/ folder.
 * Run before build (e.g. npm run build).
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "server.ts");
const outPath = path.join(root, "api", "server.ts");

let content = fs.readFileSync(serverPath, "utf8");
content = content.replace(/from\s+["']\.\/src\/types["']/g, 'from "../src/types"');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, content);
console.log("Wrote api/server.ts for Vercel");
