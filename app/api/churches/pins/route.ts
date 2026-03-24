import type { Request, Response } from "express";
import * as fs from "fs";
import { supabaseServer } from "../../../../lib/supabaseServer";
import { getPlatformPinCachePath } from "../../../../server/services/platform-pin-cache";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/churches/pins/:platformId
 *
 * Returns all church pins for a platform as GeoJSON.
 * 1. If a static cache file exists, streams it directly (fastest path).
 * 2. Otherwise, queries Supabase and returns GeoJSON on the fly.
 *
 * Cache headers: public, max-age=3600, s-maxage=3600 (1 hour)
 */
export async function GET(req: Request, res: Response) {
  try {
    const { platformId } = req.params;

    if (!platformId) {
      return res.status(400).json({ error: "Missing platformId parameter" });
    }

    // Resolve slug to UUID if needed
    let resolvedPlatformId = platformId;
    if (!UUID_REGEX.test(platformId)) {
      const supabase = supabaseServer();
      const { data: platform } = await supabase
        .from("city_platforms")
        .select("id")
        .eq("slug", platformId)
        .single();

      if (!platform) {
        return res.status(404).json({ error: "Platform not found" });
      }
      resolvedPlatformId = platform.id;
    }

    // Set cache headers (1 hour at edge + browser)
    res.set("Cache-Control", "public, max-age=3600, s-maxage=3600");

    // Check for static cache file first (fastest path)
    const cachePath = getPlatformPinCachePath(resolvedPlatformId);
    if (cachePath) {
      res.set("Content-Type", "application/json");
      res.set("X-Pin-Source", "static-cache");
      const stream = fs.createReadStream(cachePath);
      return stream.pipe(res);
    }

    // Fallback: direct SQL query (handles any number of churches without URL length limits)
    const dbUrl = process.env.DATABASE_URL;
    const isLocal = !!(dbUrl && (dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1")));
    const pgConfig = isLocal
      ? { connectionString: dbUrl }
      : {
          host: process.env.SUPABASE_DB_HOST || 'aws-0-us-west-2.pooler.supabase.com',
          port: parseInt(process.env.SUPABASE_DB_PORT || '5432'),
          database: 'postgres',
          user: process.env.SUPABASE_DB_USER || '',
          password: process.env.SUPABASE_DB_PASSWORD || '',
          ssl: { rejectUnauthorized: false },
        };
    const pool = new Pool(pgConfig);

    const { rows } = await pool.query(`
      SELECT c.id, c.name, c.denomination, c.profile_photo_url, c.display_lat, c.display_lng
      FROM churches c
      INNER JOIN city_platform_churches cpc ON c.id = cpc.church_id
      WHERE cpc.city_platform_id = $1
        AND cpc.status IN ('visible', 'featured')
        AND c.approved = true
        AND c.display_lat IS NOT NULL
    `, [resolvedPlatformId]);

    await pool.end();

    const features = rows.map((c: any) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [c.display_lng, c.display_lat],
      },
      properties: {
        id: c.id,
        name: c.name,
        denomination: c.denomination,
        profile_photo_url: c.profile_photo_url,
      },
    }));

    res.set("X-Pin-Source", "live-query");
    return res.json({
      type: "FeatureCollection",
      features,
      metadata: {
        platformId: resolvedPlatformId,
        generatedAt: new Date().toISOString(),
        count: features.length,
      },
    });
  } catch (err: any) {
    console.error("Error in GET /api/churches/pins/:platformId:", err);
    return res.status(500).json({ error: err.message });
  }
}
