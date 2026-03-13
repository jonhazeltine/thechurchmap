import { useState, useRef } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { supabase } from "../../../../lib/supabaseClient";
import { formatDistanceToNow, format } from "date-fns";
import { uploadMedia } from "@/lib/upload";
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
  Plus,
  Edit,
  Trash2,
  Building,
  Globe,
  ExternalLink,
  Home,
  Users,
  RefreshCw,
  Handshake,
  Upload,
  Image as ImageIcon,
  MapPin,
} from "lucide-react";
import { IconBuildingChurch } from "@tabler/icons-react";
import type { 
  PartnershipApplication, 
  PartnershipApplicationStatus, 
  PartnershipApplicationPath,
  Sponsor,
  SponsorLevel,
  SponsorType,
  SponsorAssignment,
  InsertSponsor,
  MissionFundingSubmission,
  MissionFundingSubmissionStatus,
} from "@shared/schema";
import { missionFundingSubmissionStatuses, sponsorTypes } from "@shared/schema";

interface ApplicationsResponse {
  applications: PartnershipApplication[];
  total: number;
}

interface SponsorsResponse {
  sponsors: SponsorWithAssignments[];
  total: number;
}

interface SponsorWithAssignments extends Sponsor {
  assignments?: SponsorAssignment[];
}

interface ChurchSearchResult {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
}

interface PlatformSearchResult {
  id: string;
  name: string;
  slug: string;
}

interface Platform {
  id: string;
  name: string;
  slug: string;
}

interface PlatformRegion {
  id: string;
  name: string;
  color: string;
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

const levelColors: Record<SponsorLevel, string> = {
  platform: "bg-purple-500",
  regional: "bg-blue-500",
  church: "bg-green-500",
};

const levelLabels: Record<SponsorLevel, string> = {
  platform: "Platform",
  regional: "Regional",
  church: "Church",
};

const submissionStatusColors: Record<MissionFundingSubmissionStatus, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  contacted: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  converted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  closed: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
};

const buyerSellerLabels: Record<string, string> = {
  buyer: "Buyer",
  seller: "Seller",
  both: "Both",
};

const timelineLabels: Record<string, string> = {
  '0_3_months': '0-3 months',
  '3_6_months': '3-6 months',
  '6_plus_months': '6+ months',
};

const emptyForm: InsertSponsor & { region_ids?: string[]; headshot_url?: string } = {
  name: "",
  logo_url: "",
  headshot_url: "",
  website_url: "",
  contact_email: "",
  contact_phone: "",
  description: "",
  level: "church",
  sponsor_type: "other",
  nmls_number: "",
  agent_license_number: "",
  is_active: true,
  sort_order: 0,
  city_platform_id: null,
  region_ids: [],
};

const sponsorTypeLabels: Record<SponsorType, string> = {
  realtor: "Realtor",
  lender: "Lender",
  other: "Other",
};

