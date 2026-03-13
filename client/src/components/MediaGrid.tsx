import { useState, useRef, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { X, ChevronLeft, ChevronRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.ogg', '.avi', '.mkv', '.m4v'];

function isVideoUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase().split('?')[0];
  return VIDEO_EXTENSIONS.some(ext => lowerUrl.endsWith(ext));
}

interface MediaGridProps {
  urls: string[];
  postId?: string;
  inline?: boolean;
}

function InlineVideo({ url, className, testId }: { 
  url: string; 
  className?: string; 
  testId?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const handlePlay = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPlaying(true);
  };

  if (playing) {
    return (
      <div className={cn("relative", className)} onClick={(e) => e.stopPropagation()} data-testid={testId}>
        <video
          ref={videoRef}
          src={url}
          controls
          autoPlay
          playsInline
          className="block w-full h-full object-contain bg-black"
          onEnded={() => setPlaying(false)}
        />
      </div>
    );
  }

  return (
    <div className={cn("relative group cursor-pointer", className)} onClick={handlePlay} data-testid={testId}>
      <video
        ref={videoRef}
        src={url}
        muted
        playsInline
        preload="metadata"
        className="block w-full h-full object-cover"
      />
      <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
        <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
          <Play className="w-6 h-6 text-white fill-white ml-0.5" />
        </div>
      </div>
    </div>
  );
}

function VideoThumbnail({ url, className, onClick, testId }: { 
  url: string; 
  className?: string; 
  onClick?: () => void;
  testId?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const handleLoadedData = useCallback(() => {
    setHasLoaded(true);
  }, []);

  return (
    <div className={cn("relative group", className)} onClick={onClick} data-testid={testId}>
      <video
        ref={videoRef}
        src={url}
        muted
        playsInline
        preload="metadata"
        onLoadedData={handleLoadedData}
        className="block w-full h-full object-cover"
      />
      <div className={cn(
        "absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30",
        !hasLoaded && "bg-muted"
      )}>
        <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
          <Play className="w-6 h-6 text-white fill-white ml-0.5" />
        </div>
      </div>
    </div>
  );
}

export function MediaGrid({ urls, postId, inline = false }: MediaGridProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!urls || urls.length === 0) return null;

  const displayUrls = urls.slice(0, 4);
  const extraCount = urls.length - 4;

  const openLightbox = (index: number) => {
    setCurrentIndex(index);
    setLightboxOpen(true);
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % urls.length);
  };

  const goToPrev = () => {
    setCurrentIndex((prev) => (prev - 1 + urls.length) % urls.length);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") goToNext();
    if (e.key === "ArrowLeft") goToPrev();
    if (e.key === "Escape") setLightboxOpen(false);
  };

  const gridClassName = cn(
    "grid rounded-xl overflow-hidden",
    urls.length === 1 && "grid-cols-1",
    urls.length === 2 && "grid-cols-2 gap-0.5",
    urls.length === 3 && "grid-cols-2 grid-rows-2 gap-0.5",
    urls.length >= 4 && "grid-cols-2 grid-rows-2 gap-0.5"
  );

  const currentUrl = urls[currentIndex];
  const currentIsVideo = isVideoUrl(currentUrl);

  return (
    <>
      <div className={gridClassName} data-testid={`media-grid-${postId || 'default'}`}>
        {displayUrls.map((url, index) => {
          const isFirstOf3 = urls.length === 3 && index === 0;
          const isLastImage = index === 3;
          const showOverlay = isLastImage && extraCount > 0;
          const urlIsVideo = isVideoUrl(url);

          if (inline && urlIsVideo && !showOverlay) {
            return (
              <div
                key={url}
                className={cn(
                  "relative overflow-hidden bg-black",
                  isFirstOf3 && "row-span-2",
                  urls.length === 1 ? "max-h-[500px]" : "aspect-square"
                )}
              >
                <InlineVideo
                  url={url}
                  className="w-full h-full"
                  testId={`media-item-${index}-${postId || 'default'}`}
                />
              </div>
            );
          }

          return (
            <div
              key={url}
              className={cn(
                "relative cursor-pointer overflow-hidden bg-card",
                isFirstOf3 && "row-span-2",
                urls.length === 1 ? "aspect-video max-h-[400px]" : "aspect-square"
              )}
              onClick={() => openLightbox(index)}
              data-testid={`media-item-${index}-${postId || 'default'}`}
            >
              {urlIsVideo ? (
                <VideoThumbnail
                  url={url}
                  className="w-full h-full"
                />
              ) : (
                <img
                  src={url}
                  alt={`Media ${index + 1}`}
                  className="block w-full h-full object-cover transition-all duration-300 hover:scale-[1.02]"
                  loading="lazy"
                />
              )}
              {showOverlay && (
                <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center transition-colors hover:bg-black/40">
                  <span className="text-white text-2xl font-bold">
                    +{extraCount}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent 
          className="max-w-4xl w-full p-0 bg-black/95 border-none"
          onKeyDown={handleKeyDown}
        >
          <div className="relative flex items-center justify-center min-h-[60vh]">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 text-white hover:bg-white/20 z-10"
              onClick={() => setLightboxOpen(false)}
              data-testid="button-close-lightbox"
            >
              <X className="h-6 w-6" />
            </Button>

            {urls.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-2 text-white hover:bg-white/20 z-10"
                  onClick={goToPrev}
                  data-testid="button-prev-image"
                >
                  <ChevronLeft className="h-8 w-8" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 text-white hover:bg-white/20 z-10"
                  onClick={goToNext}
                  data-testid="button-next-image"
                >
                  <ChevronRight className="h-8 w-8" />
                </Button>
              </>
            )}

            {currentIsVideo ? (
              <video
                key={currentUrl}
                src={currentUrl}
                controls
                autoPlay
                className="max-h-[80vh] max-w-full object-contain"
                data-testid="lightbox-video"
              />
            ) : (
              <img
                src={currentUrl}
                alt={`Media ${currentIndex + 1}`}
                className="max-h-[80vh] max-w-full object-contain"
                data-testid="lightbox-image"
              />
            )}

            {urls.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                {urls.map((_, idx) => (
                  <button
                    key={idx}
                    className={cn(
                      "w-2 h-2 rounded-full transition-colors",
                      idx === currentIndex ? "bg-white" : "bg-white/40"
                    )}
                    onClick={() => setCurrentIndex(idx)}
                    data-testid={`lightbox-dot-${idx}`}
                  />
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
