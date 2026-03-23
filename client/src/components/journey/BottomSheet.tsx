import { useRef, useEffect, useCallback, useState, type ReactNode } from "react";

interface BottomSheetProps {
  children: ReactNode;
  /** 0 = collapsed (peek), 1 = half, 2 = expanded */
  snapIndex?: number;
  onSnapChange?: (index: number) => void;
  /** Heights as vh percentages for each snap point */
  snapPoints?: [number, number, number];
}

/**
 * Draggable bottom sheet with three snap points:
 *  0 – collapsed/peek  (~15 vh)
 *  1 – half            (~45 vh)
 *  2 – expanded        (~85 vh)
 */
export default function BottomSheet({
  children,
  snapIndex = 1,
  onSnapChange,
  snapPoints = [15, 45, 85],
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    startY: number;
    startHeight: number;
    isDragging: boolean;
  } | null>(null);
  const [currentHeight, setCurrentHeight] = useState(snapPoints[snapIndex]);
  const [isDragging, setIsDragging] = useState(false);

  // Update height when snapIndex changes externally (e.g. new step auto-pops)
  useEffect(() => {
    if (!isDragging) {
      setCurrentHeight(snapPoints[snapIndex]);
    }
  }, [snapIndex, snapPoints, isDragging]);

  const snapToNearest = useCallback(
    (heightVh: number, velocity: number) => {
      // If swiped fast, snap in swipe direction
      let targetIndex: number;
      if (Math.abs(velocity) > 0.3) {
        if (velocity > 0) {
          // Swiping down → smaller
          targetIndex = snapPoints.findIndex((_, i) => snapPoints[i] < heightVh) !== -1
            ? Math.max(0, snapPoints.reduce((best, sp, i) => sp < heightVh ? i : best, 0))
            : 0;
        } else {
          // Swiping up → larger
          targetIndex = snapPoints.reduce((best, sp, i) => sp > heightVh ? (best === -1 ? i : best) : best, -1);
          if (targetIndex === -1) targetIndex = snapPoints.length - 1;
        }
      } else {
        // Snap to closest
        targetIndex = snapPoints.reduce(
          (best, sp, i) =>
            Math.abs(sp - heightVh) < Math.abs(snapPoints[best] - heightVh) ? i : best,
          0
        );
      }
      setCurrentHeight(snapPoints[targetIndex]);
      onSnapChange?.(targetIndex);
    },
    [snapPoints, onSnapChange]
  );

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    dragState.current = {
      startY: touch.clientY,
      startHeight: currentHeight,
      isDragging: true,
    };
    setIsDragging(true);
  }, [currentHeight]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragState.current) return;
    const touch = e.touches[0];
    const deltaY = dragState.current.startY - touch.clientY;
    const deltaVh = (deltaY / window.innerHeight) * 100;
    const newHeight = Math.max(
      snapPoints[0] - 5,
      Math.min(snapPoints[snapPoints.length - 1] + 5, dragState.current.startHeight + deltaVh)
    );
    setCurrentHeight(newHeight);
  }, [snapPoints]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!dragState.current) return;
    const touch = e.changedTouches[0];
    const deltaY = dragState.current.startY - touch.clientY;
    const velocity = deltaY / window.innerHeight; // negative = swipe down
    snapToNearest(currentHeight, -velocity); // flip sign: positive velocity = going down
    dragState.current = null;
    setIsDragging(false);
  }, [currentHeight, snapToNearest]);

  // Mouse support for desktop testing
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragState.current = {
      startY: e.clientY,
      startHeight: currentHeight,
      isDragging: true,
    };
    setIsDragging(true);

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const deltaY = dragState.current.startY - ev.clientY;
      const deltaVh = (deltaY / window.innerHeight) * 100;
      const newHeight = Math.max(
        snapPoints[0] - 5,
        Math.min(snapPoints[snapPoints.length - 1] + 5, dragState.current.startHeight + deltaVh)
      );
      setCurrentHeight(newHeight);
    };

    const handleMouseUp = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const deltaY = dragState.current.startY - ev.clientY;
      const velocity = deltaY / window.innerHeight;
      snapToNearest(currentHeight, -velocity);
      dragState.current = null;
      setIsDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [currentHeight, snapPoints, snapToNearest]);

  return (
    <div
      ref={sheetRef}
      className="absolute bottom-0 left-0 right-0 bg-background/75 backdrop-blur-lg rounded-t-2xl shadow-[0_-4px_30px_rgba(0,0,0,0.15)] flex flex-col overflow-hidden z-20"
      style={{
        height: `${currentHeight}vh`,
        transition: isDragging ? "none" : "height 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
        willChange: "height",
      }}
    >
      {/* Drag handle */}
      <div
        className="flex-shrink-0 flex items-center justify-center py-3 cursor-grab active:cursor-grabbing touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        <div className="w-10 h-1.5 rounded-full bg-muted-foreground/30" />
      </div>

      {/* Content area — scrollable */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        {children}
      </div>
    </div>
  );
}
