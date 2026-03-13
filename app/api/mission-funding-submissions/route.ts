import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../lib/supabaseServer";
import { insertMissionFundingSubmissionSchema } from "@shared/schema";

export async function POST(req: Request, res: Response) {
  try {
    const validationResult = insertMissionFundingSubmissionSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.errors
      });
    }

    const submissionData = validationResult.data;
    const adminClient = supabaseServer();

    let userId: string | null = null;
    let isLoggedIn = false;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const userClient = supabaseUserClient(token);
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        userId = user.id;
        isLoggedIn = true;
      }
    }

    if (submissionData.church_id) {
      const { data: church, error: churchError } = await adminClient
        .from('churches')
        .select('id, name')
        .eq('id', submissionData.church_id)
        .single();

      if (churchError || !church) {
        return res.status(404).json({ error: 'Church not found' });
      }
    }

    const { data: submission, error: insertError } = await adminClient
      .from('mission_funding_submissions')
      .insert({
        church_id: submissionData.church_id || null,
        user_id: userId,
        first_name: submissionData.first_name,
        last_name: submissionData.last_name,
        email: submissionData.email,
        phone: submissionData.phone || null,
        buyer_seller_type: submissionData.buyer_seller_type,
        timeline: submissionData.timeline || null,
        notes: submissionData.notes || null,
        is_logged_in: isLoggedIn,
        status: 'new',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating mission funding submission:', insertError);
      return res.status(500).json({ error: 'Failed to create submission' });
    }

    return res.status(201).json({
      submission,
      message: 'Thank you! Someone will be in touch soon.'
    });
  } catch (error) {
    console.error('Error in POST /api/mission-funding-submissions:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
