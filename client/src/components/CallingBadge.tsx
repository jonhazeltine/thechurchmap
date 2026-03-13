import { Badge } from "@/components/ui/badge";
import { type Calling } from "@shared/schema";
import { cn } from "@/lib/utils";

interface CallingBadgeProps {
  calling: Calling;
  selected?: boolean;
  onClick?: () => void;
  size?: "sm" | "default";
}

export function CallingBadge({ calling, selected, onClick, size = "default" }: CallingBadgeProps) {
  // Get styles based on calling type - when selected, all types get filled backgrounds
  const getVariantStyles = () => {
    if (selected) {
      // All selected badges get filled backgrounds with their calling color
      switch (calling.type) {
        case "place":
          return "bg-[hsl(var(--calling-place))] text-white border-transparent";
        case "people":
          return "bg-[hsl(var(--calling-people))] text-white border-transparent";
        case "problem":
          return "bg-[hsl(var(--calling-problem))] text-white border-transparent";
        case "purpose":
          return "bg-[hsl(var(--calling-purpose))] text-white border-transparent";
        default:
          return "";
      }
    }
    
    // Unselected styles - All types get solid filled backgrounds with white text
    switch (calling.type) {
      case "place":
        return "bg-[hsl(var(--calling-place))] text-white border-transparent";
      case "people":
        return "bg-[hsl(var(--calling-people))] text-white border-transparent";
      case "problem":
        return "bg-[hsl(var(--calling-problem))] text-white border-transparent";
      case "purpose":
        return "bg-[hsl(var(--calling-purpose))] text-white border-transparent";
      default:
        return "";
    }
  };

  const Component = onClick ? "button" : "div";

  return (
    <Component
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-3 py-1 rounded-full border text-xs font-medium transition-all",
        getVariantStyles(),
        onClick && "cursor-pointer hover-elevate active-elevate-2",
        selected && "ring-2 ring-ring ring-offset-2",
        size === "sm" && "px-2 py-0.5 text-xs"
      )}
      data-testid={`badge-calling-${calling.id}`}
    >
      {selected && <span className="w-3 h-3">✓</span>}
      <span>{calling.name}</span>
    </Component>
  );
}
