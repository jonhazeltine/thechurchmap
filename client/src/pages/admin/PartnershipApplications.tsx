import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow, format } from "date-fns";
import {
  Search,
  Loader2,
  ChevronDown,
  ChevronRight,
  FileText,
  Mail,
  Phone,
  User,
  Check,
  X,
  Clock,
  Eye,
  AlertCircle,
  Copy,
  ExternalLink,
} from "lucide-react";
import { IconBuildingChurch } from "@tabler/icons-react";
import type { PartnershipApplication, PartnershipApplicationStatus, PartnershipApplicationPath } from "@shared/schema";

interface ApplicationsResponse {
  applications: PartnershipApplication[];
  total: number;
}

const statusColors: Record<PartnershipApplicationStatus, string> = {
  new: "bg-blue-500",
  reviewed: "bg-yellow-500",
  closed: "bg-gray-500",
};

const pathLabels: Record<PartnershipApplicationPath, string> = {
  explore: "Explore",
  authorize: "Authorize",
};

export default function PartnershipApplicationsAdmin() {
  const { toast } = useToast();
  const { isSuperAdmin, isPlatformAdmin, isLoading: accessLoading } = useAdminAccess();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PartnershipApplicationStatus>("all");
  const [pathFilter, setPathFilter] = useState<"all" | PartnershipApplicationPath>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<PartnershipApplication | null>(null);
  const [reviewAction, setReviewAction] = useState<"reviewed" | "closed" | null>(null);
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [applicationToWithdraw, setApplicationToWithdraw] = useState<PartnershipApplication | null>(null);

  const hasAccess = isSuperAdmin || isPlatformAdmin;

  const { data, isLoading, error } = useQuery<ApplicationsResponse>({
    queryKey: ["/api/admin/partnership-applications", statusFilter, pathFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }
      if (pathFilter !== "all") {
        params.append("path", pathFilter);
      }
      const data = await apiRequest("GET", `/api/admin/partnership-applications?${params.toString()}`);
      return data;
    },
    enabled: hasAccess,
  });

  const updateApplicationMutation = useMutation({
    mutationFn: async ({ id, status, reviewer_notes }: { id: string; status: PartnershipApplicationStatus; reviewer_notes?: string }) => {
      return apiRequest("PATCH", `/api/admin/partnership-applications/${id}`, {
        status,
        reviewer_notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partnership-applications"] });
      setReviewDialogOpen(false);
      setSelectedApplication(null);
      setReviewerNotes("");
      toast({
        title: "Application Updated",
        description: "The application status has been updated.",
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

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIds(newExpanded);
  };

  const openReviewDialog = (app: PartnershipApplication, action: "reviewed" | "closed") => {
    setSelectedApplication(app);
    setReviewAction(action);
    setReviewerNotes(app.reviewer_notes || "");
    setReviewDialogOpen(true);
  };

  const handleSubmitReview = () => {
    if (!selectedApplication || !reviewAction) return;
    updateApplicationMutation.mutate({
      id: selectedApplication.id,
      status: reviewAction,
      reviewer_notes: reviewerNotes || undefined,
    });
  };

  const filteredApplications = data?.applications?.filter((app) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      app.applicant_name?.toLowerCase().includes(searchLower) ||
      app.applicant_email?.toLowerCase().includes(searchLower) ||
      app.church?.name?.toLowerCase().includes(searchLower)
    );
  });

  const stats = {
    total: data?.total || 0,
    new: data?.applications?.filter((a) => a.status === "new").length || 0,
    reviewed: data?.applications?.filter((a) => a.status === "reviewed").length || 0,
    closed: data?.applications?.filter((a) => a.status === "closed").length || 0,
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
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
                <h3 className="text-lg font-semibold">Access Denied</h3>
                <p className="text-muted-foreground mt-2">
                  You need admin privileges to view partnership applications.
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
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-partnership-applications">
              Partnership Applications
            </h1>
            <p className="text-muted-foreground mt-1">
              Review and manage Fund the Mission applications
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-applications">{stats.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">New</CardTitle>
              <Clock className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600" data-testid="stat-new-applications">{stats.new}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Reviewed</CardTitle>
              <Eye className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600" data-testid="stat-reviewed-applications">{stats.reviewed}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Closed</CardTitle>
              <Check className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-600" data-testid="stat-closed-applications">{stats.closed}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle>Applications</CardTitle>
                <CardDescription>
                  Click on a row to expand details
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="relative w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-applications"
                  />
                </div>
                <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val as any)}>
                  <SelectTrigger className="w-32" data-testid="select-status-filter">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="reviewed">Reviewed</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={pathFilter} onValueChange={(val) => setPathFilter(val as any)}>
                  <SelectTrigger className="w-32" data-testid="select-path-filter">
                    <SelectValue placeholder="Path" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Paths</SelectItem>
                    <SelectItem value="explore">Explore</SelectItem>
                    <SelectItem value="authorize">Authorize</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
                <h3 className="mt-4 text-lg font-semibold">Error Loading Applications</h3>
                <p className="text-muted-foreground mt-2">Please try again later.</p>
              </div>
            ) : filteredApplications && filteredApplications.length > 0 ? (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Church</TableHead>
                      <TableHead>Applicant</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Path</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredApplications.map((app) => (
                      <Collapsible key={app.id} asChild open={expandedIds.has(app.id)}>
                        <>
                          <TableRow
                            className="cursor-pointer hover-elevate"
                            onClick={() => toggleExpanded(app.id)}
                            data-testid={`row-application-${app.id}`}
                          >
                            <TableCell>
                              <CollapsibleTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-6 w-6" data-testid={`button-expand-${app.id}`}>
                                  {expandedIds.has(app.id) ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </Button>
                              </CollapsibleTrigger>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{app.church?.name || "Unknown Church"}</div>
                              {app.church?.city && app.church?.state && (
                                <div className="text-sm text-muted-foreground">
                                  {app.church.city}, {app.church.state}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{app.applicant_name}</div>
                              <div className="text-sm text-muted-foreground">{app.applicant_email}</div>
                            </TableCell>
                            <TableCell>{app.applicant_role}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="pointer-events-none">{pathLabels[app.path]}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={statusColors[app.status]}>
                                {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">
                                {formatDistanceToNow(new Date(app.created_at), { addSuffix: true })}
                              </span>
                            </TableCell>
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-end gap-2">
                                {app.status === "new" && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="default"
                                      onClick={() => openReviewDialog(app, "reviewed")}
                                      data-testid={`button-approve-${app.id}`}
                                    >
                                      <Check className="h-4 w-4 mr-1" />
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => openReviewDialog(app, "closed")}
                                      data-testid={`button-reject-${app.id}`}
                                    >
                                      <X className="h-4 w-4 mr-1" />
                                      Reject
                                    </Button>
                                  </>
                                )}
                                {app.status === "reviewed" && (
                                  <div className="flex items-center gap-2">
                                    <Badge className="bg-green-500">Approved</Badge>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setApplicationToWithdraw(app);
                                        setWithdrawDialogOpen(true);
                                      }}
                                      data-testid={`button-withdraw-${app.id}`}
                                    >
                                      Withdraw
                                    </Button>
                                  </div>
                                )}
                                {app.status === "closed" && (
                                  <Badge variant="secondary">Rejected</Badge>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                          <CollapsibleContent asChild>
                            <TableRow className="bg-muted/30">
                              <TableCell colSpan={8} className="p-0">
                                <div className="p-6 space-y-4">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-3">
                                      <h4 className="font-semibold text-sm">Contact Information</h4>
                                      <div className="space-y-2 text-sm">
                                        <div className="flex items-center gap-2">
                                          <User className="h-4 w-4 text-muted-foreground" />
                                          <span>{app.applicant_name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Mail className="h-4 w-4 text-muted-foreground" />
                                          <a href={`mailto:${app.applicant_email}`} className="text-primary hover:underline">
                                            {app.applicant_email}
                                          </a>
                                        </div>
                                        {app.applicant_phone && (
                                          <div className="flex items-center gap-2">
                                            <Phone className="h-4 w-4 text-muted-foreground" />
                                            <a href={`tel:${app.applicant_phone}`} className="text-primary hover:underline">
                                              {app.applicant_phone}
                                            </a>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <div className="space-y-3">
                                      <h4 className="font-semibold text-sm">Application Details</h4>
                                      <div className="space-y-2 text-sm">
                                        <div className="flex items-center gap-2">
                                          <IconBuildingChurch className="h-4 w-4 text-muted-foreground" />
                                          <span>{app.church?.name || "Unknown Church"}</span>
                                        </div>
                                        <div>
                                          <span className="text-muted-foreground">Role: </span>
                                          {app.applicant_role}
                                        </div>
                                        <div>
                                          <span className="text-muted-foreground">Authority Affirmation: </span>
                                          {app.has_authority_affirmation ? (
                                            <Badge variant="outline" className="text-green-600">Yes</Badge>
                                          ) : (
                                            <Badge variant="outline" className="text-red-600">No</Badge>
                                          )}
                                        </div>
                                        <div>
                                          <span className="text-muted-foreground">Submitted: </span>
                                          {format(new Date(app.created_at), "PPpp")}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  {app.notes && (
                                    <div className="space-y-2">
                                      <h4 className="font-semibold text-sm">Applicant Notes</h4>
                                      <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                                        {app.notes}
                                      </p>
                                    </div>
                                  )}
                                  {app.reviewer_notes && (
                                    <div className="space-y-2">
                                      <h4 className="font-semibold text-sm">Reviewer Notes</h4>
                                      <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                                        {app.reviewer_notes}
                                      </p>
                                    </div>
                                  )}
                                  {app.reviewed_at && (
                                    <div className="text-sm text-muted-foreground">
                                      Last reviewed: {format(new Date(app.reviewed_at), "PPpp")}
                                    </div>
                                  )}
                                  
                                  {app.church?.id && (
                                    <div className="pt-4 border-t space-y-3">
                                      <div className="space-y-2">
                                        <h4 className="font-semibold text-sm">Unlock Mission Funding Link</h4>
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <code className="text-xs bg-muted px-2 py-1 rounded flex-1 min-w-0 truncate">
                                            {`${window.location.origin}/church/${app.church.id}/fund-the-mission`}
                                          </code>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                              navigator.clipboard.writeText(`${window.location.origin}/church/${app.church!.id}/fund-the-mission`);
                                              toast({
                                                title: "Link Copied",
                                                description: "Unlock Mission Funding link copied to clipboard",
                                              });
                                            }}
                                            data-testid={`button-copy-unlock-link-${app.id}`}
                                          >
                                            <Copy className="h-4 w-4 mr-1" />
                                            Copy
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            asChild
                                          >
                                            <a 
                                              href={`/church/${app.church.id}/fund-the-mission`} 
                                              target="_blank" 
                                              rel="noopener noreferrer"
                                              data-testid={`button-open-unlock-link-${app.id}`}
                                            >
                                              <ExternalLink className="h-4 w-4 mr-1" />
                                              Open
                                            </a>
                                          </Button>
                                        </div>
                                      </div>
                                      
                                      {app.status === "reviewed" && (
                                        <div className="space-y-2">
                                          <h4 className="font-semibold text-sm text-green-600">Get Mission Funding Link (Active)</h4>
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <code className="text-xs bg-muted px-2 py-1 rounded flex-1 min-w-0 truncate">
                                              {`${window.location.origin}/churches/${app.church.id}/mission-funding`}
                                            </code>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() => {
                                                navigator.clipboard.writeText(`${window.location.origin}/churches/${app.church!.id}/mission-funding`);
                                                toast({
                                                  title: "Link Copied",
                                                  description: "Get Mission Funding link copied to clipboard",
                                                });
                                              }}
                                              data-testid={`button-copy-get-link-${app.id}`}
                                            >
                                              <Copy className="h-4 w-4 mr-1" />
                                              Copy
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              asChild
                                            >
                                              <a 
                                                href={`/churches/${app.church.id}/mission-funding`} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                data-testid={`button-open-get-link-${app.id}`}
                                              >
                                                <ExternalLink className="h-4 w-4 mr-1" />
                                                Open
                                              </a>
                                            </Button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          </CollapsibleContent>
                        </>
                      </Collapsible>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">No Applications Found</h3>
                <p className="text-muted-foreground mt-2">
                  {searchTerm || statusFilter !== "all" || pathFilter !== "all"
                    ? "Try adjusting your filters"
                    : "No partnership applications have been submitted yet"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
          <DialogContent data-testid="dialog-review-application">
            <DialogHeader>
              <DialogTitle>
                {reviewAction === "reviewed" ? "Approve Partnership" : "Reject Application"}
              </DialogTitle>
              <DialogDescription>
                {reviewAction === "reviewed"
                  ? "Approve this partnership application. This will activate the church's Fund the Mission page."
                  : "Reject this application. The church will not be activated for partnership."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="reviewer-notes">Notes (Optional)</Label>
                <Textarea
                  id="reviewer-notes"
                  placeholder="Add any notes about this decision..."
                  value={reviewerNotes}
                  onChange={(e) => setReviewerNotes(e.target.value)}
                  className="min-h-[100px]"
                  data-testid="textarea-reviewer-notes"
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
                onClick={handleSubmitReview}
                disabled={updateApplicationMutation.isPending}
                variant={reviewAction === "reviewed" ? "default" : "destructive"}
                data-testid="button-submit-review"
              >
                {updateApplicationMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : reviewAction === "reviewed" ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Approve Partnership
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4 mr-2" />
                    Reject Application
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen}>
          <AlertDialogContent data-testid="dialog-withdraw-approval">
            <AlertDialogHeader>
              <AlertDialogTitle>Withdraw Approval</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to withdraw approval for this application? 
                It will be moved back to "new" status and will need to be reviewed again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-withdraw">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (applicationToWithdraw) {
                    updateApplicationMutation.mutate({ id: applicationToWithdraw.id, status: "new" });
                  }
                  setWithdrawDialogOpen(false);
                  setApplicationToWithdraw(null);
                }}
                data-testid="button-confirm-withdraw"
              >
                Withdraw Approval
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
}
