import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";

// POST /api/admin/collaboration/cleanup - Remove orphaned tags from churches
export async function POST(req: Request, res: Response) {
  console.log('🧹 POST /api/admin/collaboration/cleanup called');
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    if (!user.user_metadata?.super_admin) {
      return res.status(403).json({ error: "Forbidden: Super admin access required" });
    }

    // Get all official tag slugs
    const { data: officialTags, error: tagsError } = await adminClient
      .from('collaboration_tags')
      .select('slug');

    if (tagsError) throw tagsError;

    const officialSlugs = new Set((officialTags || []).map(t => t.slug));
    console.log(`📋 Found ${officialSlugs.size} official collaboration tags`);

    // Get all churches with their collaboration tags
    const { data: churches, error: churchesError } = await adminClient
      .from('churches')
      .select('id, name, collaboration_have, collaboration_need');
    
    if (churchesError) throw churchesError;

    // Track orphaned tags and churches to update
    const orphanedTags = new Set<string>();
    const churchesToUpdate: { id: string; name: string; have: string[]; need: string[]; originalHave: string[]; originalNeed: string[] }[] = [];

    (churches || []).forEach(church => {
      const originalHave = church.collaboration_have || [];
      const originalNeed = church.collaboration_need || [];
      
      const cleanedHave = originalHave.filter((slug: string) => officialSlugs.has(slug));
      const cleanedNeed = originalNeed.filter((slug: string) => officialSlugs.has(slug));
      
      // Find orphaned tags in this church
      originalHave.forEach((slug: string) => {
        if (!officialSlugs.has(slug)) orphanedTags.add(slug);
      });
      originalNeed.forEach((slug: string) => {
        if (!officialSlugs.has(slug)) orphanedTags.add(slug);
      });
      
      // Check if this church needs updating
      if (cleanedHave.length !== originalHave.length || cleanedNeed.length !== originalNeed.length) {
        churchesToUpdate.push({
          id: church.id,
          name: church.name,
          have: cleanedHave,
          need: cleanedNeed,
          originalHave,
          originalNeed
        });
      }
    });

    console.log(`🔍 Found ${orphanedTags.size} orphaned tags across ${churchesToUpdate.length} churches`);

    // Update churches to remove orphaned tags
    let updatedCount = 0;
    for (const church of churchesToUpdate) {
      const { error: updateError } = await adminClient
        .from('churches')
        .update({
          collaboration_have: church.have,
          collaboration_need: church.need
        })
        .eq('id', church.id);

      if (updateError) {
        console.error(`Error updating church ${church.id}:`, updateError);
      } else {
        updatedCount++;
        console.log(`✅ Updated church: ${church.name}`);
      }
    }

    const orphanedList = Array.from(orphanedTags).sort();
    console.log(`🧹 Cleanup complete. Removed ${orphanedList.length} orphaned tags from ${updatedCount} churches`);

    res.json({
      success: true,
      orphanedTags: orphanedList,
      churchesUpdated: updatedCount,
      message: `Removed ${orphanedList.length} orphaned tag(s) from ${updatedCount} church(es)`
    });
  } catch (error: any) {
    console.error('POST /api/admin/collaboration/cleanup error:', error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}

// GET /api/admin/collaboration/cleanup - Preview orphaned tags without removing
export async function GET(req: Request, res: Response) {
  console.log('🔍 GET /api/admin/collaboration/cleanup called');
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    if (!user.user_metadata?.super_admin) {
      return res.status(403).json({ error: "Forbidden: Super admin access required" });
    }

    // Get all official tag slugs
    const { data: officialTags, error: tagsError } = await adminClient
      .from('collaboration_tags')
      .select('slug');

    if (tagsError) throw tagsError;

    const officialSlugs = new Set((officialTags || []).map(t => t.slug));

    // Get all churches with their collaboration tags
    const { data: churches, error: churchesError } = await adminClient
      .from('churches')
      .select('id, name, collaboration_have, collaboration_need');
    
    if (churchesError) throw churchesError;

    // Track orphaned tags with usage info
    const orphanedTagUsage = new Map<string, { have: string[]; need: string[] }>();

    (churches || []).forEach(church => {
      const haveList = church.collaboration_have || [];
      const needList = church.collaboration_need || [];
      
      haveList.forEach((slug: string) => {
        if (!officialSlugs.has(slug)) {
          if (!orphanedTagUsage.has(slug)) {
            orphanedTagUsage.set(slug, { have: [], need: [] });
          }
          orphanedTagUsage.get(slug)!.have.push(church.name);
        }
      });
      
      needList.forEach((slug: string) => {
        if (!officialSlugs.has(slug)) {
          if (!orphanedTagUsage.has(slug)) {
            orphanedTagUsage.set(slug, { have: [], need: [] });
          }
          orphanedTagUsage.get(slug)!.need.push(church.name);
        }
      });
    });

    const orphanedDetails = Array.from(orphanedTagUsage.entries()).map(([slug, usage]) => ({
      slug,
      usedInHave: usage.have.length,
      usedInNeed: usage.need.length,
      churches: Array.from(new Set([...usage.have, ...usage.need]))
    })).sort((a, b) => a.slug.localeCompare(b.slug));

    res.json({
      orphanedTags: orphanedDetails,
      totalOrphanedTags: orphanedDetails.length,
      officialTagCount: officialSlugs.size
    });
  } catch (error: any) {
    console.error('GET /api/admin/collaboration/cleanup error:', error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}
