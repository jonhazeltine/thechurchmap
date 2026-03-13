import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { MapPin, Plus, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MapPrayerPopoverProps {
  position: { x: number; y: number };
  label: string;
  onAddPrayer: () => void;
  onViewPrayers: () => void;
  onDismiss: () => void;
}

export function MapPrayerPopover({
  position,
  label,
  onAddPrayer,
  onViewPrayers,
  onDismiss,
}: MapPrayerPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onDismiss]);

  const popoverWidth = 220;
  const popoverHeight = 160;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = position.x - popoverWidth / 2;
  let top = position.y - popoverHeight - 16;

  if (left < 8) left = 8;
  if (left + popoverWidth > viewportWidth - 8) left = viewportWidth - popoverWidth - 8;
  if (top < 8) top = position.y + 16;
  if (top + popoverHeight > viewportHeight - 8) top = viewportHeight - popoverHeight - 8;

  return (
    <motion.div
      ref={popoverRef}
      initial={{ opacity: 0, scale: 0.9, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 8 }}
      transition={{ duration: 0.2 }}
      className="fixed z-[110] pointer-events-auto"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${popoverWidth}px`,
      }}
      data-testid="map-prayer-popover"
    >
      <div className="rounded-md bg-black/80 backdrop-blur-md border border-white/20 p-3 shadow-lg">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-sm font-medium text-white leading-tight truncate" data-testid="text-prayer-popover-label">
            {label}
          </p>
        </div>

        <div className="space-y-2">
          <Button
            variant="default"
            className="w-full gap-2 text-sm"
            size="sm"
            onClick={onAddPrayer}
            data-testid="button-add-prayer-here"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Prayer Request
          </Button>

          <Button
            variant="ghost"
            className="w-full gap-2 text-sm text-white/70 hover:text-white"
            size="sm"
            onClick={onViewPrayers}
            data-testid="button-view-prayers-here"
          >
            <Eye className="w-3.5 h-3.5" />
            View Prayers Here
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
