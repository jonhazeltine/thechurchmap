import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { AdminLayout } from "@/components/AdminLayout";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Loader2, 
  Check, 
  X, 
  Clock, 
  Building, 
  User, 
  MapPin,
  FileEdit,
  CheckCircle,
  XCircle,
  ArrowRight,
  AlertCircle,
  Inbox,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface PendingProfileSubmission {
  id: string;
  church_id: string;
  submitted_data: Record<string, any>;
  submitted_by: string | null;
  created_at: string;
  church: {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    address: string | null;
  } | null;
  submitter: {
    id: string;
    full_name: string | null;
    first_name: string | null;
    avatar_url: string | null;
    email?: string | null;
  } | null;
}

interface SubmissionDetail extends PendingProfileSubmission {
  church: {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    description: string | null;
    denomination: string | null;
    logo_url: string | null;
    banner_url: string | null;
    service_times: any;
    social_links: any;
  } | null;
}

export default function ProfilesPending() {
  const { toast } = useToast();
  const { isSuperAdmin, isPlatformAdmin, isLoading: accessLoading } = useAdminAccess();
  
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionDetail | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | null>(null);

  const hasAccess = isSuperAdmin || isPlatformAdmin;

  const { data: submissions, isLoading, error } = useQuery<PendingProfileSubmission[]>({
    queryKey: ["/api/admin/profiles-pending"],
    enabled: hasAccess,
  });

  const { data: submissionDetail, isLoading: detailLoading } = useQuery<SubmissionDetail>({
    queryKey: ["/api/admin/profiles-pending", selectedSubmission?.id],
    enabled: !!selectedSubmission?.id && reviewDialogOpen,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approve" | "reject" }) => {
      return apiRequest("PATCH", `/api/admin/profiles-pending/${id}`, { action });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/profiles-pending"] });
      setReviewDialogOpen(false);
      setSelectedSubmission(null);
      toast({
        title: variables.action === "approve" ? "Changes Approved" : "Submission Rejected",
        description: variables.action === "approve" 
          ? "The profile changes have been applied to the church."
          : "The submission has been rejected and discarded.",
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

  const handleReviewClick = (submission: PendingProfileSubmission, action: "approve" | "reject") => {
    setSelectedSubmission(submission as SubmissionDetail);
    setReviewAction(action);
    setReviewDialogOpen(true);
  };

  const handleSubmitReview = () => {
    if (!selectedSubmission || !reviewAction) return;
    reviewMutation.mutate({
      id: selectedSubmission.id,
      action: reviewAction,
    });
  };

  const getSubmitterName = (submitter: PendingProfileSubmission["submitter"]) => {
    if (!submitter) return "Unknown User";
    return submitter.full_name || submitter.first_name || "Anonymous";
  };

  const getSubmitterInitials = (submitter: PendingProfileSubmission["submitter"]) => {
    if (!submitter) return "?";
    const name = submitter.full_name || submitter.first_name || "";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "?";
  };

  const renderFieldChange = (field: string, newValue: any, currentValue: any) => {
    const displayField = field.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
    
    const formatValue = (val: any) => {
      if (val === null || val === undefined) return <span className="text-muted-foreground italic">Not set</span>;
      if (typeof val === "object") return <code className="text-xs bg-muted px-1 rounded">{JSON.stringify(val, null, 2)}</code>;
      return String(val);
    };

    return (
      <div key={field} className="py-3 border-b last:border-0">
        <div className="font-medium text-sm mb-2">{displayField}</div>
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-start text-sm">
          <div className="p-2 rounded bg-destructive/10 border border-destructive/20">
            <div className="text-xs text-muted-foreground mb-1">Current</div>
            <div className="break-words">{formatValue(currentValue)}</div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground mt-4" />
          <div className="p-2 rounded bg-primary/10 border border-primary/20">
            <div className="text-xs text-muted-foreground mb-1">New</div>
            <div className="break-words">{formatValue(newValue)}</div>
          </div>
        </div>
      </div>
    );
  };

  if (accessLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  if (!hasAccess) {
    return (
      <AdminLayout>
        <div className="p-8">
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <XCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
                <h3 className="text-lg font-medium mb-2">Access Denied</h3>
                <p className="text-muted-foreground">
                  You don't have permission to view pending profile submissions.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            Pending Profile Submissions
          </h1>
          <p className="text-muted-foreground mt-2">
            Review and approve church profile changes submitted by users
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <XCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
                <h3 className="text-lg font-medium mb-2">Error Loading Submissions</h3>
                <p className="text-muted-foreground">{(error as Error).message}</p>
              </div>
            </CardContent>
          </Card>
        ) : !submissions || submissions.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <Inbox className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">No Pending Submissions</h3>
                <p className="text-muted-foreground">
                  All profile submissions have been reviewed. Check back later for new submissions.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileEdit className="h-5 w-5" />
                  Pending Review
                </CardTitle>
                <CardDescription>
                  {submissions.length} submission{submissions.length !== 1 ? "s" : ""} awaiting review
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {submissions.map((submission) => (
                    <div 
                      key={submission.id} 
                      className="p-4 border rounded-lg hover-elevate"
                      data-testid={`card-submission-${submission.id}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <Building className="h-5 w-5 text-primary shrink-0" />
                            <div className="font-medium truncate">
                              {submission.church?.name || "Unknown Church"}
                            </div>
                            <Badge variant="outline" className="shrink-0">
                              <Clock className="h-3 w-3 mr-1" />
                              Pending
                            </Badge>
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                            {submission.church && (
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                <span>
                                  {[submission.church.city, submission.church.state].filter(Boolean).join(", ") || "No location"}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-3">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={submission.submitter?.avatar_url || undefined} />
                              <AvatarFallback className="text-xs">
                                {getSubmitterInitials(submission.submitter)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">
                              <span className="font-medium">{getSubmitterName(submission.submitter)}</span>
                              <span className="text-muted-foreground"> submitted </span>
                              <span className="text-muted-foreground">
                                {formatDistanceToNow(new Date(submission.created_at), { addSuffix: true })}
                              </span>
                            </span>
                          </div>

                          <div className="mt-3 text-sm text-muted-foreground">
                            <span className="font-medium">
                              {Object.keys(submission.submitted_data).length} field{Object.keys(submission.submitted_data).length !== 1 ? "s" : ""}
                            </span>
                            <span> changed: </span>
                            <span className="text-foreground">
                              {Object.keys(submission.submitted_data).slice(0, 3).map(field => 
                                field.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())
                              ).join(", ")}
                              {Object.keys(submission.submitted_data).length > 3 && "..."}
                            </span>
                          </div>
                        </div>

                        <div className="flex gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReviewClick(submission, "reject")}
                            data-testid={`button-reject-${submission.id}`}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleReviewClick(submission, "approve")}
                            data-testid={`button-approve-${submission.id}`}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {reviewAction === "approve" ? (
                <>
                  <CheckCircle className="h-5 w-5 text-primary" />
                  Approve Profile Changes
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-destructive" />
                  Reject Profile Changes
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {reviewAction === "approve" 
                ? "Review the changes below. Approving will update the church profile immediately."
                : "Are you sure you want to reject these changes? This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>

          {selectedSubmission && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Building className="h-5 w-5 text-primary" />
                <div>
                  <div className="font-medium">{selectedSubmission.church?.name || "Unknown Church"}</div>
                  <div className="text-sm text-muted-foreground">
                    {[selectedSubmission.church?.city, selectedSubmission.church?.state].filter(Boolean).join(", ") || "No location"}
                  </div>
                </div>
              </div>

              {reviewAction === "approve" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    Changes to be applied:
                  </div>
                  <ScrollArea className="h-[300px] border rounded-lg p-3">
                    {detailLoading ? (
                      <div className="space-y-3">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(selectedSubmission.submitted_data).map(([field, newValue]) => 
                          renderFieldChange(
                            field, 
                            newValue, 
                            submissionDetail?.church?.[field as keyof typeof submissionDetail.church] ?? null
                          )
                        )}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              )}

              {reviewAction === "reject" && (
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-destructive">This will permanently discard:</p>
                      <ul className="list-disc list-inside mt-2 text-muted-foreground">
                        {Object.keys(selectedSubmission.submitted_data).map(field => (
                          <li key={field}>
                            {field.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReviewDialogOpen(false)}
              disabled={reviewMutation.isPending}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              variant={reviewAction === "approve" ? "default" : "destructive"}
              onClick={handleSubmitReview}
              disabled={reviewMutation.isPending}
              data-testid="button-confirm"
            >
              {reviewMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : reviewAction === "approve" ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Approve Changes
                </>
              ) : (
                <>
                  <X className="h-4 w-4 mr-2" />
                  Reject Submission
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
