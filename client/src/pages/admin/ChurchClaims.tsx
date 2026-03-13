import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useRoute } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useToast } from "@/hooks/use-toast";
import { usePlatformContext } from "@/contexts/PlatformContext";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Loader2, 
  Check, 
  X, 
  Clock, 
  Building, 
  User, 
  Phone, 
  Mail, 
  MapPin,
  FileText,
  CheckCircle,
  XCircle,
} from "lucide-react";
import type { ChurchClaimWithDetails } from "@shared/schema";

interface ClaimsResponse {
  platform: {
    id: string;
    name: string;
    slug: string;
  };
  claims: ChurchClaimWithDetails[];
  counts: {
    pending: number;
    approved: number;
    rejected: number;
    total: number;
  };
}

export default function ChurchClaims() {
  const [, params] = useRoute("/admin/city-platforms/:id/church-claims");
  const { platformId: contextPlatformId } = usePlatformContext();
  // Use URL param if available, otherwise fall back to platform context
  const platformId = params?.id || contextPlatformId;
  const { toast } = useToast();
  const { isPlatformAdminOf, isSuperAdmin, isLoading: accessLoading, platformRoles } = useAdminAccess();
  
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [selectedClaim, setSelectedClaim] = useState<ChurchClaimWithDetails | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const hasAccess = isSuperAdmin || (platformId ? isPlatformAdminOf(platformId) : false);

  const { data, isLoading, error } = useQuery<ClaimsResponse>({
    queryKey: [`/api/admin/city-platforms/${platformId}/church-claims?status=${statusFilter}`],
    queryFn: async () => {
      const { supabase } = await import("../../../../lib/supabaseClient");
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      const response = await fetch(`/api/admin/city-platforms/${platformId}/church-claims?status=${statusFilter}`, {
        headers,
        credentials: 'include',
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to fetch claims');
      }
      return response.json();
    },
    enabled: !!platformId && hasAccess,
    staleTime: 0,
  });

  const reviewClaimMutation = useMutation({
    mutationFn: async ({ claimId, status, notes }: { claimId: string; status: "approved" | "rejected"; notes?: string }) => {
      return apiRequest("PATCH", `/api/admin/church-claims/${claimId}`, {
        status,
        reviewer_notes: notes || null,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/church-claims`] });
      setReviewDialogOpen(false);
      setSelectedClaim(null);
      setReviewNotes("");
      toast({
        title: variables.status === "approved" ? "Claim Approved" : "Claim Rejected",
        description: variables.status === "approved" 
          ? "The user is now the admin of this church."
          : "The claim has been rejected.",
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

  const handleReviewClick = (claim: ChurchClaimWithDetails, action: "approve" | "reject") => {
    setSelectedClaim(claim);
    setReviewAction(action);
    setReviewNotes("");
    setReviewDialogOpen(true);
  };

  const handleSubmitReview = () => {
    if (!selectedClaim || !reviewAction) return;
    reviewClaimMutation.mutate({
      claimId: selectedClaim.id,
      status: reviewAction === "approve" ? "approved" : "rejected",
      notes: reviewNotes,
    });
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
                  You don't have permission to view church claims for this platform.
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
            Church Claims
          </h1>
          <p className="text-muted-foreground mt-2">
            {data?.platform?.name ? `Review and manage church claims for ${data.platform.name}` : "Review and manage church claims"}
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
                <h3 className="text-lg font-medium mb-2">Error Loading Claims</h3>
                <p className="text-muted-foreground">{(error as Error).message}</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-4 mb-6">
              <Card className={statusFilter === "pending" ? "border-primary" : ""}>
                <CardHeader className="pb-2">
                  <CardDescription>Pending</CardDescription>
                  <CardTitle className="text-2xl">{data?.counts?.pending || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card className={statusFilter === "approved" ? "border-primary" : ""}>
                <CardHeader className="pb-2">
                  <CardDescription>Approved</CardDescription>
                  <CardTitle className="text-2xl">{data?.counts?.approved || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card className={statusFilter === "rejected" ? "border-primary" : ""}>
                <CardHeader className="pb-2">
                  <CardDescription>Rejected</CardDescription>
                  <CardTitle className="text-2xl">{data?.counts?.rejected || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card className={statusFilter === "all" ? "border-primary" : ""}>
                <CardHeader className="pb-2">
                  <CardDescription>Total</CardDescription>
                  <CardTitle className="text-2xl">{data?.counts?.total || 0}</CardTitle>
                </CardHeader>
              </Card>
            </div>

            <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <TabsList className="mb-4">
                <TabsTrigger value="pending" data-testid="tab-pending">
                  Pending ({data?.counts?.pending || 0})
                </TabsTrigger>
                <TabsTrigger value="approved" data-testid="tab-approved">
                  Approved ({data?.counts?.approved || 0})
                </TabsTrigger>
                <TabsTrigger value="rejected" data-testid="tab-rejected">
                  Rejected ({data?.counts?.rejected || 0})
                </TabsTrigger>
                <TabsTrigger value="all" data-testid="tab-all">
                  All
                </TabsTrigger>
              </TabsList>

              <TabsContent value={statusFilter} className="mt-0">
                {!data?.claims || data.claims.length === 0 ? (
                  <Card>
                    <CardContent className="py-12">
                      <div className="text-center">
                        <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-medium mb-2">No Claims</h3>
                        <p className="text-muted-foreground">
                          {statusFilter === "pending" 
                            ? "There are no pending claims to review."
                            : `No ${statusFilter} claims found.`}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {data.claims.map((claim) => (
                      <Card key={claim.id} data-testid={`claim-card-${claim.id}`}>
                        <CardContent className="pt-6">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-4 flex-1">
                              <Avatar className="h-12 w-12">
                                <AvatarImage src={claim.user?.avatar_url || undefined} />
                                <AvatarFallback>
                                  {claim.user?.first_name?.[0] || claim.user?.full_name?.[0] || "U"}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium">
                                    {claim.user?.full_name || claim.user?.first_name || "Unknown User"}
                                  </span>
                                  <Badge variant={
                                    claim.status === "pending" ? "secondary" :
                                    claim.status === "approved" ? "default" : "destructive"
                                  }>
                                    {claim.status === "pending" && <Clock className="h-3 w-3 mr-1" />}
                                    {claim.status === "approved" && <Check className="h-3 w-3 mr-1" />}
                                    {claim.status === "rejected" && <X className="h-3 w-3 mr-1" />}
                                    {claim.status}
                                  </Badge>
                                </div>
                                
                                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                                  <span className="flex items-center gap-1">
                                    <Building className="h-4 w-4" />
                                    {claim.church?.name || "Unknown Church"}
                                  </span>
                                  {claim.role_at_church && (
                                    <span className="flex items-center gap-1">
                                      <User className="h-4 w-4" />
                                      {claim.role_at_church}
                                    </span>
                                  )}
                                  {claim.user?.email && (
                                    <span className="flex items-center gap-1">
                                      <Mail className="h-4 w-4" />
                                      {claim.user.email}
                                    </span>
                                  )}
                                  {claim.phone && (
                                    <span className="flex items-center gap-1">
                                      <Phone className="h-4 w-4" />
                                      {claim.phone}
                                    </span>
                                  )}
                                </div>

                                {claim.church?.address && (
                                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                    <MapPin className="h-4 w-4" />
                                    {claim.church.address}
                                    {claim.church.city && `, ${claim.church.city}`}
                                    {claim.church.state && `, ${claim.church.state}`}
                                  </div>
                                )}

                                {claim.verification_notes && (
                                  <div className="mt-3 p-3 bg-muted/50 rounded-md">
                                    <div className="flex items-center gap-1 text-sm font-medium mb-1">
                                      <FileText className="h-4 w-4" />
                                      Verification Notes
                                    </div>
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                      {claim.verification_notes}
                                    </p>
                                  </div>
                                )}

                                {claim.reviewer_notes && (
                                  <div className="mt-2 p-3 bg-muted/50 rounded-md">
                                    <div className="flex items-center gap-1 text-sm font-medium mb-1">
                                      <FileText className="h-4 w-4" />
                                      Reviewer Notes
                                    </div>
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                      {claim.reviewer_notes}
                                    </p>
                                  </div>
                                )}

                                <div className="text-xs text-muted-foreground">
                                  Submitted: {new Date(claim.created_at).toLocaleDateString()}
                                  {claim.reviewed_at && (
                                    <> · Reviewed: {new Date(claim.reviewed_at).toLocaleDateString()}</>
                                  )}
                                </div>
                              </div>
                            </div>

                            {claim.status === "pending" && (
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleReviewClick(claim, "reject")}
                                  data-testid={`button-reject-${claim.id}`}
                                >
                                  <X className="h-4 w-4 mr-1" />
                                  Reject
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleReviewClick(claim, "approve")}
                                  data-testid={`button-approve-${claim.id}`}
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
              {reviewAction === "approve" ? "Approve Claim" : "Reject Claim"}
            </DialogTitle>
            <DialogDescription>
              {reviewAction === "approve" 
                ? `This will make ${selectedClaim?.user?.full_name || selectedClaim?.user?.first_name || "the user"} the administrator of ${selectedClaim?.church?.name || "this church"}.`
                : `This will reject ${selectedClaim?.user?.full_name || selectedClaim?.user?.first_name || "the user"}'s claim to ${selectedClaim?.church?.name || "this church"}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="review-notes">Notes (Optional)</Label>
              <Textarea
                id="review-notes"
                placeholder={reviewAction === "approve" 
                  ? "Add any notes about this approval..." 
                  : "Explain why this claim is being rejected..."}
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
              disabled={reviewClaimMutation.isPending}
              data-testid="button-confirm-review"
            >
              {reviewClaimMutation.isPending && (
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
