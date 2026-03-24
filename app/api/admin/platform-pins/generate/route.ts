import type { Request, Response } from "express";
import { verifyAuth } from "../../../../../lib/authMiddleware";
import {
  generatePlatformPinCache,
  generateAllPlatformPinCaches,
} from "../../../../../server/services/platform-pin-cache";

/**
 * POST /api/admin/platform-pins/generate
 *
 * Generate static GeoJSON pin files for platforms.
 * Body: { platformId?: string } — if omitted, generates for ALL platforms.
 * Requires super admin access.
 */
export async function POST(req: Request, res: Response) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.isSuperAdmin) {
      return res.status(403).json({ error: "Super admin access required" });
    }

    const { platformId } = req.body || {};

    if (platformId) {
      // Generate for a single platform
      const result = await generatePlatformPinCache(platformId);
      return res.json({
        message: `Generated pin cache for "${result.platformName}"`,
        platformId,
        count: result.count,
        filePath: result.filePath,
      });
    }

    // Generate for all platforms
    const { results, errors } = await generateAllPlatformPinCaches();
    const totalPins = results.reduce((sum, r) => sum + r.count, 0);

    return res.json({
      message: `Generated pin caches for ${results.length} platforms (${totalPins} total pins)`,
      results,
      errors,
    });
  } catch (err: any) {
    console.error("Error generating platform pin cache:", err);
    return res.status(500).json({ error: err.message });
  }
}
