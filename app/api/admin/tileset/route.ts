import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";
import { generateAndUploadTileset, checkUploadStatus, updateSampledGeoJSON, listRecentUploads } from "../../../../server/services/tileset-generator";

async function requireSuperAdmin(req: Request, res: Response): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const token = authHeader.substring(7);
  const adminClient = supabaseServer();
  const { data: { user }, error: authError } = await adminClient.auth.getUser(token);

  if (authError || !user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const isSuperAdmin = user.user_metadata?.super_admin === true;
  if (!isSuperAdmin) {
    res.status(403).json({ error: 'Super admin access required' });
    return null;
  }

  return user.id;
}

export async function POST(req: Request, res: Response) {
  try {
    const userId = await requireSuperAdmin(req, res);
    if (!userId) return;
    
    console.log("[Admin] Tileset generation requested by:", userId);
    
    const result = await generateAndUploadTileset();
    
    if (result.success) {
      res.json({
        message: "Tileset upload initiated",
        churchCount: result.churchCount,
        uploadId: result.uploadId,
        duration: result.duration
      });
    } else {
      res.status(500).json({
        error: "Tileset generation failed",
        details: result.error
      });
    }
  } catch (error: any) {
    console.error("[Admin] Tileset error:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function GET(req: Request, res: Response) {
  try {
    const uploadId = req.query.uploadId as string;
    
    if (uploadId) {
      const status = await checkUploadStatus(uploadId);
      return res.json(status);
    }
    
    // List recent uploads for this tileset
    const recentUploads = await listRecentUploads();
    
    res.json({
      tileset: "jonhazeltine.all-churches-v8",
      recentUploads,
      description: "POST to generate new tileset, GET with ?uploadId=xxx to check status"
    });
  } catch (error: any) {
    console.error("[Admin] Tileset status error:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function PUT(req: Request, res: Response) {
  try {
    const userId = await requireSuperAdmin(req, res);
    if (!userId) return;
    
    console.log("[Admin] Sampled GeoJSON refresh requested by:", userId);
    
    const result = await updateSampledGeoJSON();
    
    if (result.success) {
      res.json({
        message: "Sampled GeoJSON updated",
        count: result.count
      });
    } else {
      res.status(500).json({ error: "Failed to update sampled GeoJSON" });
    }
  } catch (error: any) {
    console.error("[Admin] Sampled GeoJSON error:", error);
    res.status(500).json({ error: error.message });
  }
}
