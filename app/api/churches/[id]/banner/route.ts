import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import { canEditChurch } from "../../../../../lib/authMiddleware";
import multer from "multer";
import { promisify } from "util";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

const uploadMiddleware = promisify(upload.single("banner"));

const BUCKET_NAME = "church-banners";

async function ensureBucketExists(supabase: ReturnType<typeof supabaseServer>) {
  const { data: buckets } = await supabase.storage.listBuckets();
  const bucketExists = buckets?.some(b => b.name === BUCKET_NAME);
  
  if (!bucketExists) {
    const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    });
    if (error && !error.message.includes('already exists')) {
      console.error("Failed to create bucket:", error);
      throw new Error("Failed to initialize storage");
    }
  }
}

export async function POST(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const access = await canEditChurch(req, id);
    if (!access.allowed) {
      return res.status(access.authenticationFailed ? 401 : 403).json({
        error: access.reason || "Permission denied",
      });
    }

    await uploadMiddleware(req, res);

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const supabase = supabaseServer();

    await ensureBucketExists(supabase);

    const { data: church, error: fetchError } = await supabase
      .from("churches")
      .select("banner_image_url")
      .eq("id", id)
      .single();

    if (fetchError) throw fetchError;

    if (church?.banner_image_url) {
      try {
        const oldUrl = church.banner_image_url;
        const match = oldUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
        if (match) {
          const [, bucket, path] = match;
          await supabase.storage.from(bucket).remove([path]);
        }
      } catch (cleanupError) {
        console.warn("Failed to cleanup old banner:", cleanupError);
      }
    }

    const fileExt = file.originalname.split(".").pop() || "jpg";
    const fileName = `${id}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      throw new Error("Failed to upload banner");
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;

    const { error: updateError } = await supabase
      .from("churches")
      .update({ banner_image_url: publicUrl })
      .eq("id", id);

    if (updateError) {
      try {
        await supabase.storage.from(BUCKET_NAME).remove([fileName]);
      } catch (cleanupError) {
        console.error("Failed to cleanup uploaded file after DB error:", cleanupError);
      }
      throw updateError;
    }

    res.json({ banner_image_url: publicUrl });
  } catch (error: any) {
    console.error("Banner upload error:", error);
    res.status(400).json({ error: error.message || "Upload failed" });
  }
}

export async function DELETE(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const access = await canEditChurch(req, id);
    if (!access.allowed) {
      return res.status(access.authenticationFailed ? 401 : 403).json({
        error: access.reason || "Permission denied",
      });
    }

    const supabase = supabaseServer();

    const { data: church, error: fetchError } = await supabase
      .from("churches")
      .select("banner_image_url")
      .eq("id", id)
      .single();

    if (fetchError) throw fetchError;

    if (church?.banner_image_url) {
      try {
        const oldUrl = church.banner_image_url;
        const match = oldUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
        if (match) {
          const [, bucket, path] = match;
          await supabase.storage.from(bucket).remove([path]);
        }
      } catch (cleanupError) {
        console.warn("Failed to cleanup banner:", cleanupError);
      }
    }

    const { error: updateError } = await supabase
      .from("churches")
      .update({ banner_image_url: null })
      .eq("id", id);

    if (updateError) throw updateError;

    res.json({ success: true });
  } catch (error: any) {
    console.error("Banner delete error:", error);
    res.status(400).json({ error: error.message || "Delete failed" });
  }
}
