import type { Request, Response } from "express";
import { supabaseServer } from "../../../lib/supabaseServer";
import { insertPlatformApplicationSchema } from "@shared/schema";

export async function POST(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    console.log('[Platform Application] Auth header present:', !!authHeader);
    
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('[Platform Application] Missing or invalid auth header');
      return res.status(401).json({ error: 'Unauthorized - no auth header' });
    }

    const token = authHeader.substring(7);
    console.log('[Platform Application] Token length:', token?.length || 0);
    
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);

    if (authError) {
      console.log('[Platform Application] Auth error:', authError.message);
      return res.status(401).json({ error: `Unauthorized - ${authError.message}` });
    }
    
    if (!user) {
      console.log('[Platform Application] No user found for token');
      return res.status(401).json({ error: 'Unauthorized - no user' });
    }
    
    console.log('[Platform Application] User authenticated:', user.email);

    const parseResult = insertPlatformApplicationSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
    }

    const applicationData = parseResult.data;

    const { data: profile } = await adminClient
      .from('profiles')
      .select('full_name, first_name, last_name')
      .eq('id', user.id)
      .single();

    const applicantName = profile?.full_name || 
      (profile?.first_name && profile?.last_name 
        ? `${profile.first_name} ${profile.last_name}` 
        : profile?.first_name || 'Unknown');

    const { data: existingApplication } = await adminClient
      .from('city_platform_applications')
      .select('id, status')
      .eq('applicant_user_id', user.id)
      .eq('status', 'pending')
      .single();

    if (existingApplication) {
      return res.status(400).json({
        error: 'You already have a pending application. Please wait for it to be reviewed before submitting another.',
      });
    }

    if (applicationData.requested_platform_slug) {
      const { data: existingSlug } = await adminClient
        .from('city_platforms')
        .select('id')
        .eq('slug', applicationData.requested_platform_slug)
        .single();

      if (existingSlug) {
        return res.status(400).json({
          error: 'This platform slug is already in use. Please choose a different one.',
        });
      }
    }

    const now = new Date().toISOString();
    const { data: application, error: insertError } = await adminClient
      .from('city_platform_applications')
      .insert({
        applicant_user_id: user.id,
        applicant_email: user.email || '',
        applicant_name: applicantName,
        requested_platform_name: applicationData.requested_platform_name,
        requested_platform_slug: applicationData.requested_platform_slug || null,
        requested_boundary_type: applicationData.requested_boundary_type,
        boundary_ids: applicationData.boundary_ids,
        city_description: applicationData.city_description,
        ministry_vision: applicationData.ministry_vision,
        existing_partners: applicationData.existing_partners || null,
        leadership_experience: applicationData.leadership_experience || null,
        expected_timeline: applicationData.expected_timeline || null,
        status: 'pending',
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating platform application:', insertError);
      return res.status(500).json({ error: 'Failed to submit application' });
    }

    return res.status(201).json({
      message: 'Application submitted successfully. You will be notified when it has been reviewed.',
      application,
    });

  } catch (error) {
    console.error('Error in POST /api/platform-applications:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