function ApplicationsTab() {
  const { toast } = useToast();
  const { isSuperAdmin, isPlatformAdmin } = useAdminAccess();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PartnershipApplicationStatus>("all");
  const [pathFilter, setPathFilter] = useState<"all" | PartnershipApplicationPath>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<PartnershipApplication | null>(null);
  const [reviewAction, setReviewAction] = useState<"reviewed" | "closed" | null>(null);
  const [reviewerNotes, setReviewerNotes] = useState("");

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

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h3 className="mt-4 text-lg font-semibold">Error Loading Applications</h3>
        <p className="text-muted-foreground mt-2">Please try again later.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
              <CardDescription>Click on a row to expand details</CardDescription>
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
          {filteredApplications && filteredApplications.length > 0 ? (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Church</TableHead>
                    <TableHead>Latest Applicant</TableHead>
                    <TableHead>Path</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submissions</TableHead>
                    <TableHead>Last Updated</TableHead>
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
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpanded(app.id);
                              }}
                            >
                              {expandedIds.has(app.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{app.church?.name || "Unknown Church"}</div>
                            {app.church?.city && app.church?.state && (
                              <div className="text-sm text-muted-foreground">{app.church.city}, {app.church.state}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{app.applicant_name}</div>
                            <div className="text-sm text-muted-foreground">{app.applicant_email}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="pointer-events-none">{pathLabels[app.path]}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={statusColors[app.status]}>
                              {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="pointer-events-none">
                              {app.submission_count || 1}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{formatDistanceToNow(new Date(app.updated_at || app.created_at), { addSuffix: true })}</span>
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-2">
                              {app.status === "new" && (
                                <>
                                  <Button size="sm" variant="default" onClick={() => openReviewDialog(app, "reviewed")}>
                                    <Check className="h-4 w-4 mr-1" />Approve
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => openReviewDialog(app, "closed")}>
                                    <X className="h-4 w-4 mr-1" />Reject
                                  </Button>
                                </>
                              )}
                              {app.status === "reviewed" && <Badge className="bg-green-500">Approved</Badge>}
                              {app.status === "closed" && <Badge variant="secondary">Rejected</Badge>}
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
                                        <a href={`mailto:${app.applicant_email}`} className="text-primary hover:underline">{app.applicant_email}</a>
                                      </div>
                                      {app.applicant_phone && (
                                        <div className="flex items-center gap-2">
                                          <Phone className="h-4 w-4 text-muted-foreground" />
                                          <a href={`tel:${app.applicant_phone}`} className="text-primary hover:underline">{app.applicant_phone}</a>
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
                                      <div><span className="text-muted-foreground">Role: </span>{app.applicant_role}</div>
                                      <div>
                                        <span className="text-muted-foreground">Authority Affirmation: </span>
                                        {app.has_authority_affirmation ? (
                                          <Badge variant="outline" className="text-green-600">Yes</Badge>
                                        ) : (
                                          <Badge variant="outline" className="text-red-600">No</Badge>
                                        )}
                                      </div>
                                      <div><span className="text-muted-foreground">Submitted: </span>{format(new Date(app.created_at), "PPpp")}</div>
                                    </div>
                                  </div>
                                </div>
                                {app.notes && (
                                  <div className="space-y-2">
                                    <h4 className="font-semibold text-sm">Applicant Notes</h4>
                                    <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">{app.notes}</p>
                                  </div>
                                )}
                                {app.reviewer_notes && (
                                  <div className="space-y-2">
                                    <h4 className="font-semibold text-sm">Reviewer Notes</h4>
                                    <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">{app.reviewer_notes}</p>
                                  </div>
                                )}
                                {app.reviewed_at && (
                                  <div className="text-sm text-muted-foreground">Last reviewed: {format(new Date(app.reviewed_at), "PPpp")}</div>
                                )}
                                {app.submissions && app.submissions.length > 1 && (
                                  <div className="space-y-3 pt-4 border-t">
                                    <h4 className="font-semibold text-sm flex items-center gap-2">
                                      <FileText className="h-4 w-4" />
                                      Submission History ({app.submissions.length} submissions)
                                    </h4>
                                    <div className="space-y-2">
                                      {app.submissions.map((sub: any, index: number) => (
                                        <div key={sub.id} className="bg-muted/50 p-3 rounded-md text-sm">
                                          <div className="flex flex-wrap items-center gap-2 mb-1">
                                            <Badge variant="outline" className="text-xs">
                                              {index === 0 ? "Latest" : `#${app.submissions!.length - index}`}
                                            </Badge>
                                            <Badge variant="secondary" className="text-xs">{pathLabels[sub.path as PartnershipApplicationPath]}</Badge>
                                            <span className="text-muted-foreground text-xs">
                                              {format(new Date(sub.created_at), "PPp")}
                                            </span>
                                          </div>
                                          <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                                            <div><span className="text-muted-foreground">Name:</span> {sub.applicant_name}</div>
                                            <div><span className="text-muted-foreground">Role:</span> {sub.applicant_role}</div>
                                            <div><span className="text-muted-foreground">Email:</span> {sub.applicant_email}</div>
                                            {sub.applicant_phone && <div><span className="text-muted-foreground">Phone:</span> {sub.applicant_phone}</div>}
                                          </div>
                                          {sub.notes && <div className="mt-2 text-xs text-muted-foreground italic">{sub.notes}</div>}
                                        </div>
                                      ))}
                                    </div>
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
            <DialogTitle>{reviewAction === "reviewed" ? "Approve Partnership" : "Reject Application"}</DialogTitle>
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
                value={reviewerNotes}
                onChange={(e) => setReviewerNotes(e.target.value)}
                placeholder="Add any notes about this decision..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmitReview}
              disabled={updateApplicationMutation.isPending}
              variant={reviewAction === "closed" ? "destructive" : "default"}
            >
              {updateApplicationMutation.isPending ? "Saving..." : reviewAction === "reviewed" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SponsorsTab() {
  const { toast } = useToast();
  const { isSuperAdmin, isPlatformAdmin } = useAdminAccess();

  const [searchTerm, setSearchTerm] = useState("");
  const [levelFilter, setLevelFilter] = useState<"all" | SponsorLevel>("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingSponsor, setEditingSponsor] = useState<Sponsor | null>(null);
  const [formData, setFormData] = useState<InsertSponsor & { region_ids?: string[] }>(emptyForm);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sponsorToDelete, setSponsorToDelete] = useState<Sponsor | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isHeadshotUploading, setIsHeadshotUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const headshotInputRef = useRef<HTMLInputElement>(null);
  
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assigningSponsor, setAssigningSponsor] = useState<Sponsor | null>(null);
  const [churchSearch, setChurchSearch] = useState("");
  const [selectedChurch, setSelectedChurch] = useState<ChurchSearchResult | null>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const result = await uploadMedia(file);
      if (result?.url) {
        setFormData({ ...formData, logo_url: result.url });
        toast({ title: "Logo uploaded", description: "Logo uploaded successfully." });
      } else {
        toast({ title: "Upload failed", description: "Failed to upload logo.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Upload error", description: "An error occurred while uploading.", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleHeadshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsHeadshotUploading(true);
    try {
      const result = await uploadMedia(file);
      if (result?.url) {
        setFormData({ ...formData, headshot_url: result.url });
        toast({ title: "Headshot uploaded", description: "Headshot uploaded successfully." });
      } else {
        toast({ title: "Upload failed", description: "Failed to upload headshot.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Upload error", description: "An error occurred while uploading.", variant: "destructive" });
    } finally {
      setIsHeadshotUploading(false);
      if (headshotInputRef.current) {
        headshotInputRef.current.value = "";
      }
    }
  };

  const hasAccess = isSuperAdmin || isPlatformAdmin;

  // Fetch all platforms for super admins
  const { data: platforms } = useQuery<Platform[]>({
    queryKey: ['/api/platforms'],
    enabled: isSuperAdmin,
  });

  // Fetch regions for selected platform in form
  const selectedFormPlatformId = formData.city_platform_id;
  const { data: regionsData } = useQuery<PlatformRegion[]>({
    queryKey: [`/api/admin/city-platforms/${selectedFormPlatformId}/regions`],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/admin/city-platforms/${selectedFormPlatformId}/regions`);
      // Only return regions array if it exists and contains valid region objects
      const regions = response?.regions;
      if (Array.isArray(regions) && regions.every((r: any) => r.id && r.name && 'color' in r)) {
        return regions;
      }
      return [];
    },
    enabled: !!selectedFormPlatformId && formData.level === "regional",
    staleTime: 0, // Always fetch fresh data
  });

  const { data, isLoading, error } = useQuery<SponsorsResponse>({
    queryKey: ["/api/admin/sponsors", platformFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (platformFilter !== "all") {
        params.append("city_platform_id", platformFilter);
      }
      const response = await apiRequest("GET", `/api/admin/sponsors?${params.toString()}`);
      return response;
    },
    enabled: hasAccess,
  });

  const createSponsorMutation = useMutation({
    mutationFn: async (data: InsertSponsor) => {
      return apiRequest("POST", "/api/admin/sponsors", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sponsors"] });
      setFormDialogOpen(false);
      setFormData(emptyForm);
      toast({ title: "Sponsor Created", description: "The sponsor has been created successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateSponsorMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertSponsor> }) => {
      return apiRequest("PATCH", `/api/admin/sponsors/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sponsors"] });
      setFormDialogOpen(false);
      setEditingSponsor(null);
      setFormData(emptyForm);
      toast({ title: "Sponsor Updated", description: "The sponsor has been updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteSponsorMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/sponsors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sponsors"] });
      setDeleteDialogOpen(false);
      setSponsorToDelete(null);
      toast({ title: "Sponsor Deleted", description: "The sponsor has been deleted." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const { data: churchesData, isLoading: isSearchingChurches } = useQuery<ChurchSearchResult[]>({
    queryKey: ["/api/churches/search", churchSearch, "jv_only"],
    queryFn: async () => {
      return apiRequest("GET", `/api/churches/search?q=${encodeURIComponent(churchSearch)}&jv_only=true`);
    },
    enabled: assignDialogOpen && churchSearch.length >= 2,
  });

  const addAssignmentMutation = useMutation({
    mutationFn: async (data: { sponsor_id: string; church_id: string }) => {
      return apiRequest("POST", `/api/admin/sponsors/${data.sponsor_id}/assignments`, { church_id: data.church_id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sponsors"] });
      setAssignDialogOpen(false);
      setAssigningSponsor(null);
      setSelectedChurch(null);
      setChurchSearch("");
      toast({ title: "Assignment Added", description: "Sponsor assigned to church successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const removeAssignmentMutation = useMutation({
    mutationFn: async ({ sponsorId, assignmentId }: { sponsorId: string; assignmentId: string }) => {
      return apiRequest("DELETE", `/api/admin/sponsors/${sponsorId}/assignments?assignment_id=${assignmentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sponsors"] });
      toast({ title: "Assignment Removed", description: "Sponsor assignment removed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openAssignDialog = (sponsor: Sponsor) => {
    setAssigningSponsor(sponsor);
    setSelectedChurch(null);
    setChurchSearch("");
    setAssignDialogOpen(true);
  };

  const handleAddAssignment = () => {
    if (!assigningSponsor || !selectedChurch) return;
    addAssignmentMutation.mutate({ sponsor_id: assigningSponsor.id, church_id: selectedChurch.id });
  };

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIds(newExpanded);
  };

  const openCreateDialog = () => {
    setEditingSponsor(null);
    // Auto-populate platform from current filter
    setFormData({
      ...emptyForm,
      city_platform_id: platformFilter !== "all" ? platformFilter : null,
      region_ids: [],
    });
    setFormDialogOpen(true);
  };

  const openEditDialog = (sponsor: Sponsor) => {
    setEditingSponsor(sponsor);
    setFormData({
      name: sponsor.name,
      logo_url: sponsor.logo_url || "",
      headshot_url: sponsor.headshot_url || "",
      website_url: sponsor.website_url || "",
      contact_email: sponsor.contact_email || "",
      contact_phone: sponsor.contact_phone || "",
      description: sponsor.description || "",
      level: sponsor.level,
      sponsor_type: sponsor.sponsor_type || "other",
      nmls_number: sponsor.nmls_number || "",
      agent_license_number: sponsor.agent_license_number || "",
      is_active: sponsor.is_active,
      sort_order: sponsor.sort_order,
      city_platform_id: sponsor.city_platform_id || null,
      region_ids: [],
    });
    setFormDialogOpen(true);
  };

  const openDeleteDialog = (sponsor: Sponsor) => {
    setSponsorToDelete(sponsor);
    setDeleteDialogOpen(true);
  };

  const handleFormSubmit = () => {
    const cleanedData = {
      ...formData,
      logo_url: formData.logo_url || null,
      headshot_url: formData.headshot_url || null,
      website_url: formData.website_url || null,
      contact_email: formData.contact_email || null,
      contact_phone: formData.contact_phone || null,
      description: formData.description || null,
      sponsor_type: formData.sponsor_type || "other",
      nmls_number: formData.nmls_number || null,
      agent_license_number: formData.agent_license_number || null,
    };

    if (editingSponsor) {
      updateSponsorMutation.mutate({ id: editingSponsor.id, data: cleanedData });
    } else {
      createSponsorMutation.mutate(cleanedData as InsertSponsor);
    }
  };

  const filteredSponsors = data?.sponsors?.filter((sponsor) => {
    if (levelFilter !== "all" && sponsor.level !== levelFilter) return false;
    if (activeFilter === "active" && !sponsor.is_active) return false;
    if (activeFilter === "inactive" && sponsor.is_active) return false;
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        sponsor.name.toLowerCase().includes(searchLower) ||
        sponsor.contact_email?.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  const stats = {
    total: data?.sponsors?.length || 0,
    active: data?.sponsors?.filter((s) => s.is_active).length || 0,
    platform: data?.sponsors?.filter((s) => s.level === "platform").length || 0,
    regional: data?.sponsors?.filter((s) => s.level === "regional").length || 0,
    church: data?.sponsors?.filter((s) => s.level === "church").length || 0,
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h3 className="mt-4 text-lg font-semibold">Error Loading Sponsors</h3>
        <p className="text-muted-foreground mt-2">Please try again later.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={openCreateDialog} data-testid="button-create-sponsor">
          <Plus className="h-4 w-4 mr-2" />
          Add Sponsor
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-sponsors">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Platform</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{stats.platform}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Regional</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.regional}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Church</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.church}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle>All Sponsors</CardTitle>
              <CardDescription>Click on a row to expand and manage assignments</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-sponsors"
                />
              </div>
              <Select value={levelFilter} onValueChange={(val) => setLevelFilter(val as any)}>
                <SelectTrigger className="w-32" data-testid="select-level-filter">
                  <SelectValue placeholder="Level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="platform">Platform</SelectItem>
                  <SelectItem value="regional">Regional</SelectItem>
                  <SelectItem value="church">Church</SelectItem>
                </SelectContent>
              </Select>
              <Select value={activeFilter} onValueChange={(val) => setActiveFilter(val as any)}>
                <SelectTrigger className="w-32" data-testid="select-active-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              {isSuperAdmin && platforms && (
                <Select value={platformFilter} onValueChange={setPlatformFilter}>
                  <SelectTrigger className="w-40" data-testid="select-platform-filter">
                    <SelectValue placeholder="Platform" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Platforms</SelectItem>
                    {platforms.map((platform) => (
                      <SelectItem key={platform.id} value={platform.id}>
                        {platform.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredSponsors && filteredSponsors.length > 0 ? (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Sponsor</TableHead>
                    {isSuperAdmin && <TableHead>Platform</TableHead>}
                    <TableHead>Level</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assignments</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSponsors.map((sponsor) => (
                    <Collapsible key={sponsor.id} asChild open={expandedIds.has(sponsor.id)}>
                      <>
                        <TableRow
                          className="cursor-pointer hover-elevate"
                          onClick={() => toggleExpanded(sponsor.id)}
                          data-testid={`row-sponsor-${sponsor.id}`}
                        >
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpanded(sponsor.id);
                              }}
                            >
                              {expandedIds.has(sponsor.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-10 w-10">
                                <AvatarImage src={sponsor.headshot_url || sponsor.logo_url || undefined} alt={sponsor.name} />
                                <AvatarFallback>{sponsor.name.charAt(0).toUpperCase()}</AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-medium">{sponsor.name}</div>
                                {sponsor.sponsor_type === 'lender' && sponsor.nmls_number && (
                                  <div className="text-xs text-muted-foreground">NMLS# {sponsor.nmls_number}</div>
                                )}
                                {sponsor.sponsor_type === 'realtor' && sponsor.agent_license_number && (
                                  <div className="text-xs text-muted-foreground">License# {sponsor.agent_license_number}</div>
                                )}
                                {sponsor.website_url && (
                                  <a
                                    href={sponsor.website_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Globe className="h-3 w-3" />Website
                                  </a>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          {isSuperAdmin && (
                            <TableCell>
                              {sponsor.city_platform ? (
                                <div className="flex items-center gap-1 text-sm">
                                  <MapPin className="h-3 w-3 text-muted-foreground" />
                                  {sponsor.city_platform.name}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </TableCell>
                          )}
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              <Badge className={levelColors[sponsor.level]}>{levelLabels[sponsor.level]}</Badge>
                              {/* Show Church tag if sponsor has church assignments but level is not already 'church' */}
                              {sponsor.level !== 'church' && sponsor.assignments && sponsor.assignments.length > 0 && (
                                <Badge className={levelColors['church']}>{levelLabels['church']}</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{sponsor.contact_email && <div className="text-sm">{sponsor.contact_email}</div>}</TableCell>
                          <TableCell>
                            <Badge variant={sponsor.is_active ? "default" : "secondary"}>{sponsor.is_active ? "Active" : "Inactive"}</Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">{sponsor.assignments?.length || 0} assignments</span>
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" onClick={() => openEditDialog(sponsor)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => openDeleteDialog(sponsor)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        <CollapsibleContent asChild>
                          <TableRow className="bg-muted/30">
                            <TableCell colSpan={isSuperAdmin ? 8 : 7} className="p-0">
                              <div className="p-6 space-y-4">
                                {sponsor.description && (
                                  <div className="text-sm text-muted-foreground">{sponsor.description}</div>
                                )}
                                <div className="flex flex-wrap gap-4 text-sm">
                                  {sponsor.contact_email && (
                                    <div className="flex items-center gap-2">
                                      <Mail className="h-4 w-4 text-muted-foreground" />
                                      <a href={`mailto:${sponsor.contact_email}`} className="text-primary hover:underline">{sponsor.contact_email}</a>
                                    </div>
                                  )}
                                  {sponsor.contact_phone && (
                                    <div className="flex items-center gap-2">
                                      <Phone className="h-4 w-4 text-muted-foreground" />
                                      <a href={`tel:${sponsor.contact_phone}`} className="text-primary hover:underline">{sponsor.contact_phone}</a>
                                    </div>
                                  )}
                                </div>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-medium flex items-center gap-2">
                                      <IconBuildingChurch className="h-4 w-4" /> Church Assignments
                                    </h4>
                                    <Button size="sm" variant="outline" onClick={() => openAssignDialog(sponsor)} data-testid={`button-assign-church-${sponsor.id}`}>
                                      <Plus className="h-4 w-4 mr-1" /> Assign to Church
                                    </Button>
                                  </div>
                                  {sponsor.assignments && sponsor.assignments.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                      {sponsor.assignments.map((assignment: any) => (
                                        <Badge key={assignment.id} variant="secondary" className="flex items-center gap-1">
                                          <IconBuildingChurch className="h-3 w-3" />
                                          {assignment.church?.name || assignment.platform?.name || "Unknown"}
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-4 w-4 ml-1 hover:bg-destructive/20"
                                            onClick={() => removeAssignmentMutation.mutate({ sponsorId: sponsor.id, assignmentId: assignment.id })}
                                            data-testid={`button-remove-assignment-${assignment.id}`}
                                          >
                                            <X className="h-3 w-3" />
                                          </Button>
                                        </Badge>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-sm text-muted-foreground">No church assignments yet</p>
                                  )}
                                </div>
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
              <Building className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No Sponsors Found</h3>
              <p className="text-muted-foreground mt-2">
                {searchTerm || levelFilter !== "all" || activeFilter !== "all"
                  ? "Try adjusting your filters"
                  : "No sponsors have been added yet"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSponsor ? "Edit Sponsor" : "Add Sponsor"}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            <div className="space-y-4 py-4 pr-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} data-testid="input-sponsor-name" />
              </div>
              {isSuperAdmin && platforms && (
                <div className="space-y-2">
                  <Label htmlFor="platform">Platform *</Label>
                  <Select 
                    value={formData.city_platform_id || ""} 
                    onValueChange={(val) => setFormData({ ...formData, city_platform_id: val || null, region_ids: [] })}
                  >
                    <SelectTrigger data-testid="select-sponsor-platform">
                      <SelectValue placeholder="Select a platform" />
                    </SelectTrigger>
                    <SelectContent className="z-[600]">
                      {platforms.map((platform) => (
                        <SelectItem key={platform.id} value={platform.id}>
                          {platform.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="level">Level</Label>
                <Select 
                  value={formData.level} 
                  onValueChange={(val) => setFormData({ ...formData, level: val as SponsorLevel, region_ids: [] })}
                >
                  <SelectTrigger data-testid="select-sponsor-level"><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[600]">
                    <SelectItem value="platform">Platform</SelectItem>
                    <SelectItem value="regional">Regional</SelectItem>
                    <SelectItem value="church">Church</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.level === "regional" && formData.city_platform_id && regionsData && regionsData.length > 0 && (
                <div className="space-y-2">
                  <Label>Regions</Label>
                  <div className="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
                    {regionsData.map((region) => (
                      <div key={region.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`region-${region.id}`}
                          checked={formData.region_ids?.includes(region.id) || false}
                          onCheckedChange={(checked) => {
                            const currentRegions = formData.region_ids || [];
                            if (checked) {
                              setFormData({ ...formData, region_ids: [...currentRegions, region.id] });
                            } else {
                              setFormData({ ...formData, region_ids: currentRegions.filter(id => id !== region.id) });
                            }
                          }}
                        />
                        <label htmlFor={`region-${region.id}`} className="text-sm flex items-center gap-2 cursor-pointer">
                          <span 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: region.color }}
                          />
                          {region.name}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="sponsor_type">Sponsor Type</Label>
                <Select value={formData.sponsor_type || "other"} onValueChange={(val) => setFormData({ ...formData, sponsor_type: val as SponsorType })}>
                  <SelectTrigger data-testid="select-sponsor-type"><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[600]">
                    {sponsorTypes.map((type) => (
                      <SelectItem key={type} value={type}>{sponsorTypeLabels[type]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {formData.sponsor_type === "lender" && (
                <div className="space-y-2">
                  <Label htmlFor="nmls_number">NMLS Number</Label>
                  <Input id="nmls_number" value={formData.nmls_number || ""} onChange={(e) => setFormData({ ...formData, nmls_number: e.target.value })} placeholder="e.g., 123456" data-testid="input-nmls-number" />
                </div>
              )}
              {formData.sponsor_type === "realtor" && (
                <div className="space-y-2">
                  <Label htmlFor="agent_license_number">Agent License Number</Label>
                  <Input id="agent_license_number" value={formData.agent_license_number || ""} onChange={(e) => setFormData({ ...formData, agent_license_number: e.target.value })} placeholder="e.g., MI-12345678" data-testid="input-agent-license" />
                </div>
              )}
              <div className="space-y-2">
                <Label>Logo</Label>
                <p className="text-xs text-muted-foreground">Recommended: Horizontal format (2:1 or 3:1 ratio), at least 800px wide for best display</p>
                {formData.logo_url && (
                  <div className="relative w-40 h-20 rounded-md border overflow-hidden mb-2 bg-white">
                    <img src={formData.logo_url} alt="Logo preview" className="w-full h-full object-contain" />
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="absolute top-1 right-1 h-6 w-6"
                      onClick={() => setFormData({ ...formData, logo_url: "" })}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                    id="logo-upload"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    data-testid="button-upload-logo"
                  >
                    {isUploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    Upload Logo
                  </Button>
                </div>
                <div className="mt-2">
                  <Label htmlFor="logo_url" className="text-xs text-muted-foreground">Or enter URL directly:</Label>
                  <Input id="logo_url" value={formData.logo_url || ""} onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })} placeholder="https://..." className="mt-1" data-testid="input-logo-url" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Headshot (Optional)</Label>
                {formData.headshot_url && (
                  <div className="relative w-24 h-24 rounded-md border overflow-hidden mb-2">
                    <img src={formData.headshot_url} alt="Headshot preview" className="w-full h-full object-cover" />
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="absolute top-1 right-1 h-6 w-6"
                      onClick={() => setFormData({ ...formData, headshot_url: "" })}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    ref={headshotInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleHeadshotUpload}
                    className="hidden"
                    id="headshot-upload"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => headshotInputRef.current?.click()}
                    disabled={isHeadshotUploading}
                    data-testid="button-upload-headshot"
                  >
                    {isHeadshotUploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    Upload Headshot
                  </Button>
                </div>
                <div className="mt-2">
                  <Label htmlFor="headshot_url" className="text-xs text-muted-foreground">Or enter URL directly:</Label>
                  <Input id="headshot_url" value={formData.headshot_url || ""} onChange={(e) => setFormData({ ...formData, headshot_url: e.target.value })} placeholder="https://..." className="mt-1" data-testid="input-headshot-url" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="website_url">Website</Label>
                <Input id="website_url" value={formData.website_url || ""} onChange={(e) => setFormData({ ...formData, website_url: e.target.value })} data-testid="input-website-url" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_email">Contact Email</Label>
                <Input id="contact_email" type="email" value={formData.contact_email || ""} onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })} data-testid="input-contact-email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_phone">Contact Phone</Label>
                <Input id="contact_phone" value={formData.contact_phone || ""} onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })} data-testid="input-contact-phone" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" value={formData.description || ""} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} data-testid="input-description" />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="is_active">Active</Label>
                <Switch id="is_active" checked={formData.is_active} onCheckedChange={(val) => setFormData({ ...formData, is_active: val })} data-testid="switch-is-active" />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleFormSubmit} disabled={createSponsorMutation.isPending || updateSponsorMutation.isPending || !formData.name} data-testid="button-save-sponsor">
              {createSponsorMutation.isPending || updateSponsorMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sponsor</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{sponsorToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => sponsorToDelete && deleteSponsorMutation.mutate(sponsorToDelete.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Sponsor to Church</DialogTitle>
            <DialogDescription>
              Search for a church to assign "{assigningSponsor?.name}" to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Search Church</Label>
              <Input
                placeholder="Type at least 2 characters..."
                value={churchSearch}
                onChange={(e) => setChurchSearch(e.target.value)}
                data-testid="input-church-search"
              />
            </div>
            {churchSearch.length >= 2 && isSearchingChurches && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
              </div>
            )}
            {churchSearch.length >= 2 && !isSearchingChurches && churchesData && churchesData.length > 0 && (
              <div className="border rounded-md max-h-48 overflow-y-auto">
                {churchesData.map((church) => (
                  <div
                    key={church.id}
                    className={`p-3 cursor-pointer hover-elevate ${selectedChurch?.id === church.id ? 'bg-primary/10' : ''}`}
                    onClick={() => setSelectedChurch(church)}
                    data-testid={`option-church-${church.id}`}
                  >
                    <div className="font-medium">{church.name}</div>
                    {church.address && (
                      <div className="text-sm text-muted-foreground">{church.address}</div>
                    )}
                    {church.city && church.state && (
                      <div className="text-sm text-muted-foreground">{church.city}, {church.state}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {selectedChurch && (
              <div className="p-3 bg-muted rounded-md">
                <div className="text-sm text-muted-foreground">Selected:</div>
                <div className="font-medium flex items-center gap-2">
                  <IconBuildingChurch className="h-4 w-4 shrink-0" />
                  <div>
                    <div>{selectedChurch.name}</div>
                    {selectedChurch.address && (
                      <div className="text-sm text-muted-foreground">{selectedChurch.address}</div>
                    )}
                    {selectedChurch.city && selectedChurch.state && (
                      <div className="text-sm text-muted-foreground">{selectedChurch.city}, {selectedChurch.state}</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleAddAssignment}
              disabled={!selectedChurch || addAssignmentMutation.isPending}
              data-testid="button-confirm-assignment"
            >
              {addAssignmentMutation.isPending ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LeadsTab() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedSubmission, setSelectedSubmission] = useState<MissionFundingSubmission | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [newStatus, setNewStatus] = useState<MissionFundingSubmissionStatus | "">("");

  const { data, isLoading, refetch } = useQuery<{ submissions: MissionFundingSubmission[]; total: number }>({
    queryKey: ["/api/admin/mission-funding-submissions", statusFilter],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      const response = await fetch(`/api/admin/mission-funding-submissions?${params}`, {
        headers,
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch submissions");
      return response.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, admin_notes }: { id: string; status: MissionFundingSubmissionStatus; admin_notes: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/admin/mission-funding-submissions?id=${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ status, admin_notes }),
      });
      if (!response.ok) throw new Error("Failed to update submission");
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Submission updated" });
      setSelectedSubmission(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/mission-funding-submissions"] });
    },
    onError: (error: Error) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  const handleUpdate = () => {
    if (!selectedSubmission || !newStatus) return;
    updateMutation.mutate({
      id: selectedSubmission.id,
      status: newStatus,
      admin_notes: adminNotes,
    });
  };

  const openEditDialog = (submission: MissionFundingSubmission) => {
    setSelectedSubmission(submission);
    setAdminNotes(submission.admin_notes || "");
    setNewStatus(submission.status);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="w-5 h-5" />
            Buyer/Seller Leads
            {data && <Badge variant="secondary">{data.total}</Badge>}
          </CardTitle>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" data-testid="select-leads-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {missionFundingSubmissionStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {data?.submissions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No submissions found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Timeline</TableHead>
                  <TableHead>Church</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.submissions.map((submission) => (
                  <TableRow key={submission.id} data-testid={`row-submission-${submission.id}`}>
                    <TableCell className="font-medium">
                      {submission.first_name} {submission.last_name}
                    </TableCell>
                    <TableCell>{submission.email}</TableCell>
                    <TableCell>{submission.phone || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {buyerSellerLabels[submission.buyer_seller_type] || submission.buyer_seller_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {submission.timeline ? timelineLabels[submission.timeline] : "-"}
                    </TableCell>
                    <TableCell>
                      {submission.church?.name || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge className={submissionStatusColors[submission.status]}>
                        {submission.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(submission.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => openEditDialog(submission)}
                        data-testid={`button-edit-lead-${submission.id}`}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedSubmission} onOpenChange={() => setSelectedSubmission(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Submission</DialogTitle>
          </DialogHeader>
          {selectedSubmission && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">
                  {selectedSubmission.first_name} {selectedSubmission.last_name}
                </p>
                <p className="text-sm text-muted-foreground">{selectedSubmission.email}</p>
                {selectedSubmission.notes && (
                  <div className="mt-2 p-2 bg-muted rounded text-sm">
                    <strong>Notes:</strong> {selectedSubmission.notes}
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={newStatus} onValueChange={(v) => setNewStatus(v as MissionFundingSubmissionStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {missionFundingSubmissionStatuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Admin Notes</label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Internal notes about this submission..."
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSelectedSubmission(null)}>Cancel</Button>
                <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PartnershipsAdmin() {
  const { isSuperAdmin, isPlatformAdmin, isLoading: accessLoading } = useAdminAccess();

  const hasAccess = isSuperAdmin || isPlatformAdmin;

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
                  You need admin privileges to view this page.
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
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2" data-testid="heading-partnerships">
            <Handshake className="h-8 w-8" />
            Partnerships
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage partnership applications, sponsors, and buyer/seller leads
          </p>
        </div>

        <Tabs defaultValue="applications" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="applications" data-testid="tab-applications">
              <FileText className="h-4 w-4 mr-2" />
              Applications
            </TabsTrigger>
            <TabsTrigger value="sponsors" data-testid="tab-sponsors">
              <Building className="h-4 w-4 mr-2" />
              Sponsors
            </TabsTrigger>
            <TabsTrigger value="leads" data-testid="tab-leads">
              <Users className="h-4 w-4 mr-2" />
              Leads
            </TabsTrigger>
          </TabsList>

          <TabsContent value="applications" className="mt-6">
            <ApplicationsTab />
          </TabsContent>

          <TabsContent value="sponsors" className="mt-6">
            <SponsorsTab />
          </TabsContent>

          <TabsContent value="leads" className="mt-6">
            <LeadsTab />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
