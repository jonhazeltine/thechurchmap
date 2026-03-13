import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

export const uploadMiddleware = upload.single('avatar');

export async function POST(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.replace('Bearer ', '');
    
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Generate unique filename with correct extension based on mimetype
    const mimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
    };
    const fileExt = mimeToExt[file.mimetype] || 'jpg';
    const fileName = `${user.id}-${Date.now()}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    // Upload to Supabase Storage using admin client
    const { data: uploadData, error: uploadError } = await adminClient.storage
      .from('profile-images')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) {
      console.error('Avatar upload error:', uploadError);
      // Check if bucket doesn't exist
      if (uploadError.message?.includes('Bucket not found')) {
        return res.status(500).json({ error: 'Storage not configured. Please contact support.' });
      }
      return res.status(500).json({ error: 'Failed to upload avatar' });
    }

    // Get public URL
    const { data: { publicUrl } } = adminClient.storage
      .from('profile-images')
      .getPublicUrl(filePath);

    // Update profile with new avatar URL (use admin client to avoid RLS policy issues)
    const { data: profile, error: updateError } = await adminClient
      .from('profiles')
      .update({
        avatar_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error('Profile update error:', updateError);
      return res.status(500).json({ error: 'Failed to update profile' });
    }

    res.json({ 
      success: true, 
      avatar_url: publicUrl,
      profile 
    });
  } catch (error: any) {
    console.error('POST /api/profile/avatar error:', error);
    res.status(500).json({ error: error.message });
  }
}
