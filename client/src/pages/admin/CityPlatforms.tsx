import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, Plus, MoreHorizontal, Pencil, ExternalLink, MapPin, Building, Map, Trash2, 
  AlertTriangle, Users, Settings, Globe, Check, X, Clock, Eye, Play, Inbox, 
  User, FileText, CheckCircle, XCircle, Loader2, Link2 
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link, useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import { useAuth } from "@/contexts/AuthContext";
import { type CityPlatform, type Boundary, type CityPlatformApplicationWithDetails, type PlatformApplicationStatus } from "@shared/schema";
import { formatDistanceToNow, format } from "date-fns";

interface CityPlatformWithMetrics extends CityPlatform {
  church_count?: number;
  owner_count?: number;
  primary_boundary?: Pick<Boundary, 'id' | 'name' | 'type'> | null;
}

interface ApplicationWithDetails extends Omit<CityPlatformApplicationWithDetails, 'reviewer' | 'created_platform'> {
  boundaries: Boundary[];
  reviewer?: {
    id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
  created_platform?: {
    id: string;
    name: string;
    slug: string;
    is_active: boolean;
    is_public: boolean;
  } | null;
}

export default function AdminCityPlatforms() {
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [platformToDelete, setPlatformToDelete] = useState<CityPlatformWithMetrics | null>(null);
  const [activeTab, setActiveTab] = useState("platforms");
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { isSuperAdmin } = useAdminAccess();
  const { buildPlatformUrl } = usePlatformNavigation();
  const { session } = useAuth();

  const { data: platforms, isLoading } = useQuery<CityPlatformWithMetrics[]>({
    queryKey: ["/api/admin/city-platforms"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (platformId: string) => {
      return apiRequest("DELETE", `/api/admin/city-platforms/${platformId}`);
    },
    onSuccess: (_, platformId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/city-platforms"] });
      toast({
        title: "Platform Deleted",
        description: `The platform has been permanently deleted along with all associated data.`,
      });
      setDeleteDialogOpen(false);
      setPlatformToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete platform",
        variant: "destructive",
      });
    },
  });

  const handleDeleteClick = (platform: CityPlatformWithMetrics) => {
    setPlatformToDelete(platform);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (platformToDelete) {
      deleteMutation.mutate(platformToDelete.id);
    }
  };

