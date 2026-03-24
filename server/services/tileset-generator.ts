import { supabaseServer } from "../../lib/supabaseServer";
import fs from "fs";
import path from "path";
import wkx from "wkx";
import { execSync } from "child_process";
import os from "os";

const MAPBOX_USERNAME = "jonhazeltine";
const TILESET_ID = "all-churches-v8";
const MAPBOX_TILESET = `${MAPBOX_USERNAME}.${TILESET_ID}`;

// Tippecanoe settings for optimal tile generation
const TIPPECANOE_CONFIG = {
  minZoom: 2,
  maxZoom: 14,
  layerName: "churches", // Must match our source-layer in frontend
};

interface ChurchRow {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  lng: number;
  lat: number;
}

interface GeoJSONFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    id: string;
    name: string;
    city: string;
    state: string;
  };
}

interface GeoJSONCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

export interface TilesetGenerationResult {
  success: boolean;
  churchCount: number;
  uploadId?: string;
  error?: string;
  duration?: number;
}

async function exportChurchesToGeoJSON(): Promise<{ geojson: GeoJSONCollection; count: number }> {
  const supabase = supabaseServer();
  
  console.log("[Tileset] Fetching churches using spatial boundary logic...");
  console.log("[Tileset] Logic: Platform-visible churches + bulk imports OUTSIDE platform boundaries");
  
  // Use RPC function that handles all the spatial logic in PostgreSQL
  // This function returns:
  // 1. All visible/featured platform churches
  // 2. Bulk imports outside all platform boundaries
  // Excludes: hidden churches, superseded churches, bulk imports inside platform areas
  
  const features: GeoJSONFeature[] = [];
  const PAGE_SIZE = 10000;
  let offset = 0;
  let fetchedTotal = 0;
  let skippedCount = 0;
  
  // Try RPC function first, fall back to legacy logic if not available
  console.log("[Tileset] Attempting to use fn_tileset_churches RPC...");
  
  const { data: rpcTest, error: rpcError } = await supabase.rpc('fn_tileset_churches').limit(1);
  
  if (rpcError) {
    // Fall back for "function not found" or timeout errors
    // Timeout is acceptable because the legacy logic uses city_platform_churches table
    // which is populated when platforms add boundaries (auto-linking), so it's equivalent
    const isNotFound = rpcError.message?.includes('function') || rpcError.code === '42883';
    const isTimeout = rpcError.message?.includes('timeout') || rpcError.message?.includes('canceling statement');
    
    if (isNotFound || isTimeout) {
      if (isNotFound) {
        console.warn(`[Tileset] RPC fn_tileset_churches not deployed. Using legacy logic.`);
      } else {
        console.warn(`[Tileset] RPC timed out. Using legacy logic (faster, uses indexed tables).`);
      }
      console.log(`[Tileset] Legacy logic uses city_platform_churches table for platform visibility.`);
      console.log(`[Tileset] This works because platforms auto-link churches when boundaries are added.`);
      return exportChurchesToGeoJSONLegacy();
    }
    // For other errors (permissions, etc.), fail hard to prevent incorrect data
    console.error(`[Tileset] RPC failed with error: ${rpcError.message}`);
    throw new Error(`Tileset RPC failed: ${rpcError.message}. Cannot generate tileset without spatial filtering.`);
  }
  
  console.log("[Tileset] RPC available, using spatial boundary logic...");
  
  // Paginate through RPC results
  while (true) {
    console.log(`[Tileset] Fetching batch: offset ${offset}, limit ${PAGE_SIZE}...`);
    
    const { data: churches, error } = await supabase
      .rpc('fn_tileset_churches')
      .range(offset, offset + PAGE_SIZE - 1);
    
    if (error) {
      console.error("[Tileset] Error fetching churches from RPC:", error);
      throw new Error(`Failed to fetch churches: ${error.message}`);
    }
    
    if (!churches || churches.length === 0) {
      console.log(`[Tileset] No more churches to fetch at offset ${offset}`);
      break;
    }
    
    fetchedTotal += churches.length;
    console.log(`[Tileset] Fetched ${churches.length} churches (total so far: ${fetchedTotal})`);
    
    for (const church of churches) {
      if (church.lng != null && church.lat != null) {
        features.push({
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [church.lng, church.lat]
          },
          properties: {
            id: church.id,
            name: church.name || "Unknown Church",
            city: church.city || "",
            state: church.state || ""
          }
        });
      } else {
        skippedCount++;
      }
    }
    
    // If we got fewer than PAGE_SIZE, we've reached the end
    if (churches.length < PAGE_SIZE) {
      console.log(`[Tileset] Last batch (${churches.length} < ${PAGE_SIZE}), finished fetching`);
      break;
    }
    
    offset += PAGE_SIZE;
  }
  
  console.log(`[Tileset] Created ${features.length} GeoJSON features`);
  console.log(`[Tileset] Skipped ${skippedCount} churches with invalid coordinates`);
  
  if (features.length === 0) {
    throw new Error("No churches found with valid coordinates");
  }
  
  return {
    geojson: {
      type: "FeatureCollection",
      features
    },
    count: features.length
  };
}

