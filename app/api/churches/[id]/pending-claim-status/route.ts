import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";

export async function GET(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(200).json({ hasPendingClaim: false });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);

    if (authError || !user) {
      return res.status(200).json({ hasPendingClaim: false });
    }

    const { id: churchId } = req.params;

    const { data: pendingClaim, error } = await adminClient
      .from('church_claims')
      .select('id')
      .eq('church_id', churchId)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking pending claim status:', error);
      return res.status(200).json({ hasPendingClaim: false });
    }

    return res.status(200).json({
      hasPendingClaim: !!pendingClaim,
    });

  } catch (error) {
    console.error('Error in GET /api/churches/:id/pending-claim-status:', error);
    return res.status(200).json({ hasPendingClaim: false });
  }
}
