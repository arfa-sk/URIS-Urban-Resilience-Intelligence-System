/**
 * Vercel serverless entry: all /api/* requests are handled by the Express app.
 * VERCEL=1 is set by Vercel, so server.ts does not call startServer() when loaded here.
 * Normalize path so Express routes match (Vercel may pass path with or without /api, or full URL).
 */
import app from "../server";

export default function handler(req: import("http").IncomingMessage, res: import("http").ServerResponse): void {
  let pathAndQuery = req.url || "/";
  try {
    if (pathAndQuery.startsWith("http")) {
      const u = new URL(pathAndQuery);
      pathAndQuery = u.pathname + (u.search || "");
    }
  } catch {
    // keep pathAndQuery as-is
  }
  if (!pathAndQuery.startsWith("/api")) {
    const path = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
    (req as { url?: string }).url = `/api${path}`;
  }
  app(req, res);
}