// Legacy function for backwards compatibility when RPC is not available
async function exportChurchesToGeoJSONLegacy(): Promise<{ geojson: GeoJSONCollection; count: number }> {
  const supabase = supabaseServer();
  
  console.log("[Tileset] Using legacy export logic (uses indexed city_platform_churches table)...");
  console.log("[Tileset] Logic: Churches inside platform boundaries show ONLY if visible/featured");
  console.log("[Tileset] Logic: Churches outside platform boundaries (not in any platform) are included");
  
  // Get ALL church IDs from platform links and their visibility status
  // Churches in this set are "inside platform boundaries"
  // Only those with visible/featured status should be shown
  const platformChurchIds = new Set<string>(); // All churches in any platform
  const visibleChurchIds = new Set<string>();   // Only visible/featured ones
  const PLATFORM_PAGE_SIZE = 10000;
  let platformOffset = 0;
  
  while (true) {
    const { data: platformChurchBatch, error: batchError } = await supabase
      .from('city_platform_churches')
      .select('church_id, status')
      .order('church_id')
      .range(platformOffset, platformOffset + PLATFORM_PAGE_SIZE - 1);
    
    if (batchError) {
      console.error("[Tileset] Error fetching platform church statuses:", batchError);
      throw new Error(`Failed to get platform church statuses: ${batchError.message}`);
    }
    
    if (!platformChurchBatch || platformChurchBatch.length === 0) break;
    
    for (const row of platformChurchBatch) {
      // Track ALL churches in platforms (inside platform boundaries)
      platformChurchIds.add(row.church_id);
      // Track which ones are visible
      if (row.status === 'visible' || row.status === 'featured') {
        visibleChurchIds.add(row.church_id);
      }
    }
    
    if (platformChurchBatch.length < PLATFORM_PAGE_SIZE) break;
    platformOffset += PLATFORM_PAGE_SIZE;
  }
  
  console.log(`[Tileset] Churches inside platform boundaries: ${platformChurchIds.size}`);
  console.log(`[Tileset] Of those, visible/featured: ${visibleChurchIds.size}`);
  
  // Fetch all churches
  const PAGE_SIZE = 10000;
  const features: GeoJSONFeature[] = [];
  let skippedCount = 0;
  let hiddenSkippedCount = 0;
  let supersededSkippedCount = 0;
  let offset = 0;
  let fetchedTotal = 0;
  
  while (true) {
    const { data: churches, error } = await supabase
      .from('churches')
      .select('id, name, city, state, location, managed_by_platform, superseded_by_church_id')
      .not('location', 'is', null)
      .order('id')
      .range(offset, offset + PAGE_SIZE - 1);
    
    if (error) {
      console.error("[Tileset] Error fetching churches batch:", error);
      throw new Error(`Failed to fetch churches: ${error.message}`);
    }
    
    if (!churches || churches.length === 0) break;
    
    fetchedTotal += churches.length;
    
    for (const church of churches) {
      // Skip superseded churches (merged into another church)
      if (church.superseded_by_church_id) {
        supersededSkippedCount++;
        continue;
      }
      
      // Determine if church is inside a platform boundary
      const isInsidePlatformBoundary = platformChurchIds.has(church.id);
      const isVisibleOnPlatform = visibleChurchIds.has(church.id);
      
      // CORE LOGIC: Platform-curated data takes precedence
      // - Inside platform boundaries: ONLY show if visible/featured on platform
      // - Outside platform boundaries: INCLUDE (genuine bulk import)
      if (isInsidePlatformBoundary && !isVisibleOnPlatform) {
        hiddenSkippedCount++;
        continue;
      }
      
      const coords = parseLocationToCoords(church.location);
      if (coords) {
        features.push({
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: coords
          },
          properties: {
            id: church.id,
            name: church.name || "Unknown Church",
            city: church.city || "",
            state: church.state || ""
          }
        });
      } else {
        skippedCount++;
      }
    }
    
    if (churches.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  
  console.log(`[Tileset] Created ${features.length} GeoJSON features (legacy)`);
  console.log(`[Tileset] Skipped: ${hiddenSkippedCount} inside-platform-not-visible, ${supersededSkippedCount} superseded, ${skippedCount} invalid coords`);
  
  if (features.length === 0) {
    throw new Error("No churches found with valid coordinates");
  }
  
  return {
    geojson: {
      type: "FeatureCollection",
      features
    },
    count: features.length
  };
}

// Parse PostGIS geography/geometry location to [lng, lat] coordinates
function parseLocationToCoords(location: any): [number, number] | null {
  if (!location) return null;
  
  try {
    // Handle GeoJSON Point format: { type: 'Point', coordinates: [lng, lat] }
    if (typeof location === 'object' && location.coordinates && Array.isArray(location.coordinates)) {
      const [lng, lat] = location.coordinates;
      if (typeof lng === 'number' && typeof lat === 'number' && !isNaN(lng) && !isNaN(lat)) {
        return [lng, lat];
      }
    }
    
    // Handle string format
    if (typeof location === 'string') {
      // Try WKB hex format first (PostGIS default output)
      if (/^[0-9A-Fa-f]+$/.test(location)) {
        try {
          const buffer = Buffer.from(location, 'hex');
          const geometry = wkx.Geometry.parse(buffer);
          const geojson = geometry.toGeoJSON() as any;
          if (geojson.type === 'Point' && geojson.coordinates) {
            const [lng, lat] = geojson.coordinates;
            if (typeof lng === 'number' && typeof lat === 'number' && !isNaN(lng) && !isNaN(lat)) {
              return [lng, lat];
            }
          }
        } catch {
          // Not valid WKB, try other formats
        }
      }
      
      // Try parsing as JSON
      try {
        const parsed = JSON.parse(location);
        if (parsed.coordinates && Array.isArray(parsed.coordinates)) {
          const [lng, lat] = parsed.coordinates;
          if (typeof lng === 'number' && typeof lat === 'number') {
            return [lng, lat];
          }
        }
      } catch {
        // Try WKT format: POINT(lng lat)
        const wktMatch = location.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
        if (wktMatch) {
          const lng = parseFloat(wktMatch[1]);
          const lat = parseFloat(wktMatch[2]);
          if (!isNaN(lng) && !isNaN(lat)) {
            return [lng, lat];
          }
        }
      }
    }
  } catch (e) {
    // Silent fail, return null
  }
  
  return null;
}

interface MapboxCredentials {
  bucket: string;
  key: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  url: string;
}

async function getMapboxUploadCredentials(): Promise<MapboxCredentials> {
  const token = process.env.MAPBOX_SECRET_TOKEN;
  if (!token) {
    throw new Error("MAPBOX_SECRET_TOKEN not configured");
  }
  
  const response = await fetch(
    `https://api.mapbox.com/uploads/v1/${MAPBOX_USERNAME}/credentials?access_token=${token}`,
    { method: "POST" }
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get Mapbox credentials: ${response.status} ${errorText}`);
  }
  
  const data = await response.json();
  
  // Mapbox returns awsAccessKeyId, awsSecretAccessKey but we normalize to standard names
  return {
    bucket: data.bucket,
    key: data.key,
    accessKeyId: data.accessKeyId || data.awsAccessKeyId,
    secretAccessKey: data.secretAccessKey || data.awsSecretAccessKey,
    sessionToken: data.sessionToken,
    url: data.url
  };
}

/**
 * Run tippecanoe to convert GeoJSON to optimized .mbtiles
 * This handles tile size limits automatically by dropping features at low zoom
 */
function runTippecanoe(geojsonPath: string, mbtilesPath: string): void {
  const { minZoom, maxZoom, layerName } = TIPPECANOE_CONFIG;
  
  // Build tippecanoe command with optimal settings for large point datasets
  // Default tile size limit is 500KB which is well under Mapbox's 5MB limit
  const command = [
    "tippecanoe",
    `-o "${mbtilesPath}"`,
    `-Z${minZoom}`, // Min zoom
    `-z${maxZoom}`, // Max zoom
    `-l ${layerName}`, // Layer name (must match frontend source-layer)
    "--drop-densest-as-needed", // Drop features from dense tiles to stay under default 500KB limit
    "--extend-zooms-if-still-dropping", // Create higher zooms if needed
    "--force", // Overwrite output file if exists
    `"${geojsonPath}"`
  ].join(" ");
  
  console.log(`[Tileset] Running tippecanoe: ${command}`);
  
  try {
    execSync(command, { 
      stdio: "pipe",
      maxBuffer: 100 * 1024 * 1024 // 100MB buffer for output
    });
    console.log("[Tileset] Tippecanoe completed successfully");
  } catch (error: any) {
    const stderr = error.stderr?.toString() || "";
    const stdout = error.stdout?.toString() || "";
    console.error("[Tileset] Tippecanoe failed:", stderr || stdout);
    throw new Error(`Tippecanoe failed: ${stderr || stdout || error.message}`);
  }
}

async function uploadToS3(credentials: any, filePath: string, contentType: string): Promise<void> {
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  
  const s3Client = new S3Client({
    region: "us-east-1",
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken
    }
  });
  
  // Read file as buffer for upload
  const fileContent = fs.readFileSync(filePath);
  
  const command = new PutObjectCommand({
    Bucket: credentials.bucket,
    Key: credentials.key,
    Body: fileContent,
    ContentType: contentType
  });
  
  await s3Client.send(command);
  console.log(`[Tileset] Uploaded ${path.basename(filePath)} to Mapbox S3 staging (${(fileContent.length / 1024 / 1024).toFixed(2)} MB)`);
}

async function createMapboxUpload(stagingUrl: string): Promise<string> {
  const token = process.env.MAPBOX_SECRET_TOKEN;
  
  const response = await fetch(
    `https://api.mapbox.com/uploads/v1/${MAPBOX_USERNAME}?access_token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: stagingUrl,
        tileset: MAPBOX_TILESET,
        name: "churches" // Keep consistent name so source-layer is always "churches"
      })
    }
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create Mapbox upload: ${response.status} ${errorText}`);
  }
  
  const result = await response.json();
  console.log(`[Tileset] Created Mapbox upload: ${result.id}`);
  return result.id;
}

export async function checkUploadStatus(uploadId: string): Promise<{
  complete: boolean;
  progress: number;
  error?: string;
  tileset?: string;
}> {
  const token = process.env.MAPBOX_SECRET_TOKEN;
  
  const response = await fetch(
    `https://api.mapbox.com/uploads/v1/${MAPBOX_USERNAME}/${uploadId}?access_token=${token}`
  );
  
  if (!response.ok) {
    throw new Error(`Failed to check upload status: ${response.status}`);
  }
  
  const result = await response.json();
  return {
    complete: result.complete,
    progress: result.progress || 0,
    error: result.error || undefined,
    tileset: result.tileset
  };
}