  const filteredPlatforms = platforms?.filter((platform) =>
    platform.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    platform.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
    platform.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const [statusFilter, setStatusFilter] = useState<PlatformApplicationStatus | "all">("pending");
  const [selectedApplication, setSelectedApplication] = useState<ApplicationWithDetails | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<"in_review" | "approve" | "reject" | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const { data: applications, isLoading: applicationsLoading, error: applicationsError } = useQuery<ApplicationWithDetails[]>({
    queryKey: ["/api/admin/platform-applications", statusFilter !== "all" ? statusFilter : undefined],
    queryFn: async () => {
      const url = statusFilter === "all" 
        ? "/api/admin/platform-applications"
        : `/api/admin/platform-applications?status=${statusFilter}`;
      const response = await fetch(url, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch applications');
      return response.json();
    },
    enabled: isSuperAdmin && activeTab === "applications" && !!session?.access_token,
  });

  const { data: applicationDetail, isLoading: detailLoading } = useQuery<ApplicationWithDetails>({
    queryKey: ["/api/admin/platform-applications", selectedApplication?.id],
    queryFn: async () => {
      const response = await fetch(`/api/admin/platform-applications/${selectedApplication?.id}`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch application details');
      return response.json();
    },
    enabled: !!selectedApplication?.id && detailDialogOpen && !!session?.access_token,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: "in_review" | "approved" | "rejected"; notes?: string }) => {
      return apiRequest("PATCH", `/api/admin/platform-applications/${id}`, {
        status,
        reviewer_notes: notes || null,
      });
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/city-platforms"] });
      setDetailDialogOpen(false);
      setConfirmDialogOpen(false);
      setSelectedApplication(null);
      setReviewNotes("");
      setReviewAction(null);
      
      const messages: Record<string, { title: string; description: string }> = {
        in_review: {
          title: "Marked In Review",
          description: "The application is now being reviewed.",
        },
        approved: {
          title: "Application Approved",
          description: data?.message || "The platform has been created and the applicant is now the platform owner.",
        },
        rejected: {
          title: "Application Rejected",
          description: "The application has been rejected.",
        },
      };
      
      toast(messages[variables.status] || { title: "Updated", description: "Application status updated." });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleViewDetails = (application: ApplicationWithDetails) => {
    setSelectedApplication(application);
    setDetailDialogOpen(true);
  };

  const handleAction = (action: "in_review" | "approve" | "reject") => {
    setReviewAction(action);
    if (action === "approve" || action === "reject") {
      // Close the details dialog first to avoid stacking issues
      setDetailDialogOpen(false);
      // Small delay to allow dialog to close before opening confirmation
      setTimeout(() => {
        setConfirmDialogOpen(true);
      }, 100);
    } else {
      if (selectedApplication) {
        reviewMutation.mutate({
          id: selectedApplication.id,
          status: action,
        });
      }
    }
  };

  const handleConfirmAction = () => {
    if (!selectedApplication || !reviewAction) return;
    
    const statusMap: Record<typeof reviewAction, "in_review" | "approved" | "rejected"> = {
      in_review: "in_review",
      approve: "approved",
      reject: "rejected",
    };
    
    reviewMutation.mutate({
      id: selectedApplication.id,
      status: statusMap[reviewAction],
      notes: reviewNotes,
    });
  };

  const getStatusBadge = (status: PlatformApplicationStatus) => {
    const variants: Record<PlatformApplicationStatus, { variant: "secondary" | "default" | "destructive" | "outline"; icon: typeof Clock }> = {
      pending: { variant: "secondary", icon: Clock },
      in_review: { variant: "outline", icon: Eye },
      approved: { variant: "default", icon: Check },
      rejected: { variant: "destructive", icon: X },
    };
    
    const config = variants[status] || variants.pending;
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant}>
        <Icon className="h-3 w-3 mr-1" />
        {status.replace("_", " ")}
      </Badge>
    );
  };

  const getBoundaryTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      city: "City",
      county: "County",
      zip: "ZIP Code",
      school_district: "School District",
      custom: "Custom",
    };
    return labels[type] || type;
  };

  const getApplicantName = (app: ApplicationWithDetails) => {
    if (app.applicant?.full_name) return app.applicant.full_name;
    if (app.applicant?.first_name && app.applicant?.last_name) {
      return `${app.applicant.first_name} ${app.applicant.last_name}`;
    }
    if (app.applicant?.first_name) return app.applicant.first_name;
    return app.applicant_name || "Unknown";
  };

  const getApplicantInitials = (app: ApplicationWithDetails) => {
    const name = getApplicantName(app);
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "?";
  };

  const counts = {
    all: applications?.length || 0,
    pending: applications?.filter(a => a.status === "pending").length || 0,
    in_review: applications?.filter(a => a.status === "in_review").length || 0,
    approved: applications?.filter(a => a.status === "approved").length || 0,
    rejected: applications?.filter(a => a.status === "rejected").length || 0,
  };

  const filteredApplications = statusFilter === "all" 
    ? applications 
    : applications?.filter(a => a.status === statusFilter);

