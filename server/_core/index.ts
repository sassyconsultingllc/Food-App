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

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

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
