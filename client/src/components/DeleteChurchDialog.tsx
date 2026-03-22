import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AlertTriangle, Trash2, Users, MessageSquare, MapPin, Tag, Heart } from "lucide-react";

interface DeletionImpact {
  churchName: string;
  prayers: number;
  prayerInteractions: number;
  posts: number;
  postComments: number;
  teamMembers: number;
  ministryAreas: number;
  callings: number;
  internalTags: number;
}

interface DeleteChurchDialogProps {
  churchId: string;
  churchName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

export function DeleteChurchDialog({
  churchId,
  churchName,
  open,
  onOpenChange,
  onDeleted,
}: DeleteChurchDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: impact, isLoading: impactLoading } = useQuery<DeletionImpact>({
    queryKey: ["/api/churches", churchId, "deletion-impact"],
    enabled: open,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/churches/${churchId}`);
    },
    onSuccess: () => {
      toast({
        title: "Church deleted",
        description: `${churchName} has been permanently deleted.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/churches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/churches"] });
      onOpenChange(false);
      onDeleted?.();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete church",
        variant: "destructive",
      });
    },
  });

  const handleDelete = () => {
    if (confirmText !== "DELETE") return;
    deleteMutation.mutate();
  };

  const totalAffectedItems = impact
    ? impact.prayers +
      impact.prayerInteractions +
      impact.posts +
      impact.postComments +
      impact.teamMembers +
      impact.ministryAreas +
      impact.callings +
      impact.internalTags
    : 0;

  const hasRelatedData = totalAffectedItems > 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete Church
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left space-y-4">
            <p>
              You are about to permanently delete{" "}
              <span className="font-semibold text-foreground">{churchName}</span>.
              This action cannot be undone.
            </p>

            {impactLoading ? (
              <div className="space-y-2 p-4 bg-muted/50 rounded-md">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : impact && hasRelatedData ? (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md space-y-3">
                <p className="font-medium text-destructive text-sm">
                  The following data will be permanently deleted:
                </p>
                <ul className="space-y-2 text-sm">
                  {impact.prayers > 0 && (
                    <li className="flex items-center gap-2">
                      <Heart className="h-4 w-4 text-muted-foreground" />
                      <span>
                        <strong>{impact.prayers}</strong> prayer request{impact.prayers !== 1 ? "s" : ""}
                        {impact.prayerInteractions > 0 && (
                          <span className="text-muted-foreground">
                            {" "}(with {impact.prayerInteractions} prayer interaction{impact.prayerInteractions !== 1 ? "s" : ""})
                          </span>
                        )}
                      </span>
                    </li>
                  )}
                  {impact.posts > 0 && (
                    <li className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      <span>
                        <strong>{impact.posts}</strong> community post{impact.posts !== 1 ? "s" : ""}
                        {impact.postComments > 0 && (
                          <span className="text-muted-foreground">
                            {" "}(with {impact.postComments} comment{impact.postComments !== 1 ? "s" : ""})
                          </span>
                        )}
                      </span>
                    </li>
                  )}
                  {impact.teamMembers > 0 && (
                    <li className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>
                        <strong>{impact.teamMembers}</strong> team member{impact.teamMembers !== 1 ? "s" : ""}
                      </span>
                    </li>
                  )}
                  {impact.ministryAreas > 0 && (
                    <li className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>
                        <strong>{impact.ministryAreas}</strong> ministry area{impact.ministryAreas !== 1 ? "s" : ""}
                      </span>
                    </li>
                  )}
                  {impact.callings > 0 && (
                    <li className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <span>
                        <strong>{impact.callings}</strong> calling assignment{impact.callings !== 1 ? "s" : ""}
                      </span>
                    </li>
                  )}
                  {impact.internalTags > 0 && (
                    <li className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <span>
                        <strong>{impact.internalTags}</strong> internal tag{impact.internalTags !== 1 ? "s" : ""}
                      </span>
                    </li>
                  )}
                </ul>
              </div>
            ) : (
              <div className="p-4 bg-muted/50 rounded-md">
                <p className="text-sm text-muted-foreground">
                  This church has no associated data and can be safely deleted.
                </p>
              </div>
            )}

            <div className="space-y-2 pt-2">
              <Label htmlFor="confirm-delete" className="text-sm font-medium">
                To confirm, type DELETE below:
              </Label>
              <Input
                id="confirm-delete"
                placeholder="DELETE"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="font-mono"
                data-testid="input-confirm-delete"
              />
              <p className="text-xs text-muted-foreground">
                Type exactly: <span className="font-mono font-medium">DELETE</span>
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={confirmText !== "DELETE" || deleteMutation.isPending}
            data-testid="button-confirm-delete"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {deleteMutation.isPending ? "Deleting..." : "Delete Church"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
