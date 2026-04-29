import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { initRAGCollection } from "../rag";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Initialize RAG collection (non-fatal)
  try {
    await initRAGCollection();
  } catch (err) {
    console.warn('RAG initialization failed; continuing without RAG:', err);
  }

  // CORS: allow only an explicit whitelist (ALLOWED_ORIGINS env var, comma-
  // separated). Localhost dev origins are allowed by default. Reflecting any
  // Origin while sending credentials is a CSRF foothold the moment auth is
  // ever added — keep it tight even though favorites/notes are local-only
  // today.
  const DEFAULT_DEV_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:8081",
    "http://localhost:19006", // Expo web
    "http://localhost:19000", // Expo Go LAN
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8081",
  ];
  const envOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean);
  const allowedOrigins = new Set([...DEFAULT_DEV_ORIGINS, ...envOrigins]);

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    // Note: when origin is missing or not whitelisted, no ACAO header is
    // sent — the browser will block the response. Same-origin and non-
    // browser clients (curl, server-to-server) work regardless.
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      // Only succeed preflight if the origin is whitelisted — otherwise the
      // browser sees a missing ACAO and blocks the actual request anyway.
      res.sendStatus(origin && !allowedOrigins.has(origin) ? 403 : 204);
      return;
    }
    next();
  });

  // Body size limits: drop from 50MB (DoS surface) to 1MB for JSON and 5MB
  // for url-encoded forms, which covers the photo-upload endpoint while
  // still cutting >90% off the worst case. Endpoints that legitimately need
  // larger bodies should mount their own express.json() with a higher cap.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "5mb", extended: true }));

  // Authentication routes are omitted for this deployment (no auth required)
  // registerOAuthRoutes(app);

  // Start background queue processor
  try {
    const { startQueueProcessor, getReindexQueue } = await import('../rag-bull');
    await startQueueProcessor();
    console.log('RAG queue processor started');

    // Initialize monitoring (Bull Board + /metrics)
    const { initRagMonitor } = await import('../rag-monitor');
    await initRagMonitor(app);

    // Admin HTTP routes
    try {
      const { adminAuthFallback, pushMetricsHandler } = await import('../admin-http');
      app.post('/admin/push-metrics', express.json(), adminAuthFallback, pushMetricsHandler);
      console.log('Admin push metrics endpoint mounted at POST /admin/push-metrics');
    } catch (err) {
      console.warn('Could not mount admin HTTP routes:', err);
    }
  } catch (err) {
    console.warn('Could not start RAG queue processor or monitor:', err);
  }

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);
