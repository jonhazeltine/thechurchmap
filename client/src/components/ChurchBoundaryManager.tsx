import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BoundarySearch } from "@/components/BoundarySearch";
import { Trash2, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ChurchWithCallings } from "@shared/schema";

interface BoundarySearchResult {
  id: string;
  name: string;
  type: string;
}

interface ChurchBoundaryManagerProps {
  church: ChurchWithCallings;
  onHoverBoundary?: (boundaryId: string | null) => void;
}

export function ChurchBoundaryManager({ church, onHoverBoundary }: ChurchBoundaryManagerProps) {
  const { toast } = useToast();
  const { isSuperAdmin, isPlatformAdmin } = useAdminAccess();
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Platform boundaries are admin-only - church admins cannot modify these
  // (Ministry areas are separate and church admins can edit those)
  const canEdit = isSuperAdmin || isPlatformAdmin;

  const attachBoundaryMutation = useMutation({
    mutationFn: async (boundary: BoundarySearchResult) => {
      const currentIds = church.boundary_ids || [];
      
      // Don't add duplicates
      if (currentIds.includes(boundary.id)) {
        throw new Error("This boundary is already attached");
      }

      return apiRequest("PATCH", `/api/churches/${church.id}`, {
        boundary_ids: [...currentIds, boundary.id],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches", church.id] });
      toast({
        title: "Boundary attached",
        description: "The boundary has been attached to this church.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const removeBoundaryMutation = useMutation({
    mutationFn: async (boundaryId: string) => {
      const currentIds = church.boundary_ids || [];
      const newIds = currentIds.filter((id) => id !== boundaryId);

      return apiRequest("PATCH", `/api/churches/${church.id}`, {
        boundary_ids: newIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches", church.id] });
      setRemovingId(null);
      toast({
        title: "Boundary removed",
        description: "The boundary has been removed from this church.",
      });
    },
    onError: (error: Error) => {
      setRemovingId(null);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAttach = (boundary: BoundarySearchResult) => {
    attachBoundaryMutation.mutate(boundary);
  };

  const handleRemove = (boundaryId: string) => {
    setRemovingId(boundaryId);
    removeBoundaryMutation.mutate(boundaryId);
  };

  const attachedBoundaries = church.boundaries || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Boundary Areas</CardTitle>
        <CardDescription>
          Search and attach boundaries from datasets (cities, ZIP codes, neighborhoods)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canEdit && (
          <BoundarySearch
            onSelect={handleAttach}
            onHover={onHoverBoundary}
          />
        )}

        {attachedBoundaries.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Attached Boundaries</div>
            <div className="space-y-2">
              {attachedBoundaries.map((boundary) => (
                <div
                  key={boundary.id}
                  className="flex items-center justify-between p-3 rounded-md border bg-card"
                  onMouseEnter={() => onHoverBoundary?.(boundary.id)}
                  onMouseLeave={() => onHoverBoundary?.(null)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{boundary.name}</div>
                      <Badge variant="outline" className="mt-1">
                        {boundary.type}
                      </Badge>
                    </div>
                  </div>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(boundary.id)}
                      disabled={removingId === boundary.id}
                      data-testid={`button-remove-boundary-${boundary.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {attachedBoundaries.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
            No boundaries attached yet. Search above to add one.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
