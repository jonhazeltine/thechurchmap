import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Heart, Eye, Pencil, Trash2, Plus, PartyPopper, Sparkles } from "lucide-react";
import { IconBuildingChurch } from "@tabler/icons-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import { usePlatformContext } from "@/contexts/PlatformContext";

interface Prayer {
  id: string;
  title: string;
  body: string;
  is_anonymous: boolean;
  created_at: string;
  submitted_by_user_id: string;
  status: string;
  is_church_request?: boolean;
  answered_at?: string | null;
  answered_note?: string | null;
}

interface ChurchPrayersResponse {
  approved: Prayer[];
  pending_count: number;
  is_admin: boolean;
  answered_count?: number;
}

interface ChurchPrayersDisplayProps {
  churchId: string;
}

export function ChurchPrayersDisplay({ churchId }: ChurchPrayersDisplayProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { buildPlatformUrl } = usePlatformNavigation();
  const { platformId } = usePlatformContext();
  const [editPrayer, setEditPrayer] = useState<Prayer | null>(null);
  const [deletePrayer, setDeletePrayer] = useState<Prayer | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [showChurchPrayerDialog, setShowChurchPrayerDialog] = useState(false);
  const [churchPrayerTitle, setChurchPrayerTitle] = useState("");
  const [churchPrayerBody, setChurchPrayerBody] = useState("");

  const { data, isLoading, error } = useQuery<ChurchPrayersResponse>({
    queryKey: ["/api/churches", churchId, "prayers"],
    queryFn: () => fetch(`/api/churches/${churchId}/prayers`).then(res => {
      if (!res.ok) throw new Error("Failed to fetch prayers");
      return res.json();
    }),
  });

  const { data: answeredData } = useQuery<{ total: number }>({
    queryKey: ["/api/prayers/answered", churchId],
    queryFn: () => fetch(`/api/prayers/answered?church_id=${churchId}&limit=1`).then(res => {
      if (!res.ok) throw new Error("Failed to fetch answered prayers count");
      return res.json();
    }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ prayerId, title, body }: { prayerId: string; title: string; body: string }) => {
      return apiRequest("PATCH", `/api/admin/prayers/${prayerId}`, { title, body });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches", churchId, "prayers"] });
      setEditPrayer(null);
      toast({ title: "Prayer updated", description: "The prayer request has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update prayer request.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (prayerId: string) => {
      return apiRequest("DELETE", `/api/admin/prayers/${prayerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches", churchId, "prayers"] });
      setDeletePrayer(null);
      toast({ title: "Prayer deleted", description: "The prayer request has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete prayer request.", variant: "destructive" });
    },
  });

  const createChurchPrayerMutation = useMutation({
    mutationFn: async (data: { title: string; body: string }) => {
      return apiRequest("POST", `/api/churches/${churchId}/church-prayer-request`, {
        ...data,
        city_platform_id: platformId || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches", churchId, "prayers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayers/visible"] });
      setShowChurchPrayerDialog(false);
      setChurchPrayerTitle("");
      setChurchPrayerBody("");
      toast({ title: "Prayer request posted", description: "Your church prayer request is now visible to the community." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create prayer request.", variant: "destructive" });
    },
  });

  const handleChurchPrayerSubmit = () => {
    if (churchPrayerTitle.trim() && churchPrayerBody.trim()) {
      createChurchPrayerMutation.mutate({ 
        title: churchPrayerTitle.trim(), 
        body: churchPrayerBody.trim() 
      });
    }
  };

  const handleEditClick = (prayer: Prayer) => {
    setEditTitle(prayer.title);
    setEditBody(prayer.body);
    setEditPrayer(prayer);
  };

  const handleEditSave = () => {
    if (editPrayer && editTitle.trim() && editBody.trim()) {
      updateMutation.mutate({ prayerId: editPrayer.id, title: editTitle.trim(), body: editBody.trim() });
    }
  };

  const handleDeleteConfirm = () => {
    if (deletePrayer) {
      deleteMutation.mutate(deletePrayer.id);
    }
  };

  if (error) {
    return null; // Silently fail if prayers can't be loaded
  }

  const approvedPrayers = data?.approved || [];
  const pendingCount = data?.pending_count || 0;
  const isAdmin = data?.is_admin || false;

  // Don't show if no prayers and not admin
  if (approvedPrayers.length === 0 && !isAdmin) {
    return null;
  }

  return (
    <>
    <Card data-testid="card-church-prayers">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Heart className="w-5 h-5" />
              Prayer Requests
            </CardTitle>
            <CardDescription>
              {approvedPrayers.length === 0 
                ? "No prayer requests yet"
                : `${approvedPrayers.length} prayer${approvedPrayers.length === 1 ? "" : "s"}`
              }
            </CardDescription>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              {pendingCount > 0 && (
                <Badge variant="secondary" data-testid="badge-pending-count">
                  {pendingCount} pending
                </Badge>
              )}
              <Button 
                variant="default" 
                size="sm" 
                onClick={() => setShowChurchPrayerDialog(true)}
                data-testid="button-post-church-prayer"
              >
                <Plus className="w-4 h-4 mr-2" />
                Post Church Need
              </Button>
              <Button variant="outline" size="sm" asChild data-testid="button-view-all-prayers">
                <Link href={buildPlatformUrl("/admin/prayer")}>
                  <Eye className="w-4 h-4 mr-2" />
                  Manage
                </Link>
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3 border rounded-md space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-16 w-full" />
              </div>
            ))}
          </div>
        ) : approvedPrayers.length > 0 ? (
          <div className="space-y-3">
            {approvedPrayers.map((prayer) => (
              <div
                key={prayer.id}
                className={`p-3 border rounded-md space-y-2 hover-elevate ${
                  prayer.is_church_request 
                    ? 'bg-primary/5 border-primary/20' 
                    : ''
                }`}
                data-testid={`prayer-${prayer.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {prayer.is_church_request && (
                      <IconBuildingChurch className="w-4 h-4 text-primary flex-shrink-0" />
                    )}
                    <h4 className="font-medium text-sm truncate">{prayer.title}</h4>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Edit - only for the user who submitted the prayer */}
                    {user?.id === prayer.submitted_by_user_id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleEditClick(prayer)}
                        data-testid={`button-edit-prayer-${prayer.id}`}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                    {/* Delete - for admins OR the prayer owner */}
                    {(isAdmin || user?.id === prayer.submitted_by_user_id) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={() => setDeletePrayer(prayer)}
                        data-testid={`button-delete-prayer-${prayer.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(prayer.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {prayer.body}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  {prayer.answered_at && (
                    <Badge className="text-xs bg-amber-500 hover:bg-amber-600 text-white" data-testid={`badge-answered-${prayer.id}`}>
                      <PartyPopper className="w-3 h-3 mr-1" />
                      Answered
                    </Badge>
                  )}
                  {prayer.is_church_request && (
                    <Badge variant="default" className="text-xs">
                      Church Need
                    </Badge>
                  )}
                  {prayer.is_anonymous && !prayer.is_church_request && (
                    <Badge variant="secondary" className="text-xs">
                      Anonymous
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-md">
            No approved prayer requests yet
          </div>
        )}
        
        {/* Link to view answered prayers */}
        {(answeredData?.total ?? 0) > 0 && (
          <div className="mt-4 pt-4 border-t">
            <Link 
              href={`/church/${churchId}/answered-prayers`}
              className="flex items-center justify-center gap-2 text-sm text-amber-600 dark:text-amber-400 hover:underline"
              data-testid="link-view-answered-prayers"
            >
              <Sparkles className="w-4 h-4" />
              View {answeredData?.total} Answered Prayer{answeredData?.total !== 1 ? 's' : ''}
              <PartyPopper className="w-4 h-4" />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>

    {/* Edit Prayer Dialog */}
    <Dialog open={!!editPrayer} onOpenChange={(open) => !open && setEditPrayer(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Prayer Request</DialogTitle>
          <DialogDescription>
            Update the prayer request details below.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Prayer title"
              data-testid="input-edit-prayer-title"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-body">Prayer Request</Label>
            <Textarea
              id="edit-body"
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              placeholder="Prayer request details"
              rows={4}
              data-testid="input-edit-prayer-body"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setEditPrayer(null)}
            data-testid="button-cancel-edit-prayer"
          >
            Cancel
          </Button>
          <Button
            onClick={handleEditSave}
            disabled={updateMutation.isPending || !editTitle.trim() || !editBody.trim()}
            data-testid="button-save-prayer"
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Delete Prayer Confirmation */}
    <AlertDialog open={!!deletePrayer} onOpenChange={(open) => !open && setDeletePrayer(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Prayer Request</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this prayer request? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-delete-prayer">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeleteConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteMutation.isPending}
            data-testid="button-confirm-delete-prayer"
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Church Prayer Request Dialog */}
    <Dialog open={showChurchPrayerDialog} onOpenChange={setShowChurchPrayerDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconBuildingChurch className="w-5 h-5" />
            Post Church Prayer Need
          </DialogTitle>
          <DialogDescription>
            Share a prayer need on behalf of your church. This will be visible to the community immediately.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="church-prayer-title">Title</Label>
            <Input
              id="church-prayer-title"
              value={churchPrayerTitle}
              onChange={(e) => setChurchPrayerTitle(e.target.value)}
              placeholder="e.g., Building fund, Youth ministry support"
              data-testid="input-church-prayer-title"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="church-prayer-body">Prayer Request</Label>
            <Textarea
              id="church-prayer-body"
              value={churchPrayerBody}
              onChange={(e) => setChurchPrayerBody(e.target.value)}
              placeholder="Describe your church's prayer need..."
              rows={4}
              data-testid="input-church-prayer-body"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowChurchPrayerDialog(false);
              setChurchPrayerTitle("");
              setChurchPrayerBody("");
            }}
            data-testid="button-cancel-church-prayer"
          >
            Cancel
          </Button>
          <Button
            onClick={handleChurchPrayerSubmit}
            disabled={createChurchPrayerMutation.isPending || !churchPrayerTitle.trim() || !churchPrayerBody.trim()}
            data-testid="button-submit-church-prayer"
          >
            {createChurchPrayerMutation.isPending ? "Posting..." : "Post Prayer Need"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
  );
}
