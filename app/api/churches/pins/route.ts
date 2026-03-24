import type { Request, Response } from "express";
import * as fs from "fs";
import { supabaseServer } from "../../../../lib/supabaseServer";
import { getPlatformPinCachePath } from "../../../../server/services/platform-pin-cache";

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

    // Fallback: query Supabase directly
    const supabase = supabaseServer();

    // Get platform church links
    const { data: platformLinks, error: linksError } = await supabase
      .from("city_platform_churches")
      .select("church_id")
      .eq("city_platform_id", resolvedPlatformId)
      .in("status", ["visible", "featured"]);

    if (linksError) {
      return res.status(500).json({ error: linksError.message });
    }

    if (!platformLinks || platformLinks.length === 0) {
      res.set("X-Pin-Source", "live-query");
      return res.json({
        type: "FeatureCollection",
        features: [],
        metadata: {
          platformId: resolvedPlatformId,
          generatedAt: new Date().toISOString(),
          count: 0,
        },
      });
    }

    const churchIds = platformLinks.map((l) => l.church_id);

    // Fetch churches in batches
    const batchSize = 500;
    const features: any[] = [];

    for (let i = 0; i < churchIds.length; i += batchSize) {
      const batch = churchIds.slice(i, i + batchSize);
      const { data: churches } = await supabase
        .from("churches")
        .select("id, name, denomination, profile_photo_url, location, display_lat, display_lng")
        .in("id", batch)
        .eq("approved", true);

      if (churches) {
        for (const church of churches) {
          if (!church.location?.coordinates) continue;

          const [lng, lat] = church.location.coordinates;
          const displayLng = church.display_lng ?? lng;
          const displayLat = church.display_lat ?? lat;

          features.push({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [displayLng, displayLat],
            },
            properties: {
              id: church.id,
              name: church.name,
              denomination: church.denomination,
              profile_photo_url: church.profile_photo_url,
            },
          });
        }
      }
    }

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
