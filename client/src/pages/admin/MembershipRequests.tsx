import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useRoute, Link } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { usePlatformAccess } from "@/hooks/useAdminAccess";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Loader2, 
  Check, 
  X, 
  Clock, 
  Mail, 
  FileText,
  CheckCircle,
  XCircle,
  ArrowLeft,
  UserPlus,
} from "lucide-react";
import type { PlatformMembershipRequestWithDetails } from "@shared/schema";

interface RequestsResponse {
  platform: {
    id: string;
    name: string;
    slug: string;
  };
  requests: PlatformMembershipRequestWithDetails[];
  pendingCount: number;
}

export default function MembershipRequests() {
  const [, params] = useRoute("/admin/platform/:id/membership-requests");
  const platformId = params?.id;
  const { toast } = useToast();
  const { hasAccess, isSuperAdmin, isLoading: accessLoading } = usePlatformAccess(platformId);
  
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [selectedRequest, setSelectedRequest] = useState<PlatformMembershipRequestWithDetails | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const canAccess = isSuperAdmin || hasAccess;

  const { data, isLoading, error } = useQuery<RequestsResponse>({
    queryKey: ["/api/admin/platform", platformId, "membership-requests", statusFilter],
    enabled: !!platformId && canAccess,
  });

  const reviewRequestMutation = useMutation({
    mutationFn: async ({ requestId, status, notes }: { requestId: string; status: "approved" | "rejected"; notes?: string }) => {
      return apiRequest("PATCH", `/api/admin/platform/${platformId}/membership-requests/${requestId}`, {
        status,
        reviewer_notes: notes || null,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform", platformId, "membership-requests"] });
      setReviewDialogOpen(false);
      setSelectedRequest(null);
      setReviewNotes("");
      toast({
        title: variables.status === "approved" ? "Request Approved" : "Request Rejected",
        description: variables.status === "approved" 
          ? "The user is now a member of this platform."
          : "The membership request has been rejected.",
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

  const handleReviewClick = (request: PlatformMembershipRequestWithDetails, action: "approve" | "reject") => {
    setSelectedRequest(request);
    setReviewAction(action);
    setReviewNotes("");
    setReviewDialogOpen(true);
  };

  const handleSubmitReview = () => {
    if (!selectedRequest || !reviewAction) return;
    reviewRequestMutation.mutate({
      requestId: selectedRequest.id,
      status: reviewAction === "approve" ? "approved" : "rejected",
      notes: reviewNotes,
    });
  };

  const filteredRequests = data?.requests?.filter(r => 
    statusFilter === "all" ? true : r.status === statusFilter
  ) || [];

  const counts = {
    pending: data?.requests?.filter(r => r.status === "pending").length || 0,
    approved: data?.requests?.filter(r => r.status === "approved").length || 0,
    rejected: data?.requests?.filter(r => r.status === "rejected").length || 0,
    total: data?.requests?.length || 0,
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

  if (!canAccess) {
    return (
      <AdminLayout>
        <div className="p-8">
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <XCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
                <h3 className="text-lg font-medium mb-2">Access Denied</h3>
                <p className="text-muted-foreground">
                  You don't have permission to view membership requests for this platform.
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
        <div className="mb-6">
          <Button variant="ghost" size="sm" asChild className="mb-4">
            <Link href={`/admin/platform/${platformId}`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
        </div>

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <UserPlus className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold" data-testid="text-page-title">
              Membership Requests
            </h1>
          </div>
          <p className="text-muted-foreground mt-2">
            {data?.platform?.name ? `Review membership requests for ${data.platform.name}` : "Review and manage membership requests"}
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <XCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
                <h3 className="text-lg font-medium mb-2">Error Loading Requests</h3>
                <p className="text-muted-foreground">{(error as Error).message}</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card 
                className={`cursor-pointer hover-elevate ${statusFilter === "pending" ? "border-primary" : ""}`}
                onClick={() => setStatusFilter("pending")}
              >
                <CardHeader className="pb-2">
                  <CardDescription>Pending</CardDescription>
                  <CardTitle className="text-2xl">{counts.pending}</CardTitle>
                </CardHeader>
              </Card>
              <Card 
                className={`cursor-pointer hover-elevate ${statusFilter === "approved" ? "border-primary" : ""}`}
                onClick={() => setStatusFilter("approved")}
              >
                <CardHeader className="pb-2">
                  <CardDescription>Approved</CardDescription>
                  <CardTitle className="text-2xl">{counts.approved}</CardTitle>
                </CardHeader>
              </Card>
              <Card 
                className={`cursor-pointer hover-elevate ${statusFilter === "rejected" ? "border-primary" : ""}`}
                onClick={() => setStatusFilter("rejected")}
              >
                <CardHeader className="pb-2">
                  <CardDescription>Rejected</CardDescription>
                  <CardTitle className="text-2xl">{counts.rejected}</CardTitle>
                </CardHeader>
              </Card>
              <Card 
                className={`cursor-pointer hover-elevate ${statusFilter === "all" ? "border-primary" : ""}`}
                onClick={() => setStatusFilter("all")}
              >
                <CardHeader className="pb-2">
                  <CardDescription>Total</CardDescription>
                  <CardTitle className="text-2xl">{counts.total}</CardTitle>
                </CardHeader>
              </Card>
            </div>

            <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <TabsList className="mb-4">
                <TabsTrigger value="pending" data-testid="tab-pending">
                  Pending ({counts.pending})
                </TabsTrigger>
                <TabsTrigger value="approved" data-testid="tab-approved">
                  Approved ({counts.approved})
                </TabsTrigger>
                <TabsTrigger value="rejected" data-testid="tab-rejected">
                  Rejected ({counts.rejected})
                </TabsTrigger>
                <TabsTrigger value="all" data-testid="tab-all">
                  All
                </TabsTrigger>
              </TabsList>

              <TabsContent value={statusFilter} className="mt-0">
                {filteredRequests.length === 0 ? (
                  <Card>
                    <CardContent className="py-12">
                      <div className="text-center">
                        <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-medium mb-2">No Requests</h3>
                        <p className="text-muted-foreground">
                          {statusFilter === "pending" 
                            ? "There are no pending membership requests to review."
                            : `No ${statusFilter} requests found.`}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {filteredRequests.map((request) => (
                      <Card key={request.id} data-testid={`request-card-${request.id}`}>
                        <CardContent className="pt-6">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-4 flex-1">
                              <Avatar className="h-12 w-12">
                                <AvatarImage src={request.user?.avatar_url || undefined} />
                                <AvatarFallback>
                                  {request.user?.first_name?.[0] || request.user?.full_name?.[0] || "U"}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium">
                                    {request.user?.full_name || request.user?.first_name || "Unknown User"}
                                  </span>
                                  <Badge variant={
                                    request.status === "pending" ? "secondary" :
                                    request.status === "approved" ? "default" : "destructive"
                                  }>
                                    {request.status === "pending" && <Clock className="h-3 w-3 mr-1" />}
                                    {request.status === "approved" && <Check className="h-3 w-3 mr-1" />}
                                    {request.status === "rejected" && <X className="h-3 w-3 mr-1" />}
                                    {request.status}
                                  </Badge>
                                </div>
                                
                                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                                  {request.user?.email && (
                                    <span className="flex items-center gap-1">
                                      <Mail className="h-4 w-4" />
                                      {request.user.email}
                                    </span>
                                  )}
                                </div>

                                {request.message && (
                                  <div className="mt-3 p-3 bg-muted/50 rounded-md">
                                    <div className="flex items-center gap-1 text-sm font-medium mb-1">
                                      <FileText className="h-4 w-4" />
                                      Message
                                    </div>
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                      {request.message}
                                    </p>
                                  </div>
                                )}

                                {request.reviewer_notes && (
                                  <div className="mt-2 p-3 bg-muted/50 rounded-md">
                                    <div className="flex items-center gap-1 text-sm font-medium mb-1">
                                      <FileText className="h-4 w-4" />
                                      Reviewer Notes
                                    </div>
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                      {request.reviewer_notes}
                                    </p>
                                  </div>
                                )}

                                <div className="text-xs text-muted-foreground">
                                  Submitted: {new Date(request.created_at).toLocaleDateString()}
                                  {request.reviewed_at && (
                                    <> · Reviewed: {new Date(request.reviewed_at).toLocaleDateString()}</>
                                  )}
                                </div>
                              </div>
                            </div>

                            {request.status === "pending" && (
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleReviewClick(request, "reject")}
                                  data-testid={`button-reject-${request.id}`}
                                >
                                  <X className="h-4 w-4 mr-1" />
                                  Reject
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleReviewClick(request, "approve")}
                                  data-testid={`button-approve-${request.id}`}
                                >
                                  <Check className="h-4 w-4 mr-1" />
                                  Approve
                                </Button>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === "approve" ? "Approve Request" : "Reject Request"}
            </DialogTitle>
            <DialogDescription>
              {reviewAction === "approve" 
                ? `This will add ${selectedRequest?.user?.full_name || selectedRequest?.user?.first_name || "the user"} as a member of this platform.`
                : `This will reject ${selectedRequest?.user?.full_name || selectedRequest?.user?.first_name || "the user"}'s membership request.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="review-notes">Notes (Optional)</Label>
              <Textarea
                id="review-notes"
                placeholder={reviewAction === "approve" 
                  ? "Add any notes about this approval..." 
                  : "Explain why this request is being rejected..."}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="mt-2"
                data-testid="input-review-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReviewDialogOpen(false)}
              data-testid="button-cancel-review"
            >
              Cancel
            </Button>
            <Button
              variant={reviewAction === "approve" ? "default" : "destructive"}
              onClick={handleSubmitReview}
              disabled={reviewRequestMutation.isPending}
              data-testid="button-confirm-review"
            >
              {reviewRequestMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {reviewAction === "approve" ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
