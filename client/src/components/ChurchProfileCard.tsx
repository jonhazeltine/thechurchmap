import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChurchHeader } from "./ChurchHeader";
import { type Church } from "@shared/schema";
import { MapPin, ExternalLink } from "lucide-react";

interface ChurchProfileCardProps {
  church: Church;
  onViewOnMap?: (church: Church) => void;
}

export function ChurchProfileCard({ church, onViewOnMap }: ChurchProfileCardProps) {
  return (
    <Card className="overflow-hidden" data-testid={`card-church-profile-${church.id}`}>
      {(church as any).profile_photo_url && (
        <div className="relative h-32 w-full overflow-hidden">
          <img
            src={(church as any).profile_photo_url}
            alt={church.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        </div>
      )}
      
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold truncate" data-testid="text-church-name">
              {church.name}
            </h3>
            {(church as any).denomination && (
              <Badge variant="secondary" className="mt-1" data-testid="badge-denomination">
                {(church as any).denomination}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {((church as any).city || (church as any).state) && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span data-testid="text-location">
              {[(church as any).city, (church as any).state].filter(Boolean).join(", ")}
            </span>
          </div>
        )}

        {(church as any).description && (
          <p className="text-sm text-muted-foreground line-clamp-2" data-testid="text-description">
            {(church as any).description}
          </p>
        )}

        <div className="flex gap-2 pt-2">
          {onViewOnMap && (
            <Button
              variant="default"
              size="sm"
              onClick={() => onViewOnMap(church)}
              className="flex-1"
              data-testid="button-view-on-map"
            >
              <MapPin className="w-4 h-4 mr-2" />
              View on Map
            </Button>
          )}
          {church.website && (
            <Button
              variant="outline"
              size="sm"
              asChild
              data-testid="button-visit-website"
            >
              <a href={church.website} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4" />
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
