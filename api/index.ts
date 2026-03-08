/**
 * Single Vercel serverless handler for ALL /api/* routes.
 * Vercel rewrites /api/signals/live etc. to /api?__path=/signals/live&... so we restore req.url and pass to Express.
 */
import app from "./server";

export default function handler(req: import("http").IncomingMessage, res: import("http").ServerResponse): void {
  let pathAndQuery = req.url || "/";
  try {
    if (pathAndQuery.startsWith("http")) {
      const u = new URL(pathAndQuery);
      pathAndQuery = u.pathname + (u.search || "");
    }
  } catch {
    // keep as-is
  }
  const parsed = new URL(pathAndQuery, "http://localhost");
  const originalPath = parsed.searchParams.get("__path");
  if (originalPath != null && originalPath !== "") {
    parsed.searchParams.delete("__path");
    const q = parsed.searchParams.toString();
    (req as { url?: string }).url = "/api" + originalPath + (q ? "?" + q : "");
  } else if (!pathAndQuery.startsWith("/api")) {
    const path = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
    (req as { url?: string }).url = `/api${path}`;
  }
  app(req, res);
}
