import { supabaseServer } from "../../lib/supabaseServer";
import * as fs from "fs";
import * as path from "path";

interface PinFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
  };
  properties: {
    id: string;
    name: string;
    denomination: string | null;
    profile_photo_url: string | null;
  };
}

interface PinGeoJSON {
  type: "FeatureCollection";
  features: PinFeature[];
  metadata: {
    platformId: string;
    platformName: string;
    generatedAt: string;
    count: number;
  };
}

/**
 * Get the directory for storing platform pin GeoJSON files.
 * Uses public/ in dev, dist/public/ in production.
 */
function getPinCacheDir(): string {
  const isProduction = process.env.NODE_ENV === "production";
  const base = isProduction
    ? path.join(process.cwd(), "dist", "public", "platform-pins")
    : path.join(process.cwd(), "public", "platform-pins");
  return base;
}

/**
 * Ensure the pin cache directory exists.
 */
function ensureCacheDir(): string {
  const dir = getPinCacheDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Generate a static GeoJSON file for a single platform.
 * Returns the number of churches included.
 */
export async function generatePlatformPinCache(platformId: string): Promise<{
  count: number;
  filePath: string;
  platformName: string;
}> {
  const supabase = supabaseServer();

  // Get platform info
  const { data: platform, error: platformError } = await supabase
    .from("city_platforms")
    .select("id, name, slug")
    .eq("id", platformId)
    .single();

  if (platformError || !platform) {
    throw new Error(`Platform not found: ${platformId}`);
  }

  // Get all visible/featured churches for this platform
  const { data: platformLinks, error: linksError } = await supabase
    .from("city_platform_churches")
    .select("church_id")
    .eq("city_platform_id", platformId)
    .in("status", ["visible", "featured"]);

  if (linksError) {
    throw new Error(`Failed to fetch platform church links: ${linksError.message}`);
  }

  if (!platformLinks || platformLinks.length === 0) {
    // Write empty GeoJSON
    const emptyGeoJSON: PinGeoJSON = {
      type: "FeatureCollection",
      features: [],
      metadata: {
        platformId,
        platformName: platform.name,
        generatedAt: new Date().toISOString(),
        count: 0,
      },
    };

    const dir = ensureCacheDir();
    const filePath = path.join(dir, `${platformId}.geojson`);
    fs.writeFileSync(filePath, JSON.stringify(emptyGeoJSON));
    return { count: 0, filePath, platformName: platform.name };
  }

  const churchIds = platformLinks.map((l) => l.church_id);

  // Fetch church data in batches (Supabase has a limit on IN clause)
  const batchSize = 200; // Keep batches small to avoid Supabase timeouts
  const allChurches: any[] = [];

  for (let i = 0; i < churchIds.length; i += batchSize) {
    const batch = churchIds.slice(i, i + batchSize);
    const { data: churches, error: churchError } = await supabase
      .from("churches")
      .select("id, name, denomination, profile_photo_url, display_lat, display_lng")
      .in("id", batch)
      .eq("approved", true);

    if (churchError) {
      throw new Error(`Failed to fetch churches: ${churchError.message}`);
    }

    if (churches) {
      allChurches.push(...churches);
    }
  }

  // Build GeoJSON features using display coordinates
  const features: PinFeature[] = [];
  for (const church of allChurches) {
    const lat = church.display_lat;
    const lng = church.display_lng;
    if (!lat || !lng) continue;

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [lng, lat],
      },
      properties: {
        id: church.id,
        name: church.name,
        denomination: church.denomination,
        profile_photo_url: church.profile_photo_url,
      },
    });
  }

  const geojson: PinGeoJSON = {
    type: "FeatureCollection",
    features,
    metadata: {
      platformId,
      platformName: platform.name,
      generatedAt: new Date().toISOString(),
      count: features.length,
    },
  };

  const dir = ensureCacheDir();
  const filePath = path.join(dir, `${platformId}.geojson`);
  fs.writeFileSync(filePath, JSON.stringify(geojson));

  console.log(
    `[platform-pin-cache] Generated ${features.length} pins for "${platform.name}" -> ${filePath}`
  );

  return { count: features.length, filePath, platformName: platform.name };
}

/**
 * Generate static GeoJSON files for ALL platforms.
 */
export async function generateAllPlatformPinCaches(): Promise<{
  results: Array<{ platformId: string; platformName: string; count: number }>;
  errors: Array<{ platformId: string; error: string }>;
}> {
  const supabase = supabaseServer();

  const { data: platforms, error } = await supabase
    .from("city_platforms")
    .select("id, name")
    .eq("is_active", true);

  if (error) {
    throw new Error(`Failed to fetch platforms: ${error.message}`);
  }

  const results: Array<{ platformId: string; platformName: string; count: number }> = [];
  const errors: Array<{ platformId: string; error: string }> = [];

  for (const platform of platforms || []) {
    try {
      const result = await generatePlatformPinCache(platform.id);
      results.push({
        platformId: platform.id,
        platformName: result.platformName,
        count: result.count,
      });
    } catch (err: any) {
      errors.push({ platformId: platform.id, error: err.message });
      console.error(
        `[platform-pin-cache] Error generating cache for ${platform.name}:`,
        err.message
      );
    }
  }

  return { results, errors };
}

/**
 * Check if a static GeoJSON file exists for a given platform.
 */
export function getPlatformPinCachePath(platformId: string): string | null {
  const dir = getPinCacheDir();
  const filePath = path.join(dir, `${platformId}.geojson`);
  if (fs.existsSync(filePath)) {
    return filePath;
  }
  return null;
}