/**
 * Poll upload status until complete or failed
 * Returns true if upload succeeded, false if failed
 */
export async function waitForUploadCompletion(
  uploadId: string, 
  maxWaitMs: number = 300000, // 5 minutes max
  pollIntervalMs: number = 5000 // Check every 5 seconds
): Promise<{ success: boolean; error?: string }> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const status = await checkUploadStatus(uploadId);
      
      if (status.error) {
        console.error(`[Tileset] Upload ${uploadId} failed:`, status.error);
        return { success: false, error: status.error };
      }
      
      if (status.complete) {
        console.log(`[Tileset] Upload ${uploadId} completed successfully!`);
        return { success: true };
      }
      
      console.log(`[Tileset] Upload ${uploadId} progress: ${Math.round(status.progress * 100)}%`);
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    } catch (error: any) {
      console.error(`[Tileset] Error checking upload status:`, error.message);
      // Continue polling on transient errors
    }
  }
  
  return { success: false, error: "Upload timed out waiting for completion" };
}

export async function generateAndUploadTileset(): Promise<TilesetGenerationResult> {
  const startTime = Date.now();
  
  // Create temp directory for intermediate files
  const tempDir = path.join(os.tmpdir(), `tileset-${Date.now()}`);
  const geojsonPath = path.join(tempDir, "churches.geojson");
  const mbtilesPath = path.join(tempDir, "churches.mbtiles");
  
  try {
    console.log("[Tileset] Starting tileset generation with tippecanoe...");
    
    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Step 1: Export churches to GeoJSON file
    const { geojson, count } = await exportChurchesToGeoJSON();
    const geojsonString = JSON.stringify(geojson);
    fs.writeFileSync(geojsonPath, geojsonString);
    
    console.log(`[Tileset] GeoJSON written: ${(geojsonString.length / 1024 / 1024).toFixed(2)} MB with ${count} features`);
    
    // IMPORTANT: Also write to the public folder for the Explore page
    // This ensures both the Mapbox tileset AND the low-zoom GeoJSON layer
    // have the EXACT SAME data (preventing duplicates/mismatches)
    const publicGeojsonPath = path.join(process.cwd(), "public", "all-churches-sampled.geojson");
    fs.writeFileSync(publicGeojsonPath, geojsonString);
    console.log(`[Tileset] Also saved GeoJSON to ${publicGeojsonPath} for Explore page sync`);
    
    // Step 2: Try tippecanoe, fall back to direct GeoJSON upload
    let uploadId: string;
    let usedTippecanoe = false;

    try {
      execSync("which tippecanoe", { stdio: "ignore" });
      console.log("[Tileset] tippecanoe available, using optimized pipeline");
      runTippecanoe(geojsonPath, mbtilesPath);
      const mbtilesSize = fs.statSync(mbtilesPath).size;
      console.log(`[Tileset] MBTiles created: ${(mbtilesSize / 1024 / 1024).toFixed(2)} MB`);

      const credentials = await getMapboxUploadCredentials();
      await uploadToS3(credentials, mbtilesPath, "application/x-sqlite3");
      uploadId = await createMapboxUpload(credentials.url);
      usedTippecanoe = true;
    } catch (tippErr: any) {
      console.log("[Tileset] tippecanoe not available, uploading GeoJSON directly to Mapbox");
      console.log("[Tileset] Mapbox will process tiles server-side (slower but works everywhere)");

      // Upload GeoJSON directly — Mapbox Uploads API accepts GeoJSON
      const credentials = await getMapboxUploadCredentials();
      await uploadToS3(credentials, geojsonPath, "application/geo+json");
      uploadId = await createMapboxUpload(credentials.url);
    }

    console.log(`[Tileset] Upload initiated (${usedTippecanoe ? 'tippecanoe' : 'direct GeoJSON'})`);
    
    const duration = Date.now() - startTime;
    console.log(`[Tileset] Upload initiated in ${duration}ms`);
    
    // Cleanup temp files
    try {
      fs.unlinkSync(geojsonPath);
      fs.unlinkSync(mbtilesPath);
      fs.rmdirSync(tempDir);
    } catch (cleanupErr) {
      console.warn("[Tileset] Cleanup warning:", cleanupErr);
    }
    
    return {
      success: true,
      churchCount: count,
      uploadId,
      duration
    };
  } catch (error: any) {
    console.error("[Tileset] Generation failed:", error);
    
    // Cleanup temp files on error
    try {
      if (fs.existsSync(geojsonPath)) fs.unlinkSync(geojsonPath);
      if (fs.existsSync(mbtilesPath)) fs.unlinkSync(mbtilesPath);
      if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
    } catch (cleanupErr) {
      // Ignore cleanup errors
    }
    
    return {
      success: false,
      churchCount: 0,
      error: error.message,
      duration: Date.now() - startTime
    };
  }
}

