import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../../lib/supabaseServer";
import { submitPendingChurchSchema } from "../../../../shared/schema";

export async function POST(req: Request, res: Response) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify user
    const userClient = supabaseUserClient(token);
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid authentication' });
    }

    // Validate request
    const validation = submitPendingChurchSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const churchData = validation.data;
    const supabase = supabaseServer();

    // Check if user already has a pending submission
    const { data: existingSubmission } = await supabase
      .from('pending_churches')
      .select('id, name, status')
      .eq('submitted_by_user_id', user.id)
      .eq('status', 'pending')
      .single();

    if (existingSubmission) {
      return res.status(400).json({ 
        error: `You already have a pending church submission: "${existingSubmission.name}". Please wait for it to be reviewed.`
      });
    }

    // Create pending church entry
    const { data: pendingChurch, error: insertError } = await supabase
      .from('pending_churches')
      .insert({
        submitted_by_user_id: user.id,
        name: churchData.name,
        address: churchData.address || null,
        city: churchData.city || null,
        state: churchData.state || null,
        zip: churchData.zip || null,
        denomination: churchData.denomination || null,
        website: churchData.website || null,
        phone: churchData.phone || null,
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    // Mark onboarding as complete
    await supabase
      .from('profiles')
      .update({
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    res.json({
      success: true,
      church_id: null,
      pending_church_id: pendingChurch.id,
      platform_id: null,
      platform_name: null,
      joined_platform: false,
      message: `Thank you! "${churchData.name}" has been submitted for review. You'll be notified once it's approved.`,
    });
  } catch (error: any) {
    console.error('Error submitting pending church:', error);
    res.status(500).json({ error: error.message });
  }
}