  return (
    <AdminLayout>
      <div className="p-4 sm:p-8">
        <div className="mb-6 sm:mb-8 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold" data-testid="text-page-title">City Platforms</h1>
            <Button asChild data-testid="button-create-platform" size="sm" className="shrink-0">
              <Link href={buildPlatformUrl("/admin/city-platforms/create")}>
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Create Platform</span>
              </Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Manage city platform networks and review applications
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="platforms" data-testid="tab-platforms">
              <Globe className="h-4 w-4 mr-2" />
              Platforms ({platforms?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="applications" data-testid="tab-applications">
              <FileText className="h-4 w-4 mr-2" />
              Applications
              {counts.pending > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {counts.pending}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="platforms">
            <Card>
              <CardHeader>
                <CardTitle>All Platforms</CardTitle>
                <CardDescription>
                  {platforms?.length || 0} platform{(platforms?.length || 0) !== 1 ? 's' : ''} total
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, slug, or description..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                      data-testid="input-search"
                    />
                  </div>
                </div>

                {isLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Churches</TableHead>
                          <TableHead>Owners</TableHead>
                          <TableHead>Primary Boundary</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPlatforms && filteredPlatforms.length > 0 ? (
                          filteredPlatforms.map((platform) => (
                            <TableRow 
                              key={platform.id} 
                              data-testid={`row-platform-${platform.id}`}
                              className="cursor-pointer hover-elevate"
                              onClick={() => setLocation(`/admin/platform/${platform.id}`)}
                            >
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="font-medium">{platform.name}</div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-muted-foreground"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const url = `${window.location.origin}/${platform.slug || platform.id}`;
                                      navigator.clipboard.writeText(url);
                                      toast({
                                        title: "Link copied",
                                        description: "Platform link copied to clipboard",
                                      });
                                    }}
                                    data-testid={`button-copy-link-${platform.id}`}
                                  >
                                    <Link2 className="h-3 w-3 mr-1" />
                                    Copy Link
                                  </Button>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant={platform.is_active ? "default" : "secondary"}>
                                    {platform.is_active ? "Active" : "Inactive"}
                                  </Badge>
                                  <Badge variant={platform.is_public ? "outline" : "secondary"}>
                                    {platform.is_public ? "Public" : "Private"}
                                  </Badge>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1 text-sm">
                                  <Building className="h-3 w-3 text-muted-foreground" />
                                  <span>{platform.church_count || 0}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="text-sm">{platform.owner_count || 0} owner{(platform.owner_count || 0) !== 1 ? 's' : ''}</span>
                              </TableCell>
                              <TableCell>
                                {platform.primary_boundary ? (
                                  <div className="flex items-center gap-1 text-sm">
                                    <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                                    <span>{platform.primary_boundary.name}</span>
                                  </div>
                                ) : (
                                  <span className="text-sm text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" data-testid={`button-actions-${platform.id}`}>
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem asChild data-testid={`button-edit-${platform.id}`}>
                                      <Link href={`/admin/platform/${platform.id}/settings`}>
                                        <Settings className="h-4 w-4 mr-2" />
                                        Edit Platform
                                      </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild data-testid={`button-boundaries-${platform.id}`}>
                                      <Link href={`/admin/city-platforms/${platform.id}/boundaries`}>
                                        <Map className="h-4 w-4 mr-2" />
                                        Manage Boundaries
                                      </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild data-testid={`button-churches-${platform.id}`}>
                                      <Link href={`/admin/churches?platform=${platform.id}`}>
                                        <Building className="h-4 w-4 mr-2" />
                                        Manage Churches
                                      </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild data-testid={`button-users-${platform.id}`}>
                                      <Link href={`/admin/platform/${platform.id}/members`}>
                                        <Users className="h-4 w-4 mr-2" />
                                        Manage Users
                                      </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem asChild data-testid={`button-view-${platform.id}`}>
                                      <Link href={`/${platform.slug || platform.id}`}>
                                        <ExternalLink className="h-4 w-4 mr-2" />
                                        View on Map
                                      </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => handleDeleteClick(platform)}
                                      data-testid={`button-delete-${platform.id}`}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete Platform
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                              {searchTerm ? "No platforms found matching your search" : "No city platforms yet"}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="applications">
            {applicationsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : applicationsError ? (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center">
                    <XCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
                    <h3 className="text-lg font-medium mb-2">Error Loading Applications</h3>
                    <p className="text-muted-foreground">{(applicationsError as Error).message}</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mb-6">
                  <div className="flex gap-3 min-w-max sm:grid sm:grid-cols-5 sm:gap-4 sm:min-w-0">
                    <Card 
                      className={`cursor-pointer transition-colors min-w-[80px] ${statusFilter === "all" ? "border-primary" : ""}`}
                      onClick={() => setStatusFilter("all")}
                      data-testid="card-filter-all"
                    >
                      <CardHeader className="p-3 sm:pb-2">
                        <CardDescription className="text-xs">All</CardDescription>
                        <CardTitle className="text-xl sm:text-2xl">{counts.all}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card 
                      className={`cursor-pointer transition-colors min-w-[80px] ${statusFilter === "pending" ? "border-primary" : ""}`}
                      onClick={() => setStatusFilter("pending")}
                      data-testid="card-filter-pending"
                    >
                      <CardHeader className="p-3 sm:pb-2">
                        <CardDescription className="text-xs">Pending</CardDescription>
                        <CardTitle className="text-xl sm:text-2xl">{counts.pending}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card 
                      className={`cursor-pointer transition-colors min-w-[80px] ${statusFilter === "in_review" ? "border-primary" : ""}`}
                      onClick={() => setStatusFilter("in_review")}
                      data-testid="card-filter-in-review"
                    >
                      <CardHeader className="p-3 sm:pb-2">
                        <CardDescription className="text-xs whitespace-nowrap">In Review</CardDescription>
                        <CardTitle className="text-xl sm:text-2xl">{counts.in_review}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card 
                      className={`cursor-pointer transition-colors min-w-[80px] ${statusFilter === "approved" ? "border-primary" : ""}`}
                      onClick={() => setStatusFilter("approved")}
                      data-testid="card-filter-approved"
                    >
                      <CardHeader className="p-3 sm:pb-2">
                        <CardDescription className="text-xs">Approved</CardDescription>
                        <CardTitle className="text-xl sm:text-2xl">{counts.approved}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card 
                      className={`cursor-pointer transition-colors min-w-[80px] ${statusFilter === "rejected" ? "border-primary" : ""}`}
                      onClick={() => setStatusFilter("rejected")}
                      data-testid="card-filter-rejected"
                    >
                      <CardHeader className="p-3 sm:pb-2">
                        <CardDescription className="text-xs">Rejected</CardDescription>
                        <CardTitle className="text-xl sm:text-2xl">{counts.rejected}</CardTitle>
                      </CardHeader>
                    </Card>
                  </div>
                </div>

                <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                  <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                    <TabsList className="mb-4 min-w-max">
                      <TabsTrigger value="all" data-testid="tab-status-all" className="text-xs sm:text-sm">
                        All ({counts.all})
                      </TabsTrigger>
                      <TabsTrigger value="pending" data-testid="tab-status-pending" className="text-xs sm:text-sm">
                        Pending ({counts.pending})
                      </TabsTrigger>
                      <TabsTrigger value="in_review" data-testid="tab-status-in-review" className="text-xs sm:text-sm">
                        In Review ({counts.in_review})
                      </TabsTrigger>
                      <TabsTrigger value="approved" data-testid="tab-status-approved" className="text-xs sm:text-sm">
                        Approved ({counts.approved})
                      </TabsTrigger>
                      <TabsTrigger value="rejected" data-testid="tab-status-rejected" className="text-xs sm:text-sm">
                        Rejected ({counts.rejected})
                      </TabsTrigger>
                    </TabsList>

                  <TabsContent value={statusFilter} className="mt-0">
                    {!filteredApplications || filteredApplications.length === 0 ? (
                      <Card>
                        <CardContent className="py-12">
                          <div className="text-center">
                            <Inbox className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                            <h3 className="text-lg font-medium mb-2">No Applications</h3>
                            <p className="text-muted-foreground">
                              {statusFilter === "all" 
                                ? "There are no platform applications yet."
                                : `No ${statusFilter.replace("_", " ")} applications found.`}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-4">
                        {filteredApplications.map((application) => (
                          <Card key={application.id} data-testid={`card-application-${application.id}`}>
                            <CardContent className="pt-6">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-4 flex-1">
                                  <Avatar className="h-12 w-12">
                                    <AvatarImage src={application.applicant?.avatar_url || undefined} />
                                    <AvatarFallback>
                                      {getApplicantInitials(application)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="flex-1 space-y-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Globe className="h-4 w-4 text-primary" />
                                      <span className="font-semibold text-lg">
                                        {application.requested_platform_name}
                                      </span>
                                      {getStatusBadge(application.status)}
                                    </div>
                                    
                                    <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                                      <span className="flex items-center gap-1">
                                        <User className="h-4 w-4" />
                                        {getApplicantName(application)}
                                      </span>
                                      <span className="flex items-center gap-1">
                                        <MapPin className="h-4 w-4" />
                                        {getBoundaryTypeLabel(application.requested_boundary_type)}
                                      </span>
                                      {application.boundaries && application.boundaries.length > 0 && (
                                        <span>
                                          {application.boundaries.length} {application.boundaries.length === 1 ? "boundary" : "boundaries"}
                                        </span>
                                      )}
                                    </div>

                                    {application.city_description && (
                                      <p className="text-sm text-muted-foreground line-clamp-2">
                                        {application.city_description}
                                      </p>
                                    )}

                                    <div className="text-xs text-muted-foreground">
                                      Submitted {formatDistanceToNow(new Date(application.created_at), { addSuffix: true })}
                                      {application.reviewed_at && (
                                        <> · Reviewed {formatDistanceToNow(new Date(application.reviewed_at), { addSuffix: true })}</>
                                      )}
                                    </div>

                                    {application.created_platform && (
                                      <div className="flex items-center gap-2 mt-2">
                                        <Badge variant="outline" className="text-xs">
                                          <CheckCircle className="h-3 w-3 mr-1" />
                                          Platform Created: {application.created_platform.name}
                                        </Badge>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="flex gap-2 shrink-0">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleViewDetails(application)}
                                    data-testid={`button-view-${application.id}`}
                                  >
                                    <Eye className="h-4 w-4 mr-1" />
                                    View
                                  </Button>
                                  {application.status === "pending" && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedApplication(application);
                                        handleAction("in_review");
                                      }}
                                      disabled={reviewMutation.isPending}
                                      data-testid={`button-in-review-${application.id}`}
                                    >
                                      <Play className="h-4 w-4 mr-1" />
                                      In Review
                                    </Button>
                                  )}
                                  {(application.status === "pending" || application.status === "in_review") && (
                                    <>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setSelectedApplication(application);
                                          setDetailDialogOpen(true);
                                          setReviewAction("reject");
                                          setTimeout(() => setConfirmDialogOpen(true), 100);
                                        }}
                                        data-testid={`button-reject-${application.id}`}
                                      >
                                        <X className="h-4 w-4 mr-1" />
                                        Reject
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          setSelectedApplication(application);
                                          setDetailDialogOpen(true);
                                          setReviewAction("approve");
                                          setTimeout(() => setConfirmDialogOpen(true), 100);
                                        }}
                                        data-testid={`button-approve-${application.id}`}
                                      >
                                        <Check className="h-4 w-4 mr-1" />
                                        Approve
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                  </Tabs>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Delete Platform
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-3">
                <p>
                  Are you sure you want to delete <strong>{platformToDelete?.name}</strong>?
                </p>
                <p className="text-destructive font-medium">
                  This action cannot be undone. The following will be permanently deleted:
                </p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  <li>All platform boundaries ({platformToDelete?.church_count ? 'configured boundaries' : 'none'})</li>
                  <li>All linked churches ({platformToDelete?.church_count || 0} churches)</li>
                  <li>All platform users and owners ({platformToDelete?.owner_count || 0} users)</li>
                  <li>All membership requests</li>
                  <li>The platform itself</li>
                </ul>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteMutation.isPending}
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete Platform"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={detailDialogOpen} onOpenChange={(open) => {
          setDetailDialogOpen(open);
          if (!open) {
            setSelectedApplication(null);
            setReviewNotes("");
            setReviewAction(null);
          }
        }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                {selectedApplication?.requested_platform_name || "Application Details"}
              </DialogTitle>
              <DialogDescription>
                Platform application details and review
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 min-h-0 overflow-y-auto pr-4">
              {detailLoading ? (
                <div className="space-y-4 py-4">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-48 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : applicationDetail ? (
                <div className="space-y-6 py-4">
                  <div className="flex items-center gap-2">
                    {getStatusBadge(applicationDetail.status)}
                    {applicationDetail.created_platform && (
                      <Badge variant="outline">
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Platform: {applicationDetail.created_platform.slug}
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">Applicant</h4>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={applicationDetail.applicant?.avatar_url || undefined} />
                          <AvatarFallback>
                            {getApplicantInitials(applicationDetail)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{getApplicantName(applicationDetail)}</p>
                          <p className="text-sm text-muted-foreground">{applicationDetail.applicant_email}</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">Submitted</h4>
                      <p>{format(new Date(applicationDetail.created_at), "PPP 'at' p")}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground">Platform Details</h4>
                    <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Name:</span>
                        <span>{applicationDetail.requested_platform_name}</span>
                      </div>
                      {applicationDetail.requested_platform_slug && (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Slug:</span>
                          <code className="text-sm bg-muted px-2 py-0.5 rounded">{applicationDetail.requested_platform_slug}</code>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Boundary Type:</span>
                        <Badge variant="secondary">{getBoundaryTypeLabel(applicationDetail.requested_boundary_type)}</Badge>
                      </div>
                    </div>
                  </div>

                  {applicationDetail.boundaries && applicationDetail.boundaries.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Requested Boundaries ({applicationDetail.boundaries.length})
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {applicationDetail.boundaries.map((boundary) => (
                          <Badge key={boundary.id} variant="outline">
                            <MapPin className="h-3 w-3 mr-1" />
                            {boundary.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {applicationDetail.city_description && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">About the City</h4>
                      <p className="text-sm whitespace-pre-wrap">{applicationDetail.city_description}</p>
                    </div>
                  )}

                  {applicationDetail.ministry_vision && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">Ministry Vision</h4>
                      <p className="text-sm whitespace-pre-wrap">{applicationDetail.ministry_vision}</p>
                    </div>
                  )}

                  {applicationDetail.existing_partners && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">Existing Partners</h4>
                      <p className="text-sm whitespace-pre-wrap">{applicationDetail.existing_partners}</p>
                    </div>
                  )}

                  {applicationDetail.leadership_experience && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">Leadership Experience</h4>
                      <p className="text-sm whitespace-pre-wrap">{applicationDetail.leadership_experience}</p>
                    </div>
                  )}

                  {applicationDetail.expected_timeline && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">Expected Timeline</h4>
                      <p className="text-sm">{applicationDetail.expected_timeline}</p>
                    </div>
                  )}

                  {applicationDetail.reviewer_notes && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">Reviewer Notes</h4>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-sm whitespace-pre-wrap">{applicationDetail.reviewer_notes}</p>
                        {applicationDetail.reviewer && (
                          <p className="text-xs text-muted-foreground mt-2">
                            — {applicationDetail.reviewer.full_name || applicationDetail.reviewer.first_name}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <DialogFooter className="flex-shrink-0 gap-2 pt-4 border-t relative z-10">
              <Button
                variant="outline"
                onClick={() => setDetailDialogOpen(false)}
                data-testid="button-close-details"
              >
                Close
              </Button>
              {applicationDetail && (applicationDetail.status === "pending" || applicationDetail.status === "in_review") && (
                <>
                  {applicationDetail.status === "pending" && (
                    <Button
                      variant="outline"
                      onClick={() => handleAction("in_review")}
                      disabled={reviewMutation.isPending}
                      data-testid="button-mark-in-review"
                    >
                      {reviewMutation.isPending && reviewAction === "in_review" ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      Mark In Review
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => handleAction("reject")}
                    disabled={reviewMutation.isPending}
                    data-testid="button-reject-modal"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    onClick={() => handleAction("approve")}
                    disabled={reviewMutation.isPending}
                    data-testid="button-approve-modal"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {reviewAction === "approve" ? (
                  <span className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-primary" />
                    Approve Application
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-destructive" />
                    Reject Application
                  </span>
                )}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {reviewAction === "approve" ? (
                  <>
                    This will create a new platform called "<strong>{selectedApplication?.requested_platform_name}</strong>" 
                    and make <strong>{selectedApplication ? getApplicantName(selectedApplication) : "the applicant"}</strong> the platform owner.
                  </>
                ) : (
                  <>
                    This will reject the application for "<strong>{selectedApplication?.requested_platform_name}</strong>". 
                    The applicant will be notified.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-2">
              <Label htmlFor="reviewer-notes">
                {reviewAction === "approve" ? "Notes (Optional)" : "Rejection Reason"}
              </Label>
              <Textarea
                id="reviewer-notes"
                placeholder={reviewAction === "approve" 
                  ? "Add any notes about this approval..." 
                  : "Explain why this application is being rejected..."}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                data-testid="input-reviewer-notes"
              />
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel 
                onClick={() => {
                  setReviewNotes("");
                  setReviewAction(null);
                }}
                data-testid="button-cancel-confirm"
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmAction}
                className={reviewAction === "reject" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
                disabled={reviewMutation.isPending}
                data-testid="button-confirm-action"
              >
                {reviewMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : reviewAction === "approve" ? (
                  <CheckCircle className="h-4 w-4 mr-2" />
                ) : (
                  <XCircle className="h-4 w-4 mr-2" />
                )}
                {reviewAction === "approve" ? "Approve & Create Platform" : "Reject Application"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
}
