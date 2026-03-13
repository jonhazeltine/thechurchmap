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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import {
  Search,
  Loader2,
  Plus,
  Edit,
  Trash2,
  ChevronDown,
  ChevronRight,
  Building,
  Globe,
  Mail,
  Phone,
  ExternalLink,
  AlertCircle,
  X,
} from "lucide-react";
import { IconBuildingChurch } from "@tabler/icons-react";
import type { Sponsor, SponsorLevel, SponsorAssignment, InsertSponsor } from "@shared/schema";

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
  city: string | null;
  state: string | null;
}

interface PlatformSearchResult {
  id: string;
  name: string;
  slug: string;
}

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

const emptyForm: InsertSponsor = {
  name: "",
  logo_url: "",
  website_url: "",
  contact_email: "",
  contact_phone: "",
  description: "",
  level: "church",
  is_active: true,
  sort_order: 0,
};

export default function SponsorsAdmin() {
  const { toast } = useToast();
  const { isSuperAdmin, isPlatformAdmin, isLoading: accessLoading } = useAdminAccess();

  const [searchTerm, setSearchTerm] = useState("");
  const [levelFilter, setLevelFilter] = useState<"all" | SponsorLevel>("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingSponsor, setEditingSponsor] = useState<Sponsor | null>(null);
  const [formData, setFormData] = useState<InsertSponsor>(emptyForm);
  
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sponsorToDelete, setSponsorToDelete] = useState<Sponsor | null>(null);
  
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assigningSponsor, setAssigningSponsor] = useState<Sponsor | null>(null);
  const [assignType, setAssignType] = useState<"church" | "platform">("church");
  const [churchSearch, setChurchSearch] = useState("");
  const [selectedChurch, setSelectedChurch] = useState<ChurchSearchResult | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformSearchResult | null>(null);

  const hasAccess = isSuperAdmin || isPlatformAdmin;

  const { data, isLoading, error } = useQuery<SponsorsResponse>({
    queryKey: ["/api/admin/sponsors"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/sponsors");
      return response.json();
    },
    enabled: hasAccess,
  });

  const { data: churchesData } = useQuery<{ churches: ChurchSearchResult[] }>({
    queryKey: ["/api/churches", "search", churchSearch],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/churches?search=${encodeURIComponent(churchSearch)}&limit=10`);
      return response.json();
    },
    enabled: assignDialogOpen && assignType === "church" && churchSearch.length >= 2,
  });

  const { data: platformsData } = useQuery<{ platforms: PlatformSearchResult[] }>({
    queryKey: ["/api/city-platforms"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/city-platforms?limit=50");
      return response.json();
    },
    enabled: assignDialogOpen && assignType === "platform",
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

  const addAssignmentMutation = useMutation({
    mutationFn: async (data: { sponsor_id: string; church_id?: string; city_platform_id?: string }) => {
      return apiRequest("POST", "/api/admin/sponsor-assignments", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sponsors"] });
      setAssignDialogOpen(false);
      setAssigningSponsor(null);
      setSelectedChurch(null);
      setSelectedPlatform(null);
      setChurchSearch("");
      toast({ title: "Assignment Added", description: "The sponsor assignment has been created." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const removeAssignmentMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/sponsor-assignments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sponsors"] });
      toast({ title: "Assignment Removed", description: "The sponsor assignment has been removed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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

  const openCreateDialog = () => {
    setEditingSponsor(null);
    setFormData(emptyForm);
    setFormDialogOpen(true);
  };

  const openEditDialog = (sponsor: Sponsor) => {
    setEditingSponsor(sponsor);
    setFormData({
      name: sponsor.name,
      logo_url: sponsor.logo_url || "",
      website_url: sponsor.website_url || "",
      contact_email: sponsor.contact_email || "",
      contact_phone: sponsor.contact_phone || "",
      description: sponsor.description || "",
      level: sponsor.level,
      is_active: sponsor.is_active,
      sort_order: sponsor.sort_order,
    });
    setFormDialogOpen(true);
  };

  const openDeleteDialog = (sponsor: Sponsor) => {
    setSponsorToDelete(sponsor);
    setDeleteDialogOpen(true);
  };

  const openAssignDialog = (sponsor: Sponsor) => {
    setAssigningSponsor(sponsor);
    setAssignType("church");
    setSelectedChurch(null);
    setSelectedPlatform(null);
    setChurchSearch("");
    setAssignDialogOpen(true);
  };

  const handleFormSubmit = () => {
    const cleanedData = {
      ...formData,
      logo_url: formData.logo_url || null,
      website_url: formData.website_url || null,
      contact_email: formData.contact_email || null,
      contact_phone: formData.contact_phone || null,
      description: formData.description || null,
    };

    if (editingSponsor) {
      updateSponsorMutation.mutate({ id: editingSponsor.id, data: cleanedData });
    } else {
      createSponsorMutation.mutate(cleanedData as InsertSponsor);
    }
  };

  const handleAddAssignment = () => {
    if (!assigningSponsor) return;
    if (assignType === "church" && selectedChurch) {
      addAssignmentMutation.mutate({ sponsor_id: assigningSponsor.id, church_id: selectedChurch.id });
    } else if (assignType === "platform" && selectedPlatform) {
      addAssignmentMutation.mutate({ sponsor_id: assigningSponsor.id, city_platform_id: selectedPlatform.id });
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
                  You need admin privileges to manage sponsors.
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
            <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-sponsors">
              Sponsors
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage sponsors and their assignments
            </p>
          </div>
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
              <div className="text-2xl font-bold text-green-600" data-testid="stat-active-sponsors">{stats.active}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Platform</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600" data-testid="stat-platform-sponsors">{stats.platform}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Regional</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600" data-testid="stat-regional-sponsors">{stats.regional}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Church</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="stat-church-sponsors">{stats.church}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle>All Sponsors</CardTitle>
                <CardDescription>
                  Click on a row to expand and manage assignments
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
                <h3 className="mt-4 text-lg font-semibold">Error Loading Sponsors</h3>
                <p className="text-muted-foreground mt-2">Please try again later.</p>
              </div>
            ) : filteredSponsors && filteredSponsors.length > 0 ? (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Sponsor</TableHead>
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
                              <CollapsibleTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-6 w-6" data-testid={`button-expand-${sponsor.id}`}>
                                  {expandedIds.has(sponsor.id) ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </Button>
                              </CollapsibleTrigger>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10">
                                  <AvatarImage src={sponsor.logo_url || undefined} alt={sponsor.name} />
                                  <AvatarFallback>{sponsor.name.charAt(0).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="font-medium">{sponsor.name}</div>
                                  {sponsor.website_url && (
                                    <a
                                      href={sponsor.website_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Globe className="h-3 w-3" />
                                      Website
                                    </a>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={levelColors[sponsor.level]}>
                                {levelLabels[sponsor.level]}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {sponsor.contact_email && (
                                <div className="text-sm">{sponsor.contact_email}</div>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={sponsor.is_active ? "default" : "secondary"}>
                                {sponsor.is_active ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground">
                                {sponsor.assignments?.length || 0} assignments
                              </span>
                            </TableCell>
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => openEditDialog(sponsor)}
                                  data-testid={`button-edit-${sponsor.id}`}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => openDeleteDialog(sponsor)}
                                  data-testid={`button-delete-${sponsor.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          <CollapsibleContent asChild>
                            <TableRow className="bg-muted/30">
                              <TableCell colSpan={7} className="p-0">
                                <div className="p-6 space-y-4">
                                  <div className="flex items-center justify-between">
                                    <h4 className="font-semibold">Assignments</h4>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => openAssignDialog(sponsor)}
                                      data-testid={`button-add-assignment-${sponsor.id}`}
                                    >
                                      <Plus className="h-4 w-4 mr-1" />
                                      Add Assignment
                                    </Button>
                                  </div>
                                  {sponsor.assignments && sponsor.assignments.length > 0 ? (
                                    <div className="space-y-2">
                                      {sponsor.assignments.map((assignment) => (
                                        <div
                                          key={assignment.id}
                                          className="flex items-center justify-between p-3 bg-background rounded-md border"
                                        >
                                          <div className="flex items-center gap-2">
                                            {assignment.church_id ? (
                                              <>
                                                <IconBuildingChurch className="h-4 w-4 text-muted-foreground" />
                                                <span>Church: {(assignment as any).church?.name || assignment.church_id}</span>
                                              </>
                                            ) : assignment.city_platform_id ? (
                                              <>
                                                <Globe className="h-4 w-4 text-muted-foreground" />
                                                <span>Platform: {(assignment as any).platform?.name || assignment.city_platform_id}</span>
                                              </>
                                            ) : (
                                              <span className="text-muted-foreground">Unknown assignment</span>
                                            )}
                                            <Badge variant={assignment.is_active ? "outline" : "secondary"} className="ml-2">
                                              {assignment.is_active ? "Active" : "Inactive"}
                                            </Badge>
                                          </div>
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => removeAssignmentMutation.mutate(assignment.id)}
                                            disabled={removeAssignmentMutation.isPending}
                                            data-testid={`button-remove-assignment-${assignment.id}`}
                                          >
                                            <X className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-sm text-muted-foreground py-4 text-center">
                                      No assignments yet. Add a church or platform assignment.
                                    </p>
                                  )}
                                  {sponsor.description && (
                                    <div className="pt-4 border-t">
                                      <h5 className="text-sm font-medium mb-2">Description</h5>
                                      <p className="text-sm text-muted-foreground">{sponsor.description}</p>
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
                <Building className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">No Sponsors Found</h3>
                <p className="text-muted-foreground mt-2">
                  {searchTerm || levelFilter !== "all" || activeFilter !== "all"
                    ? "Try adjusting your filters"
                    : "Get started by adding your first sponsor"}
                </p>
                <Button className="mt-4" onClick={openCreateDialog} data-testid="button-create-sponsor-empty">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Sponsor
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
          <DialogContent className="max-w-lg" data-testid="dialog-sponsor-form">
            <DialogHeader>
              <DialogTitle>{editingSponsor ? "Edit Sponsor" : "Create Sponsor"}</DialogTitle>
              <DialogDescription>
                {editingSponsor ? "Update sponsor details" : "Add a new sponsor to the platform"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Sponsor name"
                  data-testid="input-sponsor-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="level">Level *</Label>
                <Select value={formData.level} onValueChange={(val) => setFormData({ ...formData, level: val as SponsorLevel })}>
                  <SelectTrigger data-testid="select-sponsor-level">
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="platform">Platform</SelectItem>
                    <SelectItem value="regional">Regional</SelectItem>
                    <SelectItem value="church">Church</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="logo_url">Logo URL</Label>
                <Input
                  id="logo_url"
                  value={formData.logo_url || ""}
                  onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                  placeholder="https://example.com/logo.png"
                  data-testid="input-sponsor-logo"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website_url">Website URL</Label>
                <Input
                  id="website_url"
                  value={formData.website_url || ""}
                  onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                  placeholder="https://example.com"
                  data-testid="input-sponsor-website"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_email">Contact Email</Label>
                <Input
                  id="contact_email"
                  type="email"
                  value={formData.contact_email || ""}
                  onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                  placeholder="contact@example.com"
                  data-testid="input-sponsor-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_phone">Contact Phone</Label>
                <Input
                  id="contact_phone"
                  value={formData.contact_phone || ""}
                  onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                  placeholder="+1 (555) 123-4567"
                  data-testid="input-sponsor-phone"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description || ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of the sponsor..."
                  className="min-h-[80px]"
                  data-testid="textarea-sponsor-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sort_order">Sort Order</Label>
                <Input
                  id="sort_order"
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                  data-testid="input-sponsor-sort-order"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="is_active">Active</Label>
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  data-testid="switch-sponsor-active"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFormDialogOpen(false)} data-testid="button-cancel-sponsor">
                Cancel
              </Button>
              <Button
                onClick={handleFormSubmit}
                disabled={!formData.name || createSponsorMutation.isPending || updateSponsorMutation.isPending}
                data-testid="button-submit-sponsor"
              >
                {(createSponsorMutation.isPending || updateSponsorMutation.isPending) ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : editingSponsor ? (
                  "Update Sponsor"
                ) : (
                  "Create Sponsor"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent data-testid="dialog-delete-sponsor">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Sponsor</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>{sponsorToDelete?.name}</strong>?
                This will also remove all sponsor assignments.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => sponsorToDelete && deleteSponsorMutation.mutate(sponsorToDelete.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteSponsorMutation.isPending}
                data-testid="button-confirm-delete"
              >
                {deleteSponsorMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent data-testid="dialog-add-assignment">
            <DialogHeader>
              <DialogTitle>Add Assignment</DialogTitle>
              <DialogDescription>
                Assign {assigningSponsor?.name} to a church or platform
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Assignment Type</Label>
                <Select value={assignType} onValueChange={(val) => setAssignType(val as "church" | "platform")}>
                  <SelectTrigger data-testid="select-assignment-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="church">Church</SelectItem>
                    <SelectItem value="platform">Platform</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {assignType === "church" ? (
                <div className="space-y-2">
                  <Label>Search Church</Label>
                  <Input
                    value={churchSearch}
                    onChange={(e) => setChurchSearch(e.target.value)}
                    placeholder="Type to search churches..."
                    data-testid="input-search-church"
                  />
                  {churchesData?.churches && churchesData.churches.length > 0 && (
                    <div className="border rounded-md max-h-48 overflow-y-auto">
                      {churchesData.churches.map((church) => (
                        <button
                          key={church.id}
                          type="button"
                          className={`w-full text-left p-2 hover-elevate ${selectedChurch?.id === church.id ? "bg-muted" : ""}`}
                          onClick={() => setSelectedChurch(church)}
                          data-testid={`button-select-church-${church.id}`}
                        >
                          <div className="font-medium">{church.name}</div>
                          {church.city && church.state && (
                            <div className="text-sm text-muted-foreground">{church.city}, {church.state}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedChurch && (
                    <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                      <IconBuildingChurch className="h-4 w-4" />
                      <span>{selectedChurch.name}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 ml-auto"
                        onClick={() => setSelectedChurch(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Select Platform</Label>
                  <Select
                    value={selectedPlatform?.id || ""}
                    onValueChange={(val) => {
                      const platform = platformsData?.platforms?.find((p) => p.id === val);
                      setSelectedPlatform(platform || null);
                    }}
                  >
                    <SelectTrigger data-testid="select-platform">
                      <SelectValue placeholder="Select a platform" />
                    </SelectTrigger>
                    <SelectContent>
                      {platformsData?.platforms?.map((platform) => (
                        <SelectItem key={platform.id} value={platform.id}>
                          {platform.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)} data-testid="button-cancel-assignment">
                Cancel
              </Button>
              <Button
                onClick={handleAddAssignment}
                disabled={
                  addAssignmentMutation.isPending ||
                  (assignType === "church" && !selectedChurch) ||
                  (assignType === "platform" && !selectedPlatform)
                }
                data-testid="button-submit-assignment"
              >
                {addAssignmentMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add Assignment"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
