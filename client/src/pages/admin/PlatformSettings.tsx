import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePlatformAccess } from "@/hooks/useAdminAccess";
import { useAuth } from "@/contexts/AuthContext";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { uploadMedia } from "@/lib/upload";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { 
  Settings, 
  ArrowLeft, 
  Loader2, 
  MapPin, 
  Upload, 
  X, 
  Image as ImageIcon,
  Globe,
  Users,
  Eye,
  EyeOff,
  UserCheck,
  UserPlus,
  ExternalLink,
  Trash2,
  AlertTriangle,
  GitBranch,
  UserX,
  BarChart3,
} from "lucide-react";
import { IconBuildingChurch } from "@tabler/icons-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { CityPlatform, Boundary } from "@shared/schema";

const platformSettingsSchema = z.object({
  name: z.string().min(2, "Platform name must be at least 2 characters"),
  description: z.string().optional().nullable(),
  is_active: z.boolean(),
  is_public: z.boolean(),
  auto_approve_members: z.boolean(),
  display_lds_churches: z.boolean(),
  display_jw_churches: z.boolean(),
  logo_url: z.string().optional().nullable(),
  banner_url: z.string().optional().nullable(),
  website: z.string().url("Please enter a valid URL").optional().nullable().or(z.literal('')),
  contact_email: z.string().email("Please enter a valid email").optional().nullable().or(z.literal('')),
});

type PlatformSettingsFormData = z.infer<typeof platformSettingsSchema>;

interface PlatformSettingsData extends CityPlatform {
  primary_boundary?: Pick<Boundary, 'id' | 'name' | 'type'> | null;
  boundary_count: number;
  member_count: number;
}

interface PlatformDeletionImpact {
  id: string;
  name: string;
  slug: string;
  member_count: number;
  church_count: number;
  boundary_count: number;
  membership_request_count: number;
  application_count: number;
}

