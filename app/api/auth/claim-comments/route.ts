import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../../lib/supabaseServer";

export async function POST(req: Request, res: Response) {
  try {
    const { token, type = 'comment' } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Require authentication
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const authToken = authHeader.substring(7);
    const userClient = supabaseUserClient(authToken);
    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid authentication token' });
    }

    const supabase = supabaseServer();
    let claimedCount = 0;

    if (type === 'prayer') {
      // Claim prayer
      console.log(`🔗 Claiming prayer for user ${user.id} with token ${token.substring(0, 8)}...`);

      const { data: updatedPrayers, error: updateError } = await supabase
        .from('prayers')
        .update({
          status: 'approved',
          submitted_by_user_id: user.id,
          anonymous_token: null,
          token_expires_at: null,
          approved_at: new Date().toISOString(),
          approved_by_user_id: user.id,
        })
        .eq('anonymous_token', token)
        .eq('status', 'pending')
        .gt('token_expires_at', new Date().toISOString())
        .select('id');

      if (updateError) {
        console.error('Error claiming prayer:', updateError);
        throw updateError;
      }

      claimedCount = updatedPrayers?.length || 0;
      console.log(`✅ Claimed ${claimedCount} prayer(s) for user ${user.id}`);
    } else {
      // Claim comment (default)
      console.log(`🔗 Claiming comments for user ${user.id} with token ${token.substring(0, 8)}...`);

      const { data: updatedComments, error: updateError } = await supabase
        .from('post_comments')
        .update({
          status: 'published',
          author_id: user.id,
          anonymous_token: null,
          token_expires_at: null,
        })
        .eq('anonymous_token', token)
        .eq('status', 'pending')
        .gt('token_expires_at', new Date().toISOString())
        .select('id');

      if (updateError) {
        console.error('Error claiming comments:', updateError);
        throw updateError;
      }

      claimedCount = updatedComments?.length || 0;
      console.log(`✅ Claimed ${claimedCount} comment(s) for user ${user.id}`);
    }

    res.json({
      success: true,
      claimed_count: claimedCount,
      type,
      message: claimedCount > 0 
        ? `Successfully claimed ${claimedCount} ${type}(s)` 
        : `No matching ${type}s found to claim`,
    });
  } catch (error: any) {
    console.error('POST /api/auth/claim-comments error:', error);
    res.status(500).json({ error: error.message });
  }
}
