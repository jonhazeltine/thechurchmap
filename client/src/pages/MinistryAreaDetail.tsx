import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { EditMinistryAreaDialog } from "@/components/EditMinistryAreaDialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, Edit, Trash2, MapPin, Building2, Calendar } from "lucide-react";
import { getCallingTypeColor, getCallingTypeLabel } from "@shared/schema";
import { format } from "date-fns";

interface AreaDetail {
  id: string;
  name: string;
  type: "neighborhood" | "corridor" | "church";
  calling_type?: "place" | "people" | "problem" | "purpose" | null;
  church_id?: string | null;
  church?: {
    id: string;
    name: string;
  };
  geometry?: any;
  created_at?: string;
  updated_at?: string;
}

export default function MinistryAreaDetail() {
  // Match both national route (/ministry-areas/:id) and platform-scoped route (/:platform/ministry-areas/:id)
  const [, paramsNational] = useRoute("/ministry-areas/:id");
  const [, paramsPlatform] = useRoute("/:platform/ministry-areas/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);

  const areaId = paramsNational?.id || paramsPlatform?.id;

  const { data: area, isLoading } = useQuery<AreaDetail>({
    queryKey: ["/api/ministry-areas", areaId],
    enabled: !!areaId,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/ministry-areas/${areaId}`, {});
    },
    onSuccess: () => {
      // Invalidate both list and detail queries to prevent stale data
      queryClient.invalidateQueries({ queryKey: ["/api/ministry-areas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ministry-areas", areaId] });
      queryClient.invalidateQueries({ queryKey: ["/api/areas"] });
      toast({
        title: "Ministry area deleted",
        description: "The ministry area has been removed.",
      });
      navigate("/ministry-areas");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDelete = () => {
    deleteMutation.mutate();
    setShowDeleteDialog(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Loading ministry area...</p>
      </div>
    );
  }

  if (!area) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <MapPin className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Ministry area not found</h2>
        <Button onClick={() => navigate("/ministry-areas")} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Ministry Areas
        </Button>
      </div>
    );
  }

  const callingColor = area.calling_type ? getCallingTypeColor(area.calling_type) : null;
  const callingLabel = area.calling_type ? getCallingTypeLabel(area.calling_type) : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => navigate("/ministry-areas")}
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setShowEditDialog(true)}
                data-testid="button-edit"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
              <Button
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
                data-testid="button-delete"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="space-y-6">
          {/* Title Section */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold" data-testid="text-area-name">{area.name}</h1>
                {callingColor && (
                  <div
                    className="w-6 h-6 rounded-full"
                    style={{ backgroundColor: callingColor }}
                    title={callingLabel || undefined}
                    data-testid="color-indicator"
                  />
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" data-testid="badge-type">{area.type}</Badge>
                {callingLabel && (
                  <Badge variant="secondary" data-testid="badge-calling">{callingLabel}</Badge>
                )}
              </div>
            </div>
          </div>

          {/* Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Type</p>
                  <p className="font-medium capitalize" data-testid="text-type">{area.type}</p>
                </div>
                {callingLabel && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Calling Type</p>
                    <p className="font-medium" data-testid="text-calling">{callingLabel}</p>
                  </div>
                )}
              </div>

              {area.church && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Assigned Church</p>
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <p className="font-medium" data-testid="text-church">{area.church.name}</p>
                  </div>
                </div>
              )}

              {area.created_at && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Created</p>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm" data-testid="text-created">
                      {format(new Date(area.created_at), "PPP")}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <p className="text-sm text-muted-foreground mb-1">Map Polygon</p>
                <p className="text-sm" data-testid="text-geometry">
                  {area.geometry ? (
                    <span className="text-green-600 dark:text-green-400">✓ Polygon defined</span>
                  ) : (
                    <span className="text-muted-foreground">No polygon yet</span>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Edit Dialog */}
      <EditMinistryAreaDialog
        area={area}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent data-testid="dialog-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Ministry Area</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{area.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
