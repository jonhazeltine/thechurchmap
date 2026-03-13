import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ImageIcon, X, Loader2, Plus, Play } from 'lucide-react';
import { uploadMedia, UploadProgress } from '@/lib/upload';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.ogg', '.avi', '.mkv', '.m4v'];

function isVideoUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase().split('?')[0];
  return VIDEO_EXTENSIONS.some(ext => lowerUrl.endsWith(ext));
}

interface MultiFileUploadProps {
  onFilesChange: (urls: string[], hasVideo: boolean) => void;
  currentFiles: string[];
  maxFiles?: number;
  accept?: string;
  isAdmin?: boolean;
}

export function MultiFileUpload({ 
  onFilesChange, 
  currentFiles = [],
  maxFiles = 10,
  accept = 'image/*,video/*',
  isAdmin = false
}: MultiFileUploadProps) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = maxFiles - currentFiles.length;
    if (remainingSlots <= 0) {
      toast({
        title: 'Maximum files reached',
        description: `You can only upload up to ${maxFiles} files per post.`,
        variant: 'destructive',
      });
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    setUploading(true);
    setProgress(0);
    
    const newUrls: string[] = [];
    let hasVideo = currentFiles.some(url => isVideoUrl(url));
    const totalFiles = filesToUpload.length;

    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];
      
      const result = await uploadMedia(file, (prog: UploadProgress) => {
        if (prog.status === 'uploading') {
          const fileBaseProgress = (i / totalFiles) * 100;
          const fileContribution = (prog.progress / totalFiles);
          setProgress(Math.round(fileBaseProgress + fileContribution));
        }
        if (prog.status === 'error') {
          toast({
            title: 'Upload failed',
            description: prog.error || `Failed to upload ${file.name}`,
            variant: 'destructive',
          });
        }
      }, { isAdmin });

      if (result) {
        newUrls.push(result.url);
        if (file.type.startsWith('video/')) {
          hasVideo = true;
        }
      }
    }

    setUploading(false);
    setProgress(0);

    if (newUrls.length > 0) {
      const allUrls = [...currentFiles, ...newUrls];
      onFilesChange(allUrls, hasVideo);
      toast({
        title: 'Upload complete',
        description: `${newUrls.length} file(s) uploaded successfully.`,
      });
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    const newFiles = currentFiles.filter((_, i) => i !== index);
    const hasVideo = newFiles.some(url => isVideoUrl(url));
    onFilesChange(newFiles, hasVideo);
  };

  const canAddMore = currentFiles.length < maxFiles;

  return (
    <div className="space-y-3">
      {currentFiles.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {currentFiles.map((url, index) => (
            <div
              key={url}
              className="relative aspect-square rounded-md overflow-hidden bg-muted"
            >
              {isVideoUrl(url) ? (
                <div className="relative w-full h-full">
                  <video
                    src={url}
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
                      <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                    </div>
                  </div>
                </div>
              ) : (
                <img
                  src={url}
                  alt={`Upload ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              )}
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 hover:bg-black/80"
                onClick={() => removeFile(index)}
                data-testid={`button-remove-file-${index}`}
              >
                <X className="h-3 w-3 text-white" />
              </Button>
            </div>
          ))}
          
          {canAddMore && !uploading && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "aspect-square rounded-md border-2 border-dashed border-muted-foreground/30",
                "flex items-center justify-center hover:border-muted-foreground/50 transition-colors",
                "text-muted-foreground hover:text-foreground"
              )}
              data-testid="button-add-more-files"
            >
              <Plus className="h-6 w-6" />
            </button>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple
        onChange={handleFileChange}
        className="hidden"
        data-testid="input-multi-file-upload"
      />

      {currentFiles.length === 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          data-testid="button-upload-images"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Uploading {progress}%
            </>
          ) : (
            <>
              <ImageIcon className="h-4 w-4 mr-2" />
              Add Images/Video
            </>
          )}
        </Button>
      )}

      {uploading && currentFiles.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Uploading... {progress}%
        </div>
      )}

      {currentFiles.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {currentFiles.length} of {maxFiles} files uploaded
        </p>
      )}
    </div>
  );
}
