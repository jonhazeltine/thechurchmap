import type { Request, Response } from "express";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

/**
 * GET /api/churches/all-geojson
 *
 * Returns ALL approved churches as GeoJSON FeatureCollection.
 * Cached by Cloudflare for 1 hour. Used by the Explore page for
 * the "240K churches" visualization at all zoom levels.
 */
export async function GET(_req: Request, res: Response) {
  try {
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
      SELECT id, name, city, state, denomination, profile_photo_url,
             display_lat, display_lng
      FROM churches
      WHERE approved = true AND display_lat IS NOT NULL
    `);

    await pool.end();

    const geojson = {
      type: "FeatureCollection",
      features: rows.map((c: any) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [parseFloat(c.display_lng), parseFloat(c.display_lat)],
        },
        properties: {
          id: c.id,
          name: c.name,
          city: c.city,
          state: c.state,
          denomination: c.denomination,
          profile_photo_url: c.profile_photo_url,
        },
      })),
    };

    // Cache for 1 hour at edge + browser
    res.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res.set("Content-Type", "application/json");
    return res.json(geojson);
  } catch (err: any) {
    console.error("Error generating all-churches GeoJSON:", err);
    return res.status(500).json({ error: err.message });
  }
}
