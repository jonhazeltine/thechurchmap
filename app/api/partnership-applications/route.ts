import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../lib/supabaseServer";
import { insertPartnershipApplicationSchema } from "@shared/schema";

export async function POST(req: Request, res: Response) {
  try {
    const validationResult = insertPartnershipApplicationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.errors
      });
    }

    const applicationData = validationResult.data;
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

    const { data: church, error: churchError } = await adminClient
      .from('churches')
      .select('id, name')
      .eq('id', applicationData.church_id)
      .single();

    if (churchError || !church) {
      console.error('Church lookup error:', churchError);
      return res.status(404).json({ error: 'Church not found' });
    }

    const { data: existingApp } = await adminClient
      .from('partnership_applications')
      .select('id, status, submission_count')
      .eq('church_id', applicationData.church_id)
      .single();

    let application = null;
    let isNewApplication = false;

    if (existingApp) {
      const { data: submission, error: submissionError } = await adminClient
        .from('partnership_application_submissions')
        .insert({
          application_id: existingApp.id,
          path: applicationData.path,
          applicant_name: applicationData.applicant_name,
          applicant_role: applicationData.applicant_role,
          applicant_email: applicationData.applicant_email,
          applicant_phone: applicationData.applicant_phone,
          has_authority_affirmation: applicationData.has_authority_affirmation,
          notes: applicationData.notes,
          user_id: userId,
        })
        .select()
        .single();

      if (submissionError) {
        console.error('Error creating submission:', submissionError);
        return res.status(500).json({ error: 'Failed to create submission record' });
      }

      const { count: submissionCount } = await adminClient
        .from('partnership_application_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('application_id', existingApp.id);

      const updateData: any = {
        path: applicationData.path,
        applicant_name: applicationData.applicant_name,
        applicant_role: applicationData.applicant_role,
        applicant_email: applicationData.applicant_email,
        applicant_phone: applicationData.applicant_phone,
        has_authority_affirmation: applicationData.has_authority_affirmation,
        notes: applicationData.notes,
        user_id: userId,
        submission_count: submissionCount || 1,
        updated_at: new Date().toISOString(),
      };

      if (existingApp.status === 'closed') {
        updateData.status = 'new';
      }

      const { data: updatedApp, error: updateError } = await adminClient
        .from('partnership_applications')
        .update(updateData)
        .eq('id', existingApp.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating application:', updateError);
        return res.status(500).json({ error: 'Failed to update application' });
      }

      application = updatedApp;
    } else {
      isNewApplication = true;
      const { data: newApp, error: insertError } = await adminClient
        .from('partnership_applications')
        .insert({
          church_id: applicationData.church_id,
          user_id: userId,
          path: applicationData.path,
          applicant_name: applicationData.applicant_name,
          applicant_role: applicationData.applicant_role,
          applicant_email: applicationData.applicant_email,
          applicant_phone: applicationData.applicant_phone,
          has_authority_affirmation: applicationData.has_authority_affirmation,
          notes: applicationData.notes,
          status: 'new',
          submission_count: 1,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating partnership application:', insertError);
        return res.status(201).json({
          application: null,
          message: `Partnership interest recorded for ${church.name}. Full application tracking will be available once the database is updated.`
        });
      }

      application = newApp;

      const { error: submissionError } = await adminClient
        .from('partnership_application_submissions')
        .insert({
          application_id: newApp.id,
          path: applicationData.path,
          applicant_name: applicationData.applicant_name,
          applicant_role: applicationData.applicant_role,
          applicant_email: applicationData.applicant_email,
          applicant_phone: applicationData.applicant_phone,
          has_authority_affirmation: applicationData.has_authority_affirmation,
          notes: applicationData.notes,
          user_id: userId,
        });

      if (submissionError) {
        console.error('Error creating initial submission record:', submissionError);
      }
    }

    const newStatus = applicationData.path === 'explore' ? 'interest' : 'pending';
    
    try {
      const { error: updateError } = await adminClient
        .from('churches')
        .update({
          partnership_status: newStatus,
          partnership_updated_at: new Date().toISOString(),
        })
        .eq('id', applicationData.church_id);

      if (updateError) {
        console.error('Error updating church partnership status:', updateError);
      }
    } catch (err) {
      console.error('Exception updating church partnership status:', err);
    }

    return res.status(201).json({
      application,
      isNewApplication,
      message: isNewApplication 
        ? `Partnership application submitted successfully for ${church.name}. Church status updated to '${newStatus}'.`
        : `New submission added to existing application for ${church.name}.`
    });
  } catch (error) {
    console.error('Error in POST /api/partnership-applications:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
