import type { Request, Response } from 'express';
import { supabaseServer } from '../../../../lib/supabaseServer';

export async function POST(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is super admin
    const { data: userData } = await adminClient.auth.admin.getUserById(user.id);
    const isSuperAdmin = userData?.user?.user_metadata?.super_admin === true;

    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Only super admins can run this fix' });
    }

    // Update the check constraint to include 'released'
    const { error: dropError } = await adminClient.rpc('exec_sql', {
      query: `ALTER TABLE church_claims DROP CONSTRAINT IF EXISTS church_claims_status_check;`
    });

    if (dropError) {
      console.error('Error dropping constraint:', dropError);
    }

    const { error: addError } = await adminClient.rpc('exec_sql', {
      query: `ALTER TABLE church_claims ADD CONSTRAINT church_claims_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'archived', 'released'));`
    });

    if (addError) {
      console.error('Error adding constraint:', addError);
      return res.status(500).json({ error: 'Failed to update constraint', details: addError });
    }

    return res.status(200).json({ message: 'Constraint updated successfully' });

  } catch (error) {
    console.error('Error in fix-claim-status-constraint:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
