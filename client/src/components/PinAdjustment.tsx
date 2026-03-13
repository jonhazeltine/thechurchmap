import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MapPin, RotateCcw, Save, X, Move } from "lucide-react";
import { type ChurchWithCallings } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface PinAdjustmentProps {
  church: ChurchWithCallings;
  onEnterAdjustMode?: () => void;
  onExitAdjustMode?: () => void;
  isAdjustMode?: boolean;
  pendingPosition?: { lat: number; lng: number } | null;
  onSave?: () => void;
  onReset?: () => void;
}

export function PinAdjustment({ 
  church, 
  onEnterAdjustMode,
  onExitAdjustMode,
  isAdjustMode = false,
  pendingPosition,
  onSave,
  onReset
}: PinAdjustmentProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const hasDisplayOffset = church.display_lat !== null && church.display_lng !== null;
  const realLocation = church.location?.coordinates;

  const updateDisplayLocationMutation = useMutation({
    mutationFn: async (data: { display_lat: number | null; display_lng: number | null }) => {
      return await apiRequest("PATCH", `/api/churches/${church.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches", church.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/churches"] });
      toast({
        title: "Pin position updated",
        description: "The church pin has been repositioned on the map.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update pin position",
        variant: "destructive",
      });
    },
  });

  const handleSavePosition = async () => {
    if (!pendingPosition) return;
    
    setIsSaving(true);
    try {
      await updateDisplayLocationMutation.mutateAsync({
        display_lat: pendingPosition.lat,
        display_lng: pendingPosition.lng,
      });
      onSave?.();
      setOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPosition = async () => {
    setIsSaving(true);
    try {
      await updateDisplayLocationMutation.mutateAsync({
        display_lat: null,
        display_lng: null,
      });
      onReset?.();
      setOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEnterAdjustMode = () => {
    onEnterAdjustMode?.();
  };

  const handleExitAdjustMode = () => {
    onExitAdjustMode?.();
    setOpen(false);
  };

  if (!realLocation) {
    return null;
  }

  return (
    <Popover open={open || isAdjustMode} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          data-testid="button-pin-adjustment"
        >
          <MapPin className="w-4 h-4" />
          Pin Position
          {hasDisplayOffset && (
            <Badge variant="secondary" className="text-xs ml-1">
              Adjusted
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            <span className="font-medium text-sm">Pin Position</span>
          </div>
          
          {!isAdjustMode ? (
            <>
              <p className="text-xs text-muted-foreground">
                {hasDisplayOffset 
                  ? "Pin repositioned for visibility. Original location preserved for distance calculations."
                  : "Adjust pin position if it overlaps with other churches."}
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleEnterAdjustMode}
                  size="sm"
                  variant="outline"
                  className="w-full justify-start"
                  data-testid="button-enter-adjust-mode"
                >
                  <Move className="w-4 h-4 mr-2" />
                  {hasDisplayOffset ? "Readjust Pin" : "Adjust Pin"}
                </Button>
                {hasDisplayOffset && (
                  <Button
                    onClick={handleResetPosition}
                    size="sm"
                    variant="ghost"
                    className="w-full justify-start"
                    disabled={isSaving}
                    data-testid="button-reset-pin"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Reset to Original
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="bg-muted/50 rounded-md p-2 space-y-1">
                <Label className="text-xs font-medium">Adjustment Mode Active</Label>
                <p className="text-xs text-muted-foreground">
                  Drag the pin on the map to reposition.
                </p>
                {pendingPosition && (
                  <p className="text-xs text-primary">
                    New: {pendingPosition.lat.toFixed(4)}, {pendingPosition.lng.toFixed(4)}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSavePosition}
                  size="sm"
                  disabled={!pendingPosition || isSaving}
                  className="flex-1"
                  data-testid="button-save-pin-position"
                >
                  <Save className="w-4 h-4 mr-1" />
                  Save
                </Button>
                <Button
                  onClick={handleExitAdjustMode}
                  size="sm"
                  variant="ghost"
                  disabled={isSaving}
                  data-testid="button-cancel-adjust"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