export async function updateSampledGeoJSON(): Promise<{ success: boolean; count: number }> {
  try {
    console.log("[Tileset] Generating full GeoJSON for low-zoom display (ALL churches)...");
    
    const { geojson, count } = await exportChurchesToGeoJSON();
    
    // No sampling - include ALL churches for visibility at every zoom level
    const outputPath = path.join(process.cwd(), "public", "all-churches-sampled.geojson");
    fs.writeFileSync(outputPath, JSON.stringify(geojson));
    
    console.log(`[Tileset] Wrote ALL ${count} churches to ${outputPath}`);
    
    return { success: true, count };
  } catch (error: any) {
    console.error("[Tileset] Full GeoJSON generation failed:", error);
    return { success: false, count: 0 };
  }
}

// List recent uploads to find the latest
export async function listRecentUploads(): Promise<Array<{
  id: string;
  complete: boolean;
  progress: number;
  error?: string;
  tileset?: string;
  created: string;
  modified: string;
}>> {
  const accessToken = process.env.MAPBOX_SECRET_TOKEN;
  if (!accessToken) {
    throw new Error("MAPBOX_SECRET_TOKEN not configured");
  }
  
  const response = await fetch(
    `https://api.mapbox.com/uploads/v1/${MAPBOX_USERNAME}?access_token=${accessToken}`
  );
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to list uploads: ${text}`);
  }
  
  const uploads = await response.json();
  
  // Filter to only our tileset and return recent ones
  return uploads
    .filter((u: any) => u.tileset === MAPBOX_TILESET)
    .slice(0, 5)
    .map((u: any) => ({
      id: u.id,
      complete: u.complete === true,
      progress: u.progress || 0,
      error: u.error || undefined,
      tileset: u.tileset,
      created: u.created,
      modified: u.modified
    }));
}
