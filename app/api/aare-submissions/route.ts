import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../lib/supabaseServer";
import { insertAareSubmissionSchema } from "@shared/schema";

export async function POST(req: Request, res: Response) {
  try {
    const validationResult = insertAareSubmissionSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.errors
      });
    }

    const submissionData = validationResult.data;
    const adminClient = supabaseServer();

    let userId: string | null = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const userClient = supabaseUserClient(token);
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        userId = user.id;
      }
    }

    if (!userId && (!submissionData.contact_name || !submissionData.contact_email)) {
      return res.status(400).json({
        error: 'Contact name and email are required for non-authenticated submissions'
      });
    }

    if (submissionData.church_id) {
      const { data: church, error: churchError } = await adminClient
        .from('churches')
        .select('id')
        .eq('id', submissionData.church_id)
        .single();

      if (churchError || !church) {
        return res.status(404).json({ error: 'Church not found' });
      }
    }

    const { data: submission, error: insertError } = await adminClient
      .from('aare_submissions')
      .insert({
        church_id: submissionData.church_id || null,
        user_id: userId,
        contact_name: submissionData.contact_name,
        contact_email: submissionData.contact_email,
        contact_phone: submissionData.contact_phone,
        submission_type: submissionData.submission_type || 'fund_mission_page',
        notes: submissionData.notes,
        status: 'new',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating AARE submission:', insertError);
      return res.status(500).json({ error: 'Failed to create submission' });
    }

    return res.status(201).json({
      submission,
      message: 'AARE conversion submission received successfully.'
    });
  } catch (error) {
    console.error('Error in POST /api/aare-submissions:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
