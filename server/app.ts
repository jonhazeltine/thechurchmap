import { type Server } from "node:http";

import express, {
  type Express,
  type Request,
  Response,
  NextFunction,
} from "express";
import { createClient } from "@supabase/supabase-js";

import { registerRoutes } from "./routes";
import { warmCDCCache } from "./services/cache-warming";
import { initializeScheduledTasks } from "./services/scheduled-tasks";

async function markRunningImportsAsInterrupted(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.log('[Shutdown] Supabase not configured, skipping import cleanup');
    return;
  }
  
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase
      .from('import_jobs')
      .update({ status: 'interrupted' })
      .eq('status', 'running')
      .select('id');
    
    if (error) {
      console.error('[Shutdown] Failed to mark imports as interrupted:', error.message);
    } else if (data && data.length > 0) {
      console.log(`[Shutdown] Marked ${data.length} running import(s) as interrupted`);
    }
  } catch (err) {
    console.error('[Shutdown] Error during import cleanup:', err);
  }
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  limit: '50mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ limit: '50mb', extended: false }));

// Static file download endpoint (before other routes to bypass Vite)
app.get("/download/all-churches.mbtiles", (req, res) => {
  const filePath = process.cwd() + '/scripts/all-churches.mbtiles';
  res.download(filePath, 'all-churches.mbtiles');
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

export default async function runApp(
  setup: (app: Express, server: Server) => Promise<void>,
) {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly run the final setup after setting up all the other routes so
  // the catch-all route doesn't interfere with the other routes
  await setup(app, server);

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
  }, () => {
    log(`serving on port ${port}`);
    
    // On startup, mark any stale "running" imports as interrupted (from previous crash)
    markRunningImportsAsInterrupted().catch(err => {
      console.error('Startup import cleanup error:', err);
    });
    
    // Start CDC cache warming asynchronously (non-blocking)
    warmCDCCache().catch(err => {
      console.error('Cache warming error:', err);
    });
    
    // Initialize scheduled tasks (tileset updates, etc.)
    initializeScheduledTasks();
  });
  
  // Graceful shutdown handlers
  const gracefulShutdown = async (signal: string) => {
    log(`Received ${signal}, shutting down gracefully...`);
    
    // Mark running imports as interrupted before exit
    await markRunningImportsAsInterrupted();
    
    server.close(() => {
      log('Server closed');
      process.exit(0);
    });
    
    // Force exit after 10 seconds if server doesn't close
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };
  
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
