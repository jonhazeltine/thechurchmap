import { Button } from "@/components/ui/button";
import emptySearchImage from "@assets/generated_images/empty_search_results_illustration.png";
import drawLargerImage from "@assets/generated_images/draw_larger_polygon_suggestion.png";

interface EmptyStateProps {
  type: "no-results" | "no-polygon" | "unclaimed";
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ type, title, description, action }: EmptyStateProps) {
  const getImage = () => {
    switch (type) {
      case "no-results":
        return emptySearchImage;
      case "no-polygon":
        return drawLargerImage;
      case "unclaimed":
        return null;
      default:
        return emptySearchImage;
    }
  };

  const image = getImage();

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center" data-testid="empty-state">
      {image && (
        <img
          src={image}
          alt={title}
          className="w-64 h-auto mb-6 opacity-80"
        />
      )}
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground mb-6 max-w-md">{description}</p>
      {action && (
        <Button onClick={action.onClick} data-testid="button-empty-action">
          {action.label}
        </Button>
      )}
    </div>
  );
}
