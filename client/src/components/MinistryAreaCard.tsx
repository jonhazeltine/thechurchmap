import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Users } from "lucide-react";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import { type MinistryAreaWithCalling, getColorForCallingType } from "@shared/schema";

interface MinistryAreaCardProps {
  area: MinistryAreaWithCalling;
  onShowOnMap: () => void;
  onHover?: (areaId: string | null) => void;
}

export function MinistryAreaCard({
  area,
  onShowOnMap,
  onHover,
}: MinistryAreaCardProps) {
  const { getChurchUrl } = usePlatformNavigation();
  const churchProfileLink = area.church_id ? getChurchUrl(area.church_id) : null;
  return (
    <Card className="p-2 space-y-1 overflow-hidden hover-elevate cursor-pointer" onClick={onShowOnMap} onMouseEnter={() => onHover?.(area.id)} onMouseLeave={() => onHover?.(null)}>
      <div className="flex-1 min-w-0">
        {area.church_name && (
          <p className="font-medium text-sm truncate">{area.church_name}</p>
        )}
        <p className="text-xs text-muted-foreground truncate">{area.name}</p>
      </div>

      {area.population != null && area.population > 0 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="w-3 h-3 flex-shrink-0" />
          <span>{area.population.toLocaleString()} people</span>
        </div>
      )}
      
      <div className="flex items-center gap-2 flex-wrap">
        {(area.calling_name || area.calling_type) && (
          <Badge 
            variant="secondary" 
            className="text-xs"
            style={{ 
              backgroundColor: area.calling_color ? `${area.calling_color}20` : undefined,
              borderColor: area.calling_color || undefined,
              borderWidth: '1px',
            }}
          >
            {area.calling_name || (area.calling_type ? area.calling_type.charAt(0).toUpperCase() + area.calling_type.slice(1) : '')}
          </Badge>
        )}
        {area.church_id && (
          <span className="text-xs text-muted-foreground">•</span>
        )}
        {churchProfileLink && (
          <Link 
            href={churchProfileLink}
            className="text-xs text-primary hover:underline"
            data-testid={`link-view-profile-${area.id}`}
          >
            View Profile
          </Link>
        )}
      </div>
    </Card>
  );
}
