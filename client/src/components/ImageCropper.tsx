import { useState, useRef, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Loader2, ZoomIn, ZoomOut, Move } from "lucide-react";

interface ImageCropperProps {
  open: boolean;
  onClose: () => void;
  imageFile: File | null;
  aspectRatio: number;
  title: string;
  onCropComplete: (croppedBlob: Blob) => void;
  isUploading?: boolean;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 2;
const SCALE_STEP = 0.05;

export function ImageCropper({
  open,
  onClose,
  imageFile,
  aspectRatio,
  title,
  onCropComplete,
  isUploading = false,
}: ImageCropperProps) {
  const [imageUrl, setImageUrl] = useState<string>("");
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const canvasWidth = 560;
  const canvasHeight = Math.round(canvasWidth / aspectRatio);

  useEffect(() => {
    if (imageFile) {
      const url = URL.createObjectURL(imageFile);
      setImageUrl(url);
      setScale(1);
      setPosition({ x: 0, y: 0 });
      return () => URL.revokeObjectURL(url);
    } else {
      setImageUrl("");
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [imageFile]);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setNaturalSize({ width: naturalWidth, height: naturalHeight });
    
    const scaleToFitWidth = canvasWidth / naturalWidth;
    const scaleToFitHeight = canvasHeight / naturalHeight;
    const initialScale = Math.min(scaleToFitWidth, scaleToFitHeight, 1);
    
    setScale(initialScale);
    setPosition({ x: 0, y: 0 });
  }, [canvasWidth, canvasHeight]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP;
    setScale((prev) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta)));
  }, []);

  const handleScaleIn = () => {
    setScale((prev) => Math.min(MAX_SCALE, prev + SCALE_STEP));
  };

  const handleScaleOut = () => {
    setScale((prev) => Math.max(MIN_SCALE, prev - SCALE_STEP));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const generateCroppedImage = useCallback(async (): Promise<Blob | null> => {
    if (!imgRef.current || !naturalSize.width) return null;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const outputWidth = 1200;
    const outputHeight = Math.round(outputWidth / aspectRatio);
    
    canvas.width = outputWidth;
    canvas.height = outputHeight;

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, outputWidth, outputHeight);

    const displayScale = outputWidth / canvasWidth;
    
    const imgDisplayWidth = naturalSize.width * scale;
    const imgDisplayHeight = naturalSize.height * scale;
    
    const imgX = (canvasWidth - imgDisplayWidth) / 2 + position.x;
    const imgY = (canvasHeight - imgDisplayHeight) / 2 + position.y;
    
    const destX = imgX * displayScale;
    const destY = imgY * displayScale;
    const destWidth = imgDisplayWidth * displayScale;
    const destHeight = imgDisplayHeight * displayScale;

    ctx.drawImage(
      imgRef.current,
      0, 0, naturalSize.width, naturalSize.height,
      destX, destY, destWidth, destHeight
    );

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob),
        "image/jpeg",
        0.9
      );
    });
  }, [naturalSize, scale, position, aspectRatio, canvasWidth, canvasHeight]);

  const handleSave = async () => {
    const croppedBlob = await generateCroppedImage();
    if (croppedBlob) {
      onCropComplete(croppedBlob);
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      setImageUrl("");
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setNaturalSize({ width: 0, height: 0 });
      onClose();
    }
  };

  if (!imageFile) return null;

  const imgDisplayWidth = naturalSize.width * scale;
  const imgDisplayHeight = naturalSize.height * scale;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[650px]" data-testid="dialog-image-cropper">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div 
            className="relative bg-white rounded-md overflow-hidden border-2 border-dashed border-muted-foreground/30"
            style={{ 
              width: canvasWidth, 
              height: canvasHeight,
              cursor: isDragging ? 'grabbing' : 'grab'
            }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          >
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: 'linear-gradient(45deg, #f0f0f0 25%, transparent 25%), linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f0f0f0 75%), linear-gradient(-45deg, transparent 75%, #f0f0f0 75%)',
                backgroundSize: '20px 20px',
                backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
              }}
            />
            
            {imageUrl && (
              <img
                ref={imgRef}
                src={imageUrl}
                alt="Preview"
                onLoad={onImageLoad}
                draggable={false}
                className="absolute select-none"
                style={{
                  width: imgDisplayWidth || 'auto',
                  height: imgDisplayHeight || 'auto',
                  left: `calc(50% + ${position.x}px)`,
                  top: `calc(50% + ${position.y}px)`,
                  transform: 'translate(-50%, -50%)',
                  maxWidth: 'none',
                }}
              />
            )}
            
            <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
              <Move className="w-3 h-3" />
              Drag to position
            </div>
          </div>
          
          <div className="w-full flex items-center gap-3 px-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleScaleOut}
              disabled={scale <= MIN_SCALE}
              data-testid="button-zoom-out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Slider
              value={[scale]}
              min={MIN_SCALE}
              max={MAX_SCALE}
              step={SCALE_STEP}
              onValueChange={([value]) => setScale(value)}
              className="flex-1"
              data-testid="slider-zoom"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleScaleIn}
              disabled={scale >= MAX_SCALE}
              data-testid="button-zoom-in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground w-12 text-right">
              {Math.round(scale * 100)}%
            </span>
          </div>
          
          <p className="text-sm text-muted-foreground">
            Use slider to resize image, drag to position within the frame.
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isUploading}
            data-testid="button-cancel-crop"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isUploading || !naturalSize.width}
            data-testid="button-save-crop"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