export default function PlatformSettings() {
  const [, params] = useRoute("/admin/platform/:id/settings");
  const platformId = params?.id;
  const { toast } = useToast();
  const { loading: authLoading } = useAuth();
  const { hasAccess, role, isSuperAdmin, isLoading: accessLoading } = usePlatformAccess(platformId);
  const [, setLocation] = useLocation();
  
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [slugDialogOpen, setSlugDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [slugError, setSlugError] = useState("");
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [allocPpi, setAllocPpi] = useState(200);
  const [allocBaseline, setAllocBaseline] = useState(1.0);
  const [allocVolWeight, setAllocVolWeight] = useState(1.0);
  const [allocBudgetDivisor, setAllocBudgetDivisor] = useState(1000);

  const canEdit = role === 'platform_owner' || isSuperAdmin;

  const { data: settings, isLoading } = useQuery<PlatformSettingsData>({
    queryKey: [`/api/admin/platform/${platformId}/settings`],
    enabled: !!platformId && (hasAccess || isSuperAdmin) && !accessLoading && canEdit,
  });

  const { data: deletionImpact, isLoading: impactLoading } = useQuery<PlatformDeletionImpact>({
    queryKey: [`/api/admin/platform/${platformId}`],
    enabled: !!platformId && isSuperAdmin && deleteDialogOpen,
  });

  const { data: allocationSettings, isLoading: allocSettingsLoading } = useQuery<{
    platform_id: string;
    people_per_intercessor: number;
    baseline_church_capacity: number;
    volunteer_capacity_weight: number;
    budget_capacity_divisor: number;
  }>({
    queryKey: ['/api/platform', platformId, 'allocation-settings'],
    enabled: !!platformId && canEdit,
  });

  useEffect(() => {
    if (allocationSettings) {
      setAllocPpi(allocationSettings.people_per_intercessor ?? 200);
      setAllocBaseline(allocationSettings.baseline_church_capacity ?? 1.0);
      setAllocVolWeight(allocationSettings.volunteer_capacity_weight ?? 1.0);
      setAllocBudgetDivisor(allocationSettings.budget_capacity_divisor ?? 1000);
    }
  }, [allocationSettings]);

  const allocSettingsMutation = useMutation({
    mutationFn: async (data: Partial<{
      people_per_intercessor: number;
      baseline_church_capacity: number;
      volunteer_capacity_weight: number;
      budget_capacity_divisor: number;
    }>) => {
      return apiRequest('PATCH', `/api/platform/${platformId}/allocation-settings`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/platform', platformId, 'allocation-settings'] });
      toast({ title: "Saturation parameters saved", description: "Changes will affect saturation calculations on the next map refresh." });
    },
    onError: (error: any) => {
      toast({ title: "Save failed", description: error.message || "Failed to save parameters", variant: "destructive" });
    },
  });

  const handleSaveAllocSettings = () => {
    allocSettingsMutation.mutate({
      people_per_intercessor: allocPpi,
      baseline_church_capacity: allocBaseline,
      volunteer_capacity_weight: allocVolWeight,
      budget_capacity_divisor: allocBudgetDivisor,
    });
  };

  const handleResetAllocDefaults = () => {
    setAllocPpi(200);
    setAllocBaseline(1.0);
    setAllocVolWeight(1.0);
    setAllocBudgetDivisor(1000);
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('DELETE', `/api/admin/platform/${platformId}`);
    },
    onSuccess: () => {
      toast({
        title: "Platform deleted",
        description: `${settings?.name || 'Platform'} has been permanently deleted.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/platforms'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/city-platforms'] });
      setDeleteDialogOpen(false);
      setLocation('/platforms');
    },
    onError: (error: any) => {
      toast({
        title: "Deletion failed",
        description: error.message || "Failed to delete platform",
        variant: "destructive",
      });
    },
  });

  const handleDeletePlatform = () => {
    if (confirmText !== settings?.name) return;
    deleteMutation.mutate();
  };

  const handleDeleteDialogClose = (open: boolean) => {
    setDeleteDialogOpen(open);
    if (!open) {
      setConfirmText("");
    }
  };

  const slugMutation = useMutation({
    mutationFn: async (slug: string) => {
      return apiRequest('PATCH', `/api/admin/platform/${platformId}/settings`, { slug });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/platform/${platformId}/settings`] });
      queryClient.invalidateQueries({ queryKey: ['/api/platforms'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/city-platforms'] });
      toast({
        title: "Slug updated",
        description: "Platform URL has been changed. External links using the old slug will no longer work.",
      });
      setSlugDialogOpen(false);
      setNewSlug("");
      setSlugError("");
    },
    onError: (error: any) => {
      setSlugError(error.message || "Failed to update slug");
    },
  });

  const validateSlug = (slug: string): boolean => {
    if (slug.length < 3) {
      setSlugError("Slug must be at least 3 characters");
      return false;
    }
    if (slug.length > 100) {
      setSlugError("Slug must be at most 100 characters");
      return false;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setSlugError("Use only lowercase letters, numbers, and hyphens");
      return false;
    }
    setSlugError("");
    return true;
  };

  const handleSlugChange = () => {
    const normalizedSlug = newSlug.toLowerCase().trim();
    if (!validateSlug(normalizedSlug)) return;
    if (normalizedSlug === settings?.slug) {
      setSlugDialogOpen(false);
      return;
    }
    slugMutation.mutate(normalizedSlug);
  };

  const handleSlugDialogClose = (open: boolean) => {
    setSlugDialogOpen(open);
    if (!open) {
      setNewSlug("");
      setSlugError("");
    }
  };

  const openSlugDialog = () => {
    setNewSlug(settings?.slug || "");
    setSlugError("");
    setSlugDialogOpen(true);
  };

  const form = useForm<PlatformSettingsFormData>({
    resolver: zodResolver(platformSettingsSchema),
    defaultValues: {
      name: "",
      description: "",
      is_active: false,
      is_public: false,
      auto_approve_members: false,
      display_lds_churches: false,
      display_jw_churches: false,
      logo_url: "",
      banner_url: "",
      website: "",
      contact_email: "",
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        name: settings.name || "",
        description: settings.description || "",
        is_active: settings.is_active || false,
        is_public: settings.is_public || false,
        auto_approve_members: settings.auto_approve_members || false,
        display_lds_churches: settings.display_lds_churches || false,
        display_jw_churches: settings.display_jw_churches || false,
        logo_url: settings.logo_url || "",
        banner_url: settings.banner_url || "",
        website: settings.website || "",
        contact_email: settings.contact_email || "",
      });
    }
  }, [settings, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<PlatformSettingsFormData>) => {
      return apiRequest('PATCH', `/api/admin/platform/${platformId}/settings`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/platform/${platformId}/settings`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/dashboard`] });
      toast({
        title: "Settings saved",
        description: "Platform settings have been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Save failed",
        description: error.message || "Failed to save settings",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: PlatformSettingsFormData) => {
    updateMutation.mutate({
      name: data.name,
      description: data.description || null,
      is_active: data.is_active,
      is_public: data.is_public,
      auto_approve_members: data.auto_approve_members,
      display_lds_churches: data.display_lds_churches,
      display_jw_churches: data.display_jw_churches,
      website: data.website || null,
      contact_email: data.contact_email || null,
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file",
        description: "Please select an image file.",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingLogo(true);
    try {
      const result = await uploadMedia(file);
      if (!result) {
        throw new Error('Upload failed');
      }
      form.setValue('logo_url', result.url);
      updateMutation.mutate({ logo_url: result.url });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload image",
        variant: "destructive",
      });
    } finally {
      setIsUploadingLogo(false);
      if (logoInputRef.current) {
        logoInputRef.current.value = '';
      }
    }
  };

  const handleRemoveLogo = () => {
    form.setValue('logo_url', '');
    updateMutation.mutate({ logo_url: null });
  };

  if (authLoading || accessLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  if (!canEdit) {
    return (
      <AdminLayout>
        <div className="p-8">
          <div className="text-center py-16">
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-4">
              Only platform owners can access settings.
            </p>
            <Button asChild variant="outline">
              <Link href={`/admin/platform/${platformId}`}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-8 max-w-4xl mx-auto">
        <div className="mb-6">
          <Button variant="ghost" size="sm" asChild className="mb-4">
            <Link href={`/admin/platform/${platformId}`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Settings className="w-8 h-8" />
            Platform Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure your platform's appearance, visibility, and policies
          </p>
          {settings?.slug && (
            <Badge variant="outline" className="mt-2">
              /{settings.slug}
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-64" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-24 w-full" />
              </CardContent>
            </Card>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="w-5 h-5" />
                    Basic Information
                  </CardTitle>
                  <CardDescription>
                    Essential details about your platform
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Platform Name</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="e.g., Grand Rapids Church Map"
                            data-testid="input-platform-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      Platform Slug {isSuperAdmin ? "" : "(read-only)"}
                    </Label>
                    <div className="flex gap-2">
                      <Input 
                        value={settings?.slug || ''} 
                        disabled 
                        className="bg-muted flex-1"
                        data-testid="input-platform-slug"
                      />
                      {isSuperAdmin && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={openSlugDialog}
                          data-testid="button-change-slug"
                        >
                          <GitBranch className="h-4 w-4 mr-2" />
                          Change
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {isSuperAdmin 
                        ? "The URL identifier for this platform. Changing it will break any published or shared links."
                        : "The URL-friendly identifier for your platform. Contact support to change."
                      }
                    </p>
                  </div>

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            value={field.value || ''}
                            placeholder="A brief description of your platform..."
                            rows={3}
                            data-testid="input-platform-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="website"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Website URL</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              value={field.value || ''}
                              placeholder="https://example.com"
                              type="url"
                              data-testid="input-platform-website"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="contact_email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Email</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              value={field.value || ''}
                              placeholder="contact@example.com"
                              type="email"
                              data-testid="input-platform-email"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ImageIcon className="w-5 h-5" />
                    Branding
                  </CardTitle>
                  <CardDescription>
                    Logo image for your platform
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Platform Logo</Label>
                      <div className="flex items-center gap-4">
                        {form.watch('logo_url') ? (
                          <div className="relative w-20 h-20 rounded-lg overflow-hidden border">
                            <img 
                              src={form.watch('logo_url') || ''} 
                              alt="Platform logo" 
                              className="w-full h-full object-cover"
                            />
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="absolute top-1 right-1 h-6 w-6"
                              onClick={handleRemoveLogo}
                              data-testid="button-remove-logo"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <div className="w-20 h-20 rounded-lg border-2 border-dashed flex items-center justify-center bg-muted">
                            <ImageIcon className="w-8 h-8 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleLogoUpload}
                            data-testid="input-logo-file"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isUploadingLogo}
                            onClick={() => logoInputRef.current?.click()}
                            data-testid="button-upload-logo"
                          >
                            {isUploadingLogo ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Uploading...
                              </>
                            ) : (
                              <>
                                <Upload className="h-4 w-4 mr-2" />
                                Upload Logo
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>

                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    Visibility
                  </CardTitle>
                  <CardDescription>
                    Control who can see and access your platform
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="is_active"
                    render={({ field }) => (
                      <FormItem className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base flex items-center gap-2">
                            {field.value ? (
                              <Eye className="w-4 h-4 text-green-500" />
                            ) : (
                              <EyeOff className="w-4 h-4 text-muted-foreground" />
                            )}
                            Platform Active
                          </FormLabel>
                          <FormDescription>
                            When disabled, the platform is not accessible to members
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-is-active"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="is_public"
                    render={({ field }) => (
                      <FormItem className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base flex items-center gap-2">
                            <Globe className="w-4 h-4" />
                            Public Discovery
                          </FormLabel>
                          <FormDescription>
                            Show this platform in the public platform directory
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-is-public"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Member Policies
                  </CardTitle>
                  <CardDescription>
                    Configure how new members join your platform
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="auto_approve_members"
                    render={({ field }) => (
                      <FormItem className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base flex items-center gap-2">
                            {field.value ? (
                              <UserCheck className="w-4 h-4 text-green-500" />
                            ) : (
                              <UserPlus className="w-4 h-4 text-muted-foreground" />
                            )}
                            Auto-Approve Members
                          </FormLabel>
                          <FormDescription>
                            {field.value 
                              ? "New membership requests are automatically approved"
                              : "New membership requests require manual approval"
                            }
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-auto-approve"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border p-4 bg-muted/30">
                    <div className="space-y-0.5">
                      <Label className="text-base font-medium">Current Members</Label>
                      <p className="text-sm text-muted-foreground">
                        {settings?.member_count || 0} active members in this platform
                      </p>
                    </div>
                    <Button variant="outline" size="sm" asChild className="w-full sm:w-auto">
                      <Link href={`/admin/platform/${platformId}/members`}>
                        <Users className="h-4 w-4 mr-2" />
                        Manage Members
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <IconBuildingChurch className="w-5 h-5" />
                    Church Display
                  </CardTitle>
                  <CardDescription>
                    Configure which churches are displayed on your platform
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="display_lds_churches"
                    render={({ field }) => (
                      <FormItem className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base flex items-center gap-2">
                            {field.value ? (
                              <Eye className="w-4 h-4 text-green-500" />
                            ) : (
                              <EyeOff className="w-4 h-4 text-muted-foreground" />
                            )}
                            Display LDS/Mormon Churches
                          </FormLabel>
                          <FormDescription>
                            {field.value 
                              ? "LDS/Mormon churches are shown on this platform"
                              : "LDS/Mormon churches are hidden from this platform"
                            }
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-display-lds"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="display_jw_churches"
                    render={({ field }) => (
                      <FormItem className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base flex items-center gap-2">
                            {field.value ? (
                              <Eye className="w-4 h-4 text-green-500" />
                            ) : (
                              <EyeOff className="w-4 h-4 text-muted-foreground" />
                            )}
                            Display Jehovah's Witness Churches
                          </FormLabel>
                          <FormDescription>
                            {field.value 
                              ? "Jehovah's Witness churches (Kingdom Halls) are shown on this platform"
                              : "Jehovah's Witness churches (Kingdom Halls) are hidden from this platform"
                            }
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-display-jw"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium">Geographic Boundaries</span>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/admin/city-platforms/${platformId}/boundaries`}>
                    <MapPin className="h-4 w-4 mr-2" />
                    Manage Boundaries
                    <ExternalLink className="h-3 w-3 ml-2" />
                  </Link>
                </Button>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" />
                    Ministry Saturation Parameters
                  </CardTitle>
                  <CardDescription>
                    Fine-tune how ministry coverage is calculated for this platform
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-medium">People Per Intercessor</Label>
                      <Badge variant="secondary" className="font-mono text-sm">{allocPpi}</Badge>
                    </div>
                    <Slider
                      min={50}
                      max={1000}
                      step={10}
                      value={[allocPpi]}
                      onValueChange={([v]) => setAllocPpi(v)}
                      data-testid="input-ppi"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>50</span>
                      <span>1,000</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      How many people one intercessor can effectively cover in prayer. Lower values mean more intercessors are needed per tract.
                    </p>
                    <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      Reducing this increases the coverage threshold, making it harder for churches to show full prayer coverage.
                    </p>
                  </div>

                  <div className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-medium">Baseline Church Capacity</Label>
                      <Badge variant="secondary" className="font-mono text-sm">{allocBaseline.toFixed(1)}</Badge>
                    </div>
                    <Slider
                      min={0.1}
                      max={10}
                      step={0.1}
                      value={[allocBaseline]}
                      onValueChange={([v]) => setAllocBaseline(Math.round(v * 10) / 10)}
                      data-testid="input-baseline"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>0.1</span>
                      <span>10.0</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Minimum capacity assigned to every church, even those without volunteers or budget data. Ensures all churches contribute to saturation.
                    </p>
                    <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      Setting this too high inflates saturation for churches that haven't entered capacity data.
                    </p>
                  </div>

                  <div className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-medium">Volunteer Capacity Weight</Label>
                      <Badge variant="secondary" className="font-mono text-sm">{allocVolWeight.toFixed(1)}</Badge>
                    </div>
                    <Slider
                      min={0.1}
                      max={5}
                      step={0.1}
                      value={[allocVolWeight]}
                      onValueChange={([v]) => setAllocVolWeight(Math.round(v * 10) / 10)}
                      data-testid="input-vol-weight"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>0.1</span>
                      <span>5.0</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      How much each ministry volunteer contributes to a church's capacity score. A weight of 1.0 means each volunteer counts as 1 capacity unit.
                    </p>
                    <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      Changing this recalibrates the balance between volunteer-driven and budget-driven capacity.
                    </p>
                  </div>

                  <div className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-medium">Budget Capacity Divisor</Label>
                      <Badge variant="secondary" className="font-mono text-sm">${allocBudgetDivisor.toLocaleString()}</Badge>
                    </div>
                    <Slider
                      min={100}
                      max={10000}
                      step={100}
                      value={[allocBudgetDivisor]}
                      onValueChange={([v]) => setAllocBudgetDivisor(v)}
                      data-testid="input-budget-divisor"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>$100</span>
                      <span>$10,000</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Dollar amount of annual ministry budget that equals 1 capacity unit. At $1,000, a $50K budget contributes 50 capacity units.
                    </p>
                    <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      Lower values mean budgets contribute more capacity. Higher values reduce budget's influence on saturation.
                    </p>
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleResetAllocDefaults}
                      data-testid="button-reset-alloc-defaults"
                    >
                      Reset to Defaults
                    </Button>
                    <Button
                      type="button"
                      onClick={handleSaveAllocSettings}
                      disabled={allocSettingsMutation.isPending}
                      data-testid="button-save-alloc-settings"
                    >
                      {allocSettingsMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save Parameters"
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => form.reset()}
                  disabled={updateMutation.isPending}
                  data-testid="button-reset"
                >
                  Reset Changes
                </Button>
                <Button 
                  type="submit" 
                  disabled={updateMutation.isPending}
                  data-testid="button-save-settings"
                >
                  {updateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Settings"
                  )}
                </Button>
              </div>

              {isSuperAdmin && (
                <Card className="border-destructive/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="w-5 h-5" />
                      Danger Zone
                    </CardTitle>
                    <CardDescription>
                      Irreversible actions that permanently affect this platform
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-destructive/30 p-4 bg-destructive/5">
                      <div className="space-y-0.5">
                        <Label className="text-base font-medium">Delete Platform</Label>
                        <p className="text-sm text-muted-foreground">
                          Permanently delete this platform and all associated data
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => setDeleteDialogOpen(true)}
                        data-testid="button-delete-platform"
                        className="w-full sm:w-auto"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Platform
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </form>
          </Form>
        )}

        <AlertDialog open={deleteDialogOpen} onOpenChange={handleDeleteDialogClose}>
          <AlertDialogContent className="max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Delete Platform
              </AlertDialogTitle>
              <AlertDialogDescription className="text-left space-y-4">
                <p>
                  You are about to permanently delete{" "}
                  <span className="font-semibold text-foreground">{settings?.name}</span>.
                  This action cannot be undone.
                </p>

                {impactLoading ? (
                  <div className="space-y-2 p-4 bg-muted/50 rounded-md">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ) : deletionImpact ? (
                  <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md space-y-3">
                    <p className="font-medium text-destructive text-sm">
                      The following data will be permanently deleted:
                    </p>
                    <ul className="space-y-2 text-sm">
                      {deletionImpact.member_count > 0 && (
                        <li className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>
                            <strong>{deletionImpact.member_count}</strong> platform member{deletionImpact.member_count !== 1 ? "s" : ""}
                          </span>
                        </li>
                      )}
                      {deletionImpact.church_count > 0 && (
                        <li className="flex items-center gap-2">
                          <IconBuildingChurch className="h-4 w-4 text-muted-foreground" />
                          <span>
                            <strong>{deletionImpact.church_count}</strong> church association{deletionImpact.church_count !== 1 ? "s" : ""}
                          </span>
                        </li>
                      )}
                      {deletionImpact.boundary_count > 0 && (
                        <li className="flex items-center gap-2">
                          <GitBranch className="h-4 w-4 text-muted-foreground" />
                          <span>
                            <strong>{deletionImpact.boundary_count}</strong> boundary configuration{deletionImpact.boundary_count !== 1 ? "s" : ""}
                          </span>
                        </li>
                      )}
                      {deletionImpact.membership_request_count > 0 && (
                        <li className="flex items-center gap-2">
                          <UserX className="h-4 w-4 text-muted-foreground" />
                          <span>
                            <strong>{deletionImpact.membership_request_count}</strong> pending membership request{deletionImpact.membership_request_count !== 1 ? "s" : ""}
                          </span>
                        </li>
                      )}
                    </ul>
                  </div>
                ) : (
                  <div className="p-4 bg-muted/50 rounded-md">
                    <p className="text-sm text-muted-foreground">
                      This platform has no associated data and can be safely deleted.
                    </p>
                  </div>
                )}

                <div className="space-y-2 pt-2">
                  <Label htmlFor="confirm-platform-delete" className="text-sm font-medium">
                    To confirm, type the platform name: <span className="font-mono font-semibold">{settings?.name}</span>
                  </Label>
                  <Input
                    id="confirm-platform-delete"
                    placeholder={settings?.name || "Platform name"}
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    className="font-mono"
                    data-testid="input-confirm-delete-platform"
                  />
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete-platform">Cancel</AlertDialogCancel>
              <Button
                variant="destructive"
                onClick={handleDeletePlatform}
                disabled={confirmText !== settings?.name || deleteMutation.isPending}
                data-testid="button-confirm-delete-platform"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {deleteMutation.isPending ? "Deleting..." : "Delete Platform"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={slugDialogOpen} onOpenChange={handleSlugDialogClose}>
          <AlertDialogContent className="max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5" />
                Change Platform Slug
              </AlertDialogTitle>
              <AlertDialogDescription className="text-left space-y-4">
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-md space-y-2">
                  <p className="font-medium text-amber-600 dark:text-amber-400 text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Warning: This will break external links
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Any published or shared URLs using the current slug will stop working. 
                    Links within the app will update automatically.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Current URL: </span>
                    <code className="bg-muted px-2 py-1 rounded text-xs">
                      thechurchmap.com/{settings?.slug}
                    </code>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="new-slug" className="text-sm font-medium">
                      New Platform Slug
                    </Label>
                    <Input
                      id="new-slug"
                      placeholder="new-platform-slug"
                      value={newSlug}
                      onChange={(e) => {
                        setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                        setSlugError("");
                      }}
                      className="font-mono"
                      data-testid="input-new-slug"
                    />
                    {slugError && (
                      <p className="text-sm text-destructive">{slugError}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Use lowercase letters, numbers, and hyphens only. 3-100 characters.
                    </p>
                  </div>

                  {newSlug && newSlug !== settings?.slug && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">New URL: </span>
                      <code className="bg-muted px-2 py-1 rounded text-xs">
                        thechurchmap.com/{newSlug}
                      </code>
                    </div>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-change-slug">Cancel</AlertDialogCancel>
              <Button
                onClick={handleSlugChange}
                disabled={!newSlug || newSlug === settings?.slug || slugMutation.isPending}
                data-testid="button-confirm-change-slug"
              >
                {slugMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Change Slug"
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
}
