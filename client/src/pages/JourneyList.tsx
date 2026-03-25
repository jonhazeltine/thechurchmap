import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useSafePlatformContext } from "@/contexts/PlatformContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { Plus, MapPin, ChevronRight, ChevronLeft, BookOpen, PenLine, Calendar, Share2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { PrayerJourney } from "@shared/schema";

export default function JourneyList() {
  const { session, user } = useAuth();
  const { platform: currentPlatform } = useSafePlatformContext();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [showDrafts, setShowDrafts] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PrayerJourney | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  const platformPrefix = currentPlatform ? `/${currentPlatform.slug}` : "";

  const { data: journeys = [], isLoading } = useQuery<PrayerJourney[]>({
    queryKey: ["journeys", currentPlatform?.id, showDrafts ? "draft" : "published"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (currentPlatform?.id) params.set("city_platform_id", currentPlatform.id);
      if (showDrafts && session) params.set("status", "draft");
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      const res = await fetch(`/api/journeys?${params}`, { headers });
      if (!res.ok) throw new Error("Failed to fetch journeys");
      return res.json();
    },
  });

  // Fetch boundary names for all tract_ids across all journeys
  const allTractIds = [...new Set(journeys.flatMap((j) => j.tract_ids))];
  const { data: boundaryNames = {} } = useQuery<Record<string, string>>({
    queryKey: ["boundary-names", allTractIds],
    queryFn: async () => {
      if (allTractIds.length === 0) return {};
      const params = new URLSearchParams();
      allTractIds.forEach((id) => params.append("ids", id));
      const res = await fetch(`/api/boundaries/by-ids?${params}`);
      if (!res.ok) return {};
      const data = await res.json();
      const map: Record<string, string> = {};
      for (const b of data) {
        map[b.id] = b.name || b.id;
      }
      return map;
    },
    enabled: allTractIds.length > 0,
  });

  const handleCreateJourney = async () => {
    if (!session?.access_token) {
      setLocation("/login");
      return;
    }
    if (!newTitle.trim()) return;
    try {
      const res = await fetch("/api/journeys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: newTitle.trim(),
          city_platform_id: currentPlatform?.id || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to create journey");
        return;
      }
      const journey = await res.json();
      setCreateDialogOpen(false);
      setNewTitle("");
      setLocation(`${platformPrefix}/journey/${journey.id}/builder`);
    } catch {
      alert("Failed to create journey");
    }
  };

  const handleDeleteJourney = async () => {
    if (!deleteTarget || !session?.access_token) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/journeys/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Error", description: err.error || "Failed to delete journey", variant: "destructive" });
        return;
      }
      toast({ title: "Journey deleted" });
      queryClient.invalidateQueries({ queryKey: ["journeys"] });
    } catch {
      toast({ title: "Error", description: "Failed to delete journey", variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const isExpired = (journey: PrayerJourney) => {
    if (!journey.expires_at) return false;
    return new Date(journey.expires_at) < new Date();
  };

  const formatDateRange = (journey: PrayerJourney) => {
    if (!journey.starts_at && !journey.expires_at) return null;
    const parts = [];
    if (journey.starts_at) parts.push(new Date(journey.starts_at).toLocaleDateString());
    if (journey.expires_at) parts.push(new Date(journey.expires_at).toLocaleDateString());
    return parts.join(" - ");
  };

  // Filter out expired journeys from published view (but show them in drafts for editing)
  const visibleJourneys = showDrafts
    ? journeys
    : journeys.filter((j) => !isExpired(j));

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => setLocation(platformPrefix ? `${platformPrefix}/map` : "/")}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Map
        </Button>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Prayer Journeys</h1>
            <p className="text-muted-foreground mt-1">
              Guided prayer experiences for your community
            </p>
          </div>
          {user && (
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Journey
            </Button>
          )}
        </div>

        {user && (
          <div className="flex gap-2 mb-6">
            <Button
              variant={showDrafts ? "outline" : "default"}
              size="sm"
              onClick={() => setShowDrafts(false)}
            >
              Published
            </Button>
            <Button
              variant={showDrafts ? "default" : "outline"}
              size="sm"
              onClick={() => setShowDrafts(true)}
            >
              My Drafts
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-5 bg-muted rounded w-3/4" />
                </CardHeader>
                <CardContent>
                  <div className="h-4 bg-muted rounded w-full mb-2" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : visibleJourneys.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">
                {showDrafts ? "No drafts yet" : "No prayer journeys yet"}
              </h3>
              <p className="text-muted-foreground mb-4">
                {showDrafts
                  ? "Create your first prayer journey to get started."
                  : "Prayer journeys will appear here once published."}
              </p>
              {user && (
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Journey
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {visibleJourneys.map((journey) => (
              <Card
                key={journey.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => {
                  if (showDrafts) {
                    setLocation(`${platformPrefix}/journey/${journey.id}/builder`);
                  } else {
                    setLocation(`${platformPrefix}/journey/${journey.id}`);
                  }
                }}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-start justify-between gap-2 text-base">
                    <span className="leading-snug">{journey.title}</span>
                    <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                      {/* Share button */}
                      {journey.share_token && !showDrafts && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const shareUrl = `${window.location.origin}/journey/${journey.share_token}`;
                            try {
                              await navigator.clipboard.writeText(shareUrl);
                              toast({ title: "Link copied", description: "Share link copied to clipboard." });
                            } catch {
                              // Fallback for contexts where clipboard API isn't available
                              const textArea = document.createElement("textarea");
                              textArea.value = shareUrl;
                              document.body.appendChild(textArea);
                              textArea.select();
                              document.execCommand("copy");
                              document.body.removeChild(textArea);
                              toast({ title: "Link copied", description: "Share link copied to clipboard." });
                            }
                          }}
                          title="Share journey"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {/* Edit + Delete buttons for owned journeys */}
                      {user && journey.created_by_user_id === user.id && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLocation(`${platformPrefix}/journey/${journey.id}/builder`);
                            }}
                            title="Edit journey"
                          >
                            <PenLine className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(journey);
                            }}
                            title="Delete journey"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {journey.description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {journey.description}
                    </p>
                  )}
                  {/* Show actual area names */}
                  {journey.tract_ids.length > 0 && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2 flex-wrap">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      {journey.tract_ids.map((id, i) => (
                        <span key={id}>
                          {boundaryNames[id] || id}
                          {i < journey.tract_ids.length - 1 ? "," : ""}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {formatDateRange(journey) && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDateRange(journey)}
                      </span>
                    )}
                    <span>
                      {showDrafts ? "Draft" : new Date(journey.published_at || journey.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Journey</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteTarget?.title}"? This will permanently remove the journey and all its steps. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteJourney} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete Journey"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Journey Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Prayer Journey</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Journey title (e.g., Pray for Downtown Grand Rapids)"
              onKeyDown={(e) => e.key === "Enter" && handleCreateJourney()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateJourney} disabled={!newTitle.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
