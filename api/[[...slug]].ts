/**
 * Vercel serverless entry: all /api/* requests are handled by the Express app.
 * VERCEL=1 is set by Vercel, so server.ts does not call startServer() when loaded here.
 */
import app from "../server";
export default app;
