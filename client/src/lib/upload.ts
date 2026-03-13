import { supabase } from '../../../lib/supabaseClient';
import * as tus from 'tus-js-client';

export interface UploadProgress {
  progress: number;
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

export interface UploadOptions {
  isAdmin?: boolean;
}

const ADMIN_MAX_SIZE = 500 * 1024 * 1024; // 500MB
const USER_MAX_SIZE = 100 * 1024 * 1024;  // 100MB
const TUS_THRESHOLD = 6 * 1024 * 1024;    // 6MB - use TUS for files larger than this
const TUS_CHUNK_SIZE = 6 * 1024 * 1024;   // 6MB chunks

function getSupabaseProjectId(): string {
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  const match = url.match(/https:\/\/([^.]+)\./);
  return match ? match[1] : '';
}

async function uploadWithTus(
  file: File,
  filePath: string,
  bucketName: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('You must be logged in to upload files');
  }

  const projectId = getSupabaseProjectId();
  if (!projectId) {
    throw new Error('Could not determine storage endpoint');
  }

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `https://${projectId}.supabase.co/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        'x-upsert': 'false',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: TUS_CHUNK_SIZE,
      metadata: {
        bucketName: bucketName,
        objectName: filePath,
        contentType: file.type,
        cacheControl: '3600',
      },
      onError: (error: any) => {
        console.error('TUS upload error:', error);
        const message = error?.message || 'Upload failed';
        reject(new Error(message));
      },
      onProgress: (bytesUploaded: number, bytesTotal: number) => {
        const percentage = Math.round((bytesUploaded / bytesTotal) * 100);
        onProgress?.({ progress: percentage, status: 'uploading' });
      },
      onSuccess: () => {
        resolve();
      },
    });

    upload.findPreviousUploads().then((previousUploads: any[]) => {
      if (previousUploads.length) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }
      upload.start();
    });
  });
}

export async function uploadMedia(
  file: File,
  onProgress?: (progress: UploadProgress) => void,
  options?: UploadOptions
): Promise<{ url: string; path: string } | null> {
  try {
    if (!file) {
      throw new Error('No file provided');
    }

    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      throw new Error('Only images and videos are allowed');
    }

    const maxSize = options?.isAdmin ? ADMIN_MAX_SIZE : USER_MAX_SIZE;
    const maxLabel = options?.isAdmin ? '500MB' : '100MB';
    if (file.size > maxSize) {
      throw new Error(`File size must be less than ${maxLabel}`);
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `uploads/${fileName}`;
    const bucketName = 'post-media';

    onProgress?.({ progress: 0, status: 'uploading' });

    if (file.size > TUS_THRESHOLD) {
      await uploadWithTus(file, filePath, bucketName, onProgress);
    } else {
      const { error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        if (error.message?.includes('Bucket not found')) {
          throw new Error('Storage not configured. Please contact support.');
        }
        throw error;
      }
    }

    onProgress?.({ progress: 100, status: 'success' });

    const { data: { publicUrl } } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    return {
      url: publicUrl,
      path: filePath
    };
  } catch (error: any) {
    console.error('Upload error:', error);
    onProgress?.({ progress: 0, status: 'error', error: error.message });
    return null;
  }
}

export async function deleteMedia(path: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage
      .from('post-media')
      .remove([path]);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Delete error:', error);
    return false;
  }
}
