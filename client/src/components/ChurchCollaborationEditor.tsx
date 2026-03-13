import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Pencil, Search, HandHeart, HandHelping, Check, X } from "lucide-react";
import { type ChurchWithCallings, type CollaborationTag } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { cn } from "@/lib/utils";

interface ChurchCollaborationEditorProps {
  church: ChurchWithCallings;
}

export function ChurchCollaborationEditor({ church }: ChurchCollaborationEditorProps) {
  const { toast } = useToast();
  const { isSuperAdmin, isPlatformAdmin, churchAdminChurchIds } = useAdminAccess();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingHave, setPendingHave] = useState<string[]>([]);
  const [pendingNeed, setPendingNeed] = useState<string[]>([]);

  const canEdit = isSuperAdmin || isPlatformAdmin || churchAdminChurchIds.includes(church.id);

  const { data: taxonomyData, isLoading: taxonomyLoading, error: taxonomyError } = useQuery<{ tags: CollaborationTag[] }>({
    queryKey: ["/api/collaboration-taxonomy"],
    staleTime: 5 * 60 * 1000,
  });

  const updateCollaborationMutation = useMutation({
    mutationFn: async (data: { collaboration_have: string[]; collaboration_need: string[] }) => {
      return await apiRequest("PATCH", `/api/churches/${church.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches", church.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/churches"] });
      setDialogOpen(false);
      toast({
        title: "Updated",
        description: "Collaboration preferences saved",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update collaboration tags",
        variant: "destructive",
      });
    },
  });

  const activeTags = useMemo(
    () => (taxonomyData?.tags || []).filter(tag => tag.is_active),
    [taxonomyData]
  );

  const getTagLabel = (slug: string): string => {
    const tag = activeTags.find(t => t.slug === slug);
    return tag?.label || slug;
  };

  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) return activeTags;
    const q = searchQuery.toLowerCase();
    return activeTags.filter(
      tag => tag.label.toLowerCase().includes(q) || tag.slug.toLowerCase().includes(q)
    );
  }, [activeTags, searchQuery]);

  const openDialog = () => {
    setPendingHave([...(church.collaboration_have || [])]);
    setPendingNeed([...(church.collaboration_need || [])]);
    setSearchQuery("");
    setDialogOpen(true);
  };

  const toggleOffer = (slug: string) => {
    setPendingHave(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
    );
  };

  const toggleNeed = (slug: string) => {
    setPendingNeed(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
    );
  };

  const handleSave = () => {
    updateCollaborationMutation.mutate({
      collaboration_have: pendingHave,
      collaboration_need: pendingNeed,
    });
  };

  const removeTag = (slug: string, type: "have" | "need") => {
    const updatedHave = type === "have"
      ? (church.collaboration_have || []).filter(s => s !== slug)
      : (church.collaboration_have || []);
    const updatedNeed = type === "need"
      ? (church.collaboration_need || []).filter(s => s !== slug)
      : (church.collaboration_need || []);
    updateCollaborationMutation.mutate({
      collaboration_have: updatedHave,
      collaboration_need: updatedNeed,
    });
  };

  const hasOffer = (church.collaboration_have?.length ?? 0) > 0;
  const hasNeed = (church.collaboration_need?.length ?? 0) > 0;
  const hasAny = hasOffer || hasNeed;
  const totalSelections = pendingHave.length + pendingNeed.length;

  if (taxonomyLoading) {
    return (
      <Card data-testid="card-collaboration-editor">
        <CardHeader>
          <CardTitle>Collaboration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (taxonomyError) {
    return (
      <Card data-testid="card-collaboration-editor">
        <CardHeader>
          <CardTitle>Collaboration</CardTitle>
          <p className="text-sm text-destructive mt-1" data-testid="error-taxonomy-load">
            Unable to load collaboration options.
          </p>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/collaboration-taxonomy"] })}
            variant="outline"
            data-testid="button-retry-taxonomy"
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card data-testid="card-collaboration-editor">
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>Collaboration</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Partner with nearby churches by sharing strengths
            </p>
          </div>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={openDialog}
              data-testid="button-edit-collaboration"
            >
              <Pencil className="w-3.5 h-3.5 mr-1.5" />
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasAny && (
            <p className="text-sm text-muted-foreground" data-testid="text-no-collaboration">
              {canEdit
                ? "No collaboration preferences set yet. Click Edit to get started."
                : "No collaboration preferences set yet."}
            </p>
          )}

          {hasOffer && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <HandHeart className="w-3.5 h-3.5 text-emerald-600" />
                <Label className="text-sm font-medium">We Offer</Label>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(church.collaboration_have || []).map((slug) => (
                  <Badge
                    key={`have-${slug}`}
                    variant="secondary"
                    className={canEdit ? "pr-1 gap-1" : ""}
                    data-testid={`chip-have-${slug}`}
                  >
                    {getTagLabel(slug)}
                    {canEdit && (
                      <button
                        onClick={() => removeTag(slug, "have")}
                        className="ml-0.5 rounded-full p-0.5 opacity-60 hover:opacity-100 transition-opacity"
                        disabled={updateCollaborationMutation.isPending}
                        data-testid={`button-remove-have-${slug}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {hasNeed && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <HandHelping className="w-3.5 h-3.5 text-blue-600" />
                <Label className="text-sm font-medium">We Need</Label>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(church.collaboration_need || []).map((slug) => (
                  <Badge
                    key={`need-${slug}`}
                    variant="secondary"
                    className={canEdit ? "pr-1 gap-1" : ""}
                    data-testid={`chip-need-${slug}`}
                  >
                    {getTagLabel(slug)}
                    {canEdit && (
                      <button
                        onClick={() => removeTag(slug, "need")}
                        className="ml-0.5 rounded-full p-0.5 opacity-60 hover:opacity-100 transition-opacity"
                        disabled={updateCollaborationMutation.isPending}
                        data-testid={`button-remove-need-${slug}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Collaboration</DialogTitle>
            <DialogDescription>
              For each ministry, mark whether your church can offer it or needs help with it. You can select both.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search ministries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-collaboration"
            />
          </div>

          <ScrollArea className="flex-1 min-h-0 max-h-[50vh] pr-3">
            <div className="space-y-1">
              {filteredTags.map((tag) => {
                const isOffer = pendingHave.includes(tag.slug);
                const isNeed = pendingNeed.includes(tag.slug);

                return (
                  <div
                    key={tag.slug}
                    className="flex items-center justify-between gap-2 py-2 px-2 rounded-md hover-elevate"
                    data-testid={`row-collab-${tag.slug}`}
                  >
                    <span className="text-sm flex-1 min-w-0 truncate">{tag.label}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge
                        variant="outline"
                        className={cn(
                          "cursor-pointer transition-all",
                          isOffer 
                            ? "bg-emerald-100 border-emerald-500 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" 
                            : "border-muted-foreground/30 text-muted-foreground"
                        )}
                        onClick={() => toggleOffer(tag.slug)}
                        data-testid={`toggle-offer-${tag.slug}`}
                      >
                        {isOffer && <Check className="w-3 h-3 mr-0.5" />}
                        Offer
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          "cursor-pointer transition-all",
                          isNeed 
                            ? "bg-amber-100 border-amber-500 text-amber-700 dark:bg-amber-900 dark:text-amber-300" 
                            : "border-muted-foreground/30 text-muted-foreground"
                        )}
                        onClick={() => toggleNeed(tag.slug)}
                        data-testid={`toggle-need-${tag.slug}`}
                      >
                        {isNeed && <Check className="w-3 h-3 mr-0.5" />}
                        Need
                      </Badge>
                    </div>
                  </div>
                );
              })}

              {filteredTags.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6" data-testid="text-no-collaboration-results">
                  No ministries match your search.
                </p>
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="flex flex-row items-center justify-between gap-2 pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              {totalSelections > 0
                ? `${pendingHave.length} offered, ${pendingNeed.length} needed`
                : "No selections yet"}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                data-testid="button-cancel-collaboration"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={updateCollaborationMutation.isPending}
                data-testid="button-save-collaboration"
              >
                {updateCollaborationMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
