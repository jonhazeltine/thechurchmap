import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ImageIcon, X, Loader2 } from 'lucide-react';
import { uploadMedia, UploadProgress } from '@/lib/upload';
import { useToast } from '@/hooks/use-toast';

interface FileUploadProps {
  onUploadComplete: (url: string, type: 'image' | 'video') => void;
  onRemove?: () => void;
  currentUrl?: string;
  accept?: string;
  isAdmin?: boolean;
}

export function FileUpload({ 
  onUploadComplete, 
  onRemove,
  currentUrl,
  accept = 'image/*,video/*',
  isAdmin = false
}: FileUploadProps) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    const result = await uploadMedia(file, (prog: UploadProgress) => {
      setProgress(prog.progress);
      
      if (prog.status === 'error') {
        toast({
          title: 'Upload failed',
          description: prog.error || 'Failed to upload file',
          variant: 'destructive',
        });
        setUploading(false);
      }
    }, { isAdmin });

    setUploading(false);

    if (result) {
      const mediaType = file.type.startsWith('image/') ? 'image' : 'video';
      onUploadComplete(result.url, mediaType);
      toast({
        title: 'Upload complete',
        description: 'Your file has been uploaded successfully.',
      });
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-2">
      {!currentUrl && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            onChange={handleFileChange}
            className="hidden"
            data-testid="input-file-upload"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            data-testid="button-upload-image"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {progress}%
              </>
            ) : (
              <>
                <ImageIcon className="h-4 w-4 mr-2" />
                Add Image/Video
              </>
            )}
          </Button>
        </>
      )}

      {currentUrl && (
        <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/30">
          <span className="text-sm text-muted-foreground truncate max-w-[200px]">
            Media attached
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            data-testid="button-remove-media"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
