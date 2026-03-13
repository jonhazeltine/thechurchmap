import { useState, useRef, useCallback } from 'react';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Upload, X, Loader2, ImageIcon, Info } from 'lucide-react';
import { uploadMedia } from '@/lib/upload';
import { useToast } from '@/hooks/use-toast';

const ASPECT_RATIO = 4; // 4:1 aspect ratio
const MIN_WIDTH = 1600;
const MIN_HEIGHT = 400;
const OUTPUT_WIDTH = 3200;
const OUTPUT_HEIGHT = 800;

interface BannerUploaderProps {
  currentBannerUrl: string | null;
  onBannerChange: (url: string | null) => void;
  disabled?: boolean;
}

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight,
    ),
    mediaWidth,
    mediaHeight,
  );
}

export function BannerUploader({ currentBannerUrl, onBannerChange, disabled = false }: BannerUploaderProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  
  const [isUploading, setIsUploading] = useState(false);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [originalFile, setOriginalFile] = useState<File | null>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file",
        description: "Please select an image file (JPG, PNG, WebP).",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        if (img.width < MIN_WIDTH || img.height < MIN_HEIGHT) {
          toast({
            title: "Image too small",
            description: `Please use an image at least ${MIN_WIDTH}×${MIN_HEIGHT} pixels. Your image is ${img.width}×${img.height} pixels.`,
            variant: "destructive",
          });
          return;
        }
        setImageSrc(reader.result as string);
        setOriginalFile(file);
        setCropDialogOpen(true);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [toast]);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, ASPECT_RATIO));
  }, []);

  const getCroppedBlob = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const image = imgRef.current;
      if (!image || !crop) {
        resolve(null);
        return;
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }

      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;

      const pixelCrop = {
        x: (crop.x / 100) * image.width * scaleX,
        y: (crop.y / 100) * image.height * scaleY,
        width: (crop.width / 100) * image.width * scaleX,
        height: (crop.height / 100) * image.height * scaleY,
      };

      canvas.width = OUTPUT_WIDTH;
      canvas.height = OUTPUT_HEIGHT;

      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        OUTPUT_WIDTH,
        OUTPUT_HEIGHT
      );

      canvas.toBlob(
        (blob) => resolve(blob),
        'image/jpeg',
        0.9
      );
    });
  }, [crop]);

  const handleCropSave = useCallback(async () => {
    setIsUploading(true);
    
    try {
      const blob = await getCroppedBlob();
      if (!blob) {
        throw new Error('Failed to crop image');
      }

      const file = new File([blob], `banner-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const result = await uploadMedia(file);
      
      if (!result) {
        throw new Error('Upload failed');
      }

      onBannerChange(result.url);
      setCropDialogOpen(false);
      setImageSrc(null);
      setOriginalFile(null);
      
      toast({
        title: "Banner uploaded",
        description: "Your banner has been saved successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload banner",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [getCroppedBlob, onBannerChange, toast]);

  const handleRemove = useCallback(() => {
    onBannerChange(null);
  }, [onBannerChange]);

  const handleDialogClose = useCallback(() => {
    setCropDialogOpen(false);
    setImageSrc(null);
    setOriginalFile(null);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Community Banner</Label>
      </div>
      
      <div className="p-3 rounded-lg bg-muted/50 border border-dashed">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-foreground">Recommended size: 3200 × 800 pixels</p>
            <p>Minimum: 1600 × 400 pixels. Use a 4:1 aspect ratio for best results.</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {currentBannerUrl ? (
          <div className="relative w-full rounded-lg overflow-hidden border" style={{ aspectRatio: '4/1' }}>
            <img 
              src={currentBannerUrl} 
              alt="Current banner" 
              className="w-full h-full object-cover"
            />
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 h-7 w-7"
              onClick={handleRemove}
              disabled={disabled}
              data-testid="button-remove-banner"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div 
            className="w-full rounded-lg border-2 border-dashed flex items-center justify-center bg-muted cursor-pointer hover:bg-muted/80 transition-colors"
            style={{ aspectRatio: '4/1' }}
            onClick={() => !disabled && fileInputRef.current?.click()}
          >
            <div className="text-center py-4">
              <ImageIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Click to upload a banner</p>
            </div>
          </div>
        )}
        
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileSelect}
          data-testid="input-banner-file"
        />
        
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || isUploading}
          onClick={() => fileInputRef.current?.click()}
          data-testid="button-upload-banner"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              {currentBannerUrl ? 'Change Banner' : 'Upload Banner'}
            </>
          )}
        </Button>
      </div>

      <Dialog open={cropDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Crop Banner Image</DialogTitle>
            <DialogDescription>
              Drag to adjust the crop area. The highlighted region will be used as your banner.
            </DialogDescription>
          </DialogHeader>
          
          <div className="relative bg-muted rounded-lg overflow-hidden">
            {imageSrc && (
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                aspect={ASPECT_RATIO}
                minWidth={100}
                className="max-h-[60vh]"
              >
                <img 
                  ref={imgRef}
                  src={imageSrc} 
                  alt="Crop preview"
                  onLoad={onImageLoad}
                  className="max-w-full max-h-[60vh] object-contain"
                />
              </ReactCrop>
            )}
          </div>

          <div className="text-sm text-muted-foreground text-center">
            Final banner will be exported at {OUTPUT_WIDTH} × {OUTPUT_HEIGHT} pixels
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={handleDialogClose}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCropSave}
              disabled={isUploading || !crop}
              data-testid="button-save-crop"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Banner'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
