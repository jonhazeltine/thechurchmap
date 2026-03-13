import { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import { verifyAuth } from "../../../../../lib/authMiddleware";

interface FacilityData {
  facilityOwnership?: 'own' | 'rent' | 'other';
  facilityAdequacy?: 'adequate' | 'needs_improvement' | 'significantly_limited';
  unmetFacilityNeeds?: string;
  seekSpace?: boolean;
  openToCoLocation?: boolean;
  shareSpace?: boolean;
  facilityNotes?: string;
}

export async function PATCH(req: Request, res: Response) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authenticated || !auth.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const churchId = req.params.id;
    if (!churchId) {
      return res.status(400).json({ error: "Church ID is required" });
    }

    // Use the auth result which already contains role information
    const canEdit = auth.isSuperAdmin || auth.isPlatformAdmin || auth.churchAdminChurchIds?.includes(churchId);

    console.log(`[Facility] Edit check for ${auth.user.email}:`, {
      churchId,
      isSuperAdmin: auth.isSuperAdmin,
      isPlatformAdmin: auth.isPlatformAdmin,
      churchAdminChurchIds: auth.churchAdminChurchIds,
      canEdit
    });

    if (!canEdit) {
      return res.status(403).json({ error: "Access denied. Only church admins or higher can edit facility information." });
    }

    const supabase = supabaseServer();
    const userId = auth.user.id;

    const facilityUpdate: FacilityData = {
      facilityOwnership: req.body.facilityOwnership,
      facilityAdequacy: req.body.facilityAdequacy,
      unmetFacilityNeeds: req.body.unmetFacilityNeeds,
      seekSpace: req.body.seekSpace,
      openToCoLocation: req.body.openToCoLocation,
      shareSpace: req.body.shareSpace,
      facilityNotes: req.body.facilityNotes,
    };

    const { data: existingClaim, error: fetchError } = await supabase
      .from("church_claims")
      .select("id, wizard_data")
      .eq("church_id", churchId)
      .eq("status", "approved")
      .order("reviewed_at", { ascending: false })
      .limit(1)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("Error fetching existing claim:", fetchError);
      return res.status(500).json({ error: "Failed to fetch claim data" });
    }

    if (existingClaim) {
      let existingWizardData: Record<string, any> = {};
      if (existingClaim.wizard_data) {
        if (typeof existingClaim.wizard_data === 'string') {
          try {
            existingWizardData = JSON.parse(existingClaim.wizard_data);
          } catch (e) {
            console.error("Failed to parse existing wizard data:", e);
          }
        } else if (typeof existingClaim.wizard_data === 'object') {
          existingWizardData = existingClaim.wizard_data as Record<string, any>;
        }
      }

      const updatedWizardData = {
        ...existingWizardData,
        ...facilityUpdate,
      };

      const { error: updateError } = await supabase
        .from("church_claims")
        .update({ wizard_data: updatedWizardData })
        .eq("id", existingClaim.id);

      if (updateError) {
        console.error("Error updating claim wizard_data:", updateError);
        return res.status(500).json({ error: "Failed to update facility information" });
      }

      return res.json({ success: true, message: "Facility information updated" });
    } else {
      const { error: insertError } = await supabase
        .from("church_claims")
        .insert({
          church_id: churchId,
          user_id: userId,
          status: "approved",
          wizard_data: facilityUpdate,
          reviewed_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error("Error creating claim for facility data:", insertError);
        return res.status(500).json({ error: "Failed to save facility information" });
      }

      return res.json({ success: true, message: "Facility information saved" });
    }
  } catch (error) {
    console.error("Error in facility PATCH endpoint:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
