import fs from "node:fs";
import path from "node:path";
import { type Server } from "node:http";

import express, { type Express, type Request, type Response, type NextFunction } from "express";
import runApp from "./app";
import { getOGMetaTagsForRoute, injectOGMetaTags } from "./services/og-meta-injection";

export async function serveStatic(app: Express, _server: Server) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Serve static assets but NOT index.html (we handle that separately for OG injection)
  app.use(express.static(distPath, { index: false }));

  // Serve index.html with OG meta tag injection for all routes
  app.use("*", async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const indexPath = path.resolve(distPath, "index.html");
      let html = await fs.promises.readFile(indexPath, "utf-8");
      
      // Inject OG meta tags for social sharing
      const parsedUrl = new URL(req.originalUrl, `http://${req.headers.host || 'localhost'}`);
      const pathname = parsedUrl.pathname;
      const queryString = parsedUrl.search.slice(1); // Remove leading '?'
      const ogTags = await getOGMetaTagsForRoute(pathname, req.headers.host, queryString);
      
      if (ogTags) {
        html = injectOGMetaTags(html, ogTags);
      }
      
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (err) {
      console.error('Error serving index.html:', err);
      res.sendFile(path.resolve(distPath, "index.html"));
    }
  });
}

(async () => {
  await runApp(serveStatic);
})();
