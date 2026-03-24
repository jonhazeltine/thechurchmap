import { MapPin, MapPinOff, MessageSquareText, MessageSquareOff, Layers, HandHeart } from "lucide-react";

interface MapControlsProps {
  pinMode: 'all' | 'mapped' | 'hidden';
  mapOverlayMode: 'saturation' | 'boundaries' | 'off';
  prayerCoverageVisible: boolean;
  saturationTooltipVisible: boolean;
  onPinModeChange?: (mode: 'all' | 'mapped' | 'hidden') => void;
  onMapOverlayModeChange?: (mode: 'saturation' | 'boundaries' | 'off') => void;
  onPrayerCoverageVisibilityChange?: (visible: boolean) => void;
  onSaturationTooltipVisibilityChange?: (visible: boolean) => void;
}

export function MapControls({
  pinMode,
  mapOverlayMode,
  prayerCoverageVisible,
  saturationTooltipVisible,
  onPinModeChange,
  onMapOverlayModeChange,
  onPrayerCoverageVisibilityChange,
  onSaturationTooltipVisibilityChange,
}: MapControlsProps) {
  return (
    <>
      {/* Saturation legend */}
      {mapOverlayMode === 'saturation' && (
        <div className="absolute bottom-16 right-3 z-10 bg-background/90 backdrop-blur-sm border rounded-md px-3 py-2 shadow-sm" data-testid="saturation-legend">
          <p className="text-xs font-medium mb-1.5">Ministry Saturation</p>
          <div
            className="h-2.5 w-36 rounded-sm"
            style={{ background: 'linear-gradient(to right, #E0F2FE, #BAE6FD, #7DD3FC, #38BDF8, #0EA5E9, #0284C7, #0369A1, #075985)' }}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>No Coverage</span>
            <span>Full</span>
          </div>
        </div>
      )}

      {/* Control buttons */}
      <div className="absolute bottom-16 left-3 z-10 flex flex-col gap-1.5">
        {onPinModeChange && (
          <button
            onClick={() => {
              const next = pinMode === 'all' ? 'mapped' : pinMode === 'mapped' ? 'hidden' : 'all';
              onPinModeChange(next);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium backdrop-blur-sm border shadow-sm hover-elevate active-elevate-2 ${pinMode !== 'hidden' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background/90'}`}
            data-testid="button-toggle-pins-map"
          >
            {pinMode === 'hidden' ? <MapPinOff className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}
            {pinMode === 'all' ? 'All Pins' : pinMode === 'mapped' ? 'Mapped Only' : 'Pins Off'}
          </button>
        )}
        {onMapOverlayModeChange && (
          <button
            onClick={() => {
              const next = mapOverlayMode === 'saturation' ? 'boundaries' : mapOverlayMode === 'boundaries' ? 'off' : 'saturation';
              onMapOverlayModeChange(next);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium backdrop-blur-sm border shadow-sm hover-elevate active-elevate-2 ${mapOverlayMode !== 'off' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background/90'}`}
            data-testid="button-toggle-saturation-map"
          >
            <Layers className="w-3.5 h-3.5" />
            {mapOverlayMode === 'saturation' ? 'Saturation' : mapOverlayMode === 'boundaries' ? 'Boundaries' : 'Overlays Off'}
          </button>
        )}
        {onPrayerCoverageVisibilityChange && (
          <button
            onClick={() => onPrayerCoverageVisibilityChange(!prayerCoverageVisible)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium backdrop-blur-sm border shadow-sm hover-elevate active-elevate-2 ${prayerCoverageVisible ? 'bg-primary text-primary-foreground border-primary' : 'bg-background/90'}`}
            data-testid="button-toggle-prayer-coverage-map"
          >
            <HandHeart className="w-3.5 h-3.5" />
            {prayerCoverageVisible ? 'Prayer On' : 'Prayer'}
          </button>
        )}
        {onSaturationTooltipVisibilityChange && (
          <button
            onClick={() => onSaturationTooltipVisibilityChange(!saturationTooltipVisible)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium backdrop-blur-sm border shadow-sm hover-elevate active-elevate-2 ${saturationTooltipVisible ? 'bg-primary text-primary-foreground border-primary' : 'bg-background/90'}`}
            data-testid="button-toggle-tooltips-map"
          >
            {saturationTooltipVisible ? <MessageSquareOff className="w-3.5 h-3.5" /> : <MessageSquareText className="w-3.5 h-3.5" />}
            {saturationTooltipVisible ? 'Hide Tooltips' : 'Tooltips'}
          </button>
        )}
      </div>
    </>
  );
}
