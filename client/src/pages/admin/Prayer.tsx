import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, Archive, Plus, PartyPopper, Undo2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { supabase } from "../../../../lib/supabaseClient";
import type { PrayerWithSubmitter } from "@shared/schema";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MarkAnsweredDialog } from "@/components/MarkAnsweredDialog";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { usePlatformContext } from "@/contexts/PlatformContext";

export default function AdminPrayer() {
  const { toast } = useToast();
  const { isSuperAdmin } = useAdminAccess();
  const { platformId, platform } = usePlatformContext();
  const [activeTab, setActiveTab] = useState("pending");
  const [processingId, setProcessingId] = useState<string | null>(null);
  
  // Create prayer form state - "platform" = platform-wide, "all_platforms" = super admin global, "regional" = specific region
  const [prayerType, setPrayerType] = useState<"platform" | "all_platforms" | "regional">("platform");
  const [regionType, setRegionType] = useState<string>("");
  const [regionId, setRegionId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitterName, setSubmitterName] = useState("");

  // Search boundaries as user types
  const [boundarySearch, setBoundarySearch] = useState("");
  const [selectedBoundaryName, setSelectedBoundaryName] = useState("");
  const { data: boundaries, isLoading: boundariesLoading } = useQuery({
    queryKey: ["/api/boundaries/search", regionType, boundarySearch],
    queryFn: async () => {
      if (!regionType || !boundarySearch || boundarySearch.length < 2) return [];
      const response = await fetch(
        `/api/boundaries/search?q=${encodeURIComponent(boundarySearch)}&type=${regionType}`
      );
      if (!response.ok) throw new Error("Failed to search boundaries");
      return response.json();
    },
    enabled: !!regionType && regionType !== "platform_region" && prayerType === "regional" && boundarySearch.length >= 2,
    // Note: platform_region type uses a separate dropdown, not boundary search
  });

  // Fetch platform regions if a platform is selected
  const { data: platformRegions } = useQuery<{ id: string; name: string; color: string }[]>({
    queryKey: [`/api/admin/city-platforms/${platformId}/regions`],
    queryFn: async () => {
      if (!platformId) return [];
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      const response = await fetch(`/api/admin/city-platforms/${platformId}/regions`, { headers });
      if (!response.ok) return [];
      const data = await response.json();
      return data.regions || [];
    },
    enabled: !!platformId,
  });

  const { data: prayers, isLoading } = useQuery<PrayerWithSubmitter[]>({
    queryKey: ["/api/admin/prayers", activeTab],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      
      const response = await fetch(`/api/admin/prayers?status=${activeTab}`, {
        headers,
        credentials: "include",
      });
      
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`${response.status}: ${text}`);
      }
      
      return response.json();
    },
  });

  const updatePrayerMutation = useMutation({
    mutationFn: async ({ prayerId, status }: { prayerId: string; status: string }) => {
      setProcessingId(prayerId);
      return apiRequest("PATCH", `/api/admin/prayers/${prayerId}`, { status });
    },
    onSuccess: () => {
      // Invalidate all prayer queries (all tabs)
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prayers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard/stats"] });
      setProcessingId(null);
      toast({
        title: "Success",
        description: "Prayer status updated",
      });
    },
    onError: (error: Error) => {
      setProcessingId(null);
      toast({
        title: "Error",
        description: error.message || "Failed to update prayer",
        variant: "destructive",
      });
    },
  });

  const createPrayerMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/admin/prayers/create", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prayers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayers/visible"] });
      
      // Reset form
      setTitle("");
      setBody("");
      setSubmitterName("");
      setRegionType("");
      setRegionId("");
      setBoundarySearch("");
      setSelectedBoundaryName("");
      setPrayerType("platform");
      
      toast({
        title: "Success",
        description: "Prayer created and published",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create prayer",
        variant: "destructive",
      });
    },
  });

  const markAnsweredMutation = useMutation({
    mutationFn: async ({ prayerId, note }: { prayerId: string; note?: string }) => {
      setProcessingId(prayerId);
      return apiRequest("PATCH", `/api/admin/prayers/${prayerId}`, { 
        mark_answered: true,
        answered_note: note || null
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prayers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/moderation"] });
      setProcessingId(null);
      toast({
        title: "Prayer Answered!",
        description: "Prayer has been marked as answered",
      });
    },
    onError: (error: Error) => {
      setProcessingId(null);
      toast({
        title: "Error",
        description: error.message || "Failed to mark prayer as answered",
        variant: "destructive",
      });
    },
  });

  const unmarkAnsweredMutation = useMutation({
    mutationFn: async (prayerId: string) => {
      setProcessingId(prayerId);
      return apiRequest("PATCH", `/api/admin/prayers/${prayerId}`, { 
        unmark_answered: true
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prayers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/moderation"] });
      setProcessingId(null);
      toast({
        title: "Success",
        description: "Prayer unmarked as answered",
      });
    },
    onError: (error: Error) => {
      setProcessingId(null);
      toast({
        title: "Error",
        description: error.message || "Failed to unmark prayer",
        variant: "destructive",
      });
    },
  });

  const handleAction = (prayerId: string, status: string) => {
    updatePrayerMutation.mutate({ prayerId, status });
  };

  const handleMarkAnswered = (prayerId: string, note?: string) => {
    markAnsweredMutation.mutate({ prayerId, note });
  };

  const handleUnmarkAnswered = (prayerId: string) => {
    unmarkAnsweredMutation.mutate(prayerId);
  };

  const handleCreatePrayer = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !body.trim()) {
      toast({
        title: "Validation Error",
        description: "Title and body are required",
        variant: "destructive",
      });
      return;
    }
    
    const prayerData: any = {
      title: title.trim(),
      body: body.trim(),
      submitter_name: submitterName.trim() || undefined,
    };
    
    if (prayerType === "all_platforms") {
      // Super admin global - visible on all platforms
      prayerData.global = true;
    } else if (prayerType === "platform") {
      // Platform-wide - visible across the current platform
      prayerData.platform_wide = true;
      prayerData.city_platform_id = platformId;
    } else {
      // Regional - visible in specific region
      if (!regionType) {
        toast({
          title: "Validation Error",
          description: "Please select an area type",
          variant: "destructive",
        });
        return;
      }
      
      // Require regionId for all area types
      if (!regionId) {
        toast({
          title: "Validation Error",
          description: regionType === "platform_region" 
            ? "Please select a region" 
            : "Please select a boundary area",
          variant: "destructive",
        });
        return;
      }
      
      prayerData.region_type = regionType;
      prayerData.region_id = regionId;
      prayerData.city_platform_id = platformId;
    }
    
    createPrayerMutation.mutate(prayerData);
  };

  const renderPrayerList = (status: string) => {
    // Since we're now fetching filtered data from the backend, no need to filter client-side
    const filtered = prayers || [];

    if (isLoading) {
      return (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      );
    }

    if (filtered.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          No {status} prayer requests
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {filtered.map((prayer) => (
          <Card key={prayer.id} data-testid={`card-prayer-${prayer.id}`}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <CardTitle className="text-lg">{prayer.title}</CardTitle>
                  <CardDescription className="mt-1">
                    {prayer.church?.name} • {new Date(prayer.created_at).toLocaleDateString()}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {prayer.answered_at && (
                    <Badge variant="default" className="bg-yellow-500 hover:bg-yellow-600">
                      <PartyPopper className="h-3 w-3 mr-1" />
                      Answered
                    </Badge>
                  )}
                  <Badge variant={
                    status === 'approved' ? 'default' :
                    status === 'pending' ? 'secondary' :
                    status === 'answered' ? 'default' :
                    'outline'
                  }>
                    {status === 'answered' ? 'approved' : status}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm mb-4 line-clamp-3">{prayer.body}</p>
              
              {prayer.answered_at && prayer.answered_note && (
                <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                  <p className="text-xs font-medium text-yellow-800 dark:text-yellow-200 mb-1 flex items-center gap-1">
                    <PartyPopper className="h-3 w-3" />
                    Testimony / Answer Note
                  </p>
                  <p className="text-sm text-yellow-900 dark:text-yellow-100">{prayer.answered_note}</p>
                </div>
              )}
              
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-xs text-muted-foreground">
                  {prayer.is_anonymous ? (
                    <span>Anonymous request</span>
                  ) : prayer.display_first_name ? (
                    <span>From: {prayer.display_first_name} {prayer.display_last_initial}.</span>
                  ) : (
                    <span>Submitted by user</span>
                  )}
                </div>
                
                {status === 'pending' && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleAction(prayer.id, 'approved')}
                      disabled={processingId === prayer.id}
                      data-testid={`button-approve-${prayer.id}`}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      {processingId === prayer.id ? "Processing..." : "Approve"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction(prayer.id, 'rejected')}
                      disabled={processingId === prayer.id}
                      data-testid={`button-reject-${prayer.id}`}
                    >
                      <X className="h-4 w-4 mr-1" />
                      {processingId === prayer.id ? "Processing..." : "Reject"}
                    </Button>
                  </div>
                )}
                
                {status === 'approved' && !prayer.answered_at && (
                  <div className="flex gap-2">
                    <MarkAnsweredDialog
                      prayerId={prayer.id}
                      prayerTitle={prayer.title}
                      onMarkAnswered={handleMarkAnswered}
                      isProcessing={processingId === prayer.id}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction(prayer.id, 'archived')}
                      disabled={processingId === prayer.id}
                      data-testid={`button-archive-${prayer.id}`}
                    >
                      <Archive className="h-4 w-4 mr-1" />
                      {processingId === prayer.id ? "Processing..." : "Archive"}
                    </Button>
                  </div>
                )}

                {status === 'approved' && prayer.answered_at && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleUnmarkAnswered(prayer.id)}
                      disabled={processingId === prayer.id}
                      data-testid={`button-unmark-answered-${prayer.id}`}
                    >
                      <Undo2 className="h-4 w-4 mr-1" />
                      {processingId === prayer.id ? "Processing..." : "Unmark Answered"}
                    </Button>
                  </div>
                )}

                {status === 'answered' && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleUnmarkAnswered(prayer.id)}
                      disabled={processingId === prayer.id}
                      data-testid={`button-unmark-answered-${prayer.id}`}
                    >
                      <Undo2 className="h-4 w-4 mr-1" />
                      {processingId === prayer.id ? "Processing..." : "Unmark Answered"}
                    </Button>
                  </div>
                )}
                
                {status === 'rejected' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction(prayer.id, 'archived')}
                    disabled={processingId === prayer.id}
                    data-testid={`button-archive-${prayer.id}`}
                  >
                    <Archive className="h-4 w-4 mr-1" />
                    {processingId === prayer.id ? "Processing..." : "Archive"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Prayer Moderation</h1>
          <p className="text-muted-foreground mt-2">
            Review and moderate church prayer requests
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="create" data-testid="tab-create">
              <Plus className="h-4 w-4 mr-1" />
              Create Prayer
            </TabsTrigger>
            <TabsTrigger value="pending" data-testid="tab-pending">
              Pending
              {prayers && activeTab === 'pending' && prayers.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {prayers.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="approved" data-testid="tab-approved">Approved</TabsTrigger>
            <TabsTrigger value="answered" data-testid="tab-answered">
              <PartyPopper className="h-4 w-4 mr-1" />
              Answered
            </TabsTrigger>
            <TabsTrigger value="rejected" data-testid="tab-rejected">Rejected</TabsTrigger>
            <TabsTrigger value="archived" data-testid="tab-archived">Archived</TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Create Platform or Regional Prayer</CardTitle>
                <CardDescription>
                  Create a prayer request that will be visible platform-wide or in a specific region
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreatePrayer} className="space-y-6">
                  {/* Prayer Type Selection */}
                  <div className="space-y-3">
                    <Label>Prayer Type</Label>
                    <RadioGroup value={prayerType} onValueChange={(value: any) => setPrayerType(value)}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="platform" id="platform" data-testid="radio-platform" />
                        <Label htmlFor="platform" className="font-normal cursor-pointer">
                          Platform Wide (visible across {platform?.name || "this platform"})
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="regional" id="regional" data-testid="radio-regional" />
                        <Label htmlFor="regional" className="font-normal cursor-pointer">
                          Location Based (visible in a specific area)
                        </Label>
                      </div>
                      {isSuperAdmin && (
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="all_platforms" id="all_platforms" data-testid="radio-all-platforms" />
                          <Label htmlFor="all_platforms" className="font-normal cursor-pointer">
                            All Platforms (visible everywhere - super admin only)
                          </Label>
                        </div>
                      )}
                    </RadioGroup>
                  </div>

                  {/* Regional Options */}
                  {prayerType === "regional" && (
                    <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                      <div className="space-y-2">
                        <Label htmlFor="region-type">Area Type</Label>
                        <Select 
                          value={regionType} 
                          onValueChange={(value) => {
                            setRegionType(value);
                            setRegionId(""); // Clear boundary selection when type changes
                            setBoundarySearch(""); // Clear search
                            setSelectedBoundaryName(""); // Clear selected name
                          }}
                        >
                          <SelectTrigger id="region-type" data-testid="select-region-type">
                            <SelectValue placeholder="Select area type" />
                          </SelectTrigger>
                          <SelectContent>
                            {/* Region option - shows platform regions */}
                            {platformRegions && platformRegions.length > 0 && (
                              <SelectItem value="platform_region">Region</SelectItem>
                            )}
                            <SelectItem value="place">City/Place</SelectItem>
                            <SelectItem value="county">County</SelectItem>
                            <SelectItem value="zip">ZIP Code</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Show platform region picker when "Region" area type is selected */}
                      {regionType === "platform_region" && platformRegions && platformRegions.length > 0 && (
                        <div className="space-y-2">
                          <Label htmlFor="platform-region">Select Region</Label>
                          <Select 
                            value={regionId} 
                            onValueChange={(value) => {
                              setRegionId(value);
                              const selectedRegion = platformRegions.find(r => r.id === value);
                              setSelectedBoundaryName(selectedRegion?.name || "");
                            }}
                          >
                            <SelectTrigger id="platform-region" data-testid="select-platform-region">
                              <SelectValue placeholder="Select a region" />
                            </SelectTrigger>
                            <SelectContent>
                              {platformRegions.map((region) => (
                                <SelectItem key={region.id} value={region.id}>
                                  {region.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {regionId && selectedBoundaryName && (
                            <p className="text-sm font-medium text-green-600">
                              Selected: {selectedBoundaryName}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Show boundary search for City/Place, County, ZIP Code */}
                      {regionType && regionType !== "platform_region" && (
                        <div className="space-y-2">
                          <Label htmlFor="boundary-search">Search Boundary</Label>
                          <Input
                            id="boundary-search"
                            type="text"
                            placeholder="Type to search (e.g., Grand Rapids)"
                            value={boundarySearch}
                            onChange={(e) => setBoundarySearch(e.target.value)}
                            data-testid="input-boundary-search"
                          />
                          {boundarySearch.length >= 2 && boundaries && boundaries.length > 0 && (
                            <div className="border rounded-md max-h-48 overflow-y-auto">
                              {boundaries.map((boundary: any) => (
                                <button
                                  key={boundary.external_id}
                                  type="button"
                                  onClick={() => {
                                    setRegionId(boundary.external_id);
                                    setSelectedBoundaryName(boundary.name);
                                    setBoundarySearch(""); // Clear search after selection
                                  }}
                                  className={`w-full text-left px-3 py-2 hover:bg-accent transition-colors ${
                                    regionId === boundary.external_id ? 'bg-accent' : ''
                                  }`}
                                  data-testid={`boundary-option-${boundary.external_id}`}
                                >
                                  <div className="font-medium">{boundary.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {boundary.external_id} • {boundary.type}
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                          {boundarySearch.length >= 2 && !boundariesLoading && boundaries && boundaries.length === 0 && (
                            <p className="text-sm text-muted-foreground">No boundaries found. Try a different search term.</p>
                          )}
                          {boundariesLoading && (
                            <p className="text-sm text-muted-foreground">Searching...</p>
                          )}
                          {regionId && selectedBoundaryName && (
                            <p className="text-sm font-medium text-green-600">
                              Selected: {selectedBoundaryName}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Type at least 2 characters to search for boundaries
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Title */}
                  <div className="space-y-2">
                    <Label htmlFor="title">
                      Title <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Pray for..."
                      required
                      maxLength={200}
                      data-testid="input-title"
                    />
                  </div>

                  {/* Body */}
                  <div className="space-y-2">
                    <Label htmlFor="body">
                      Prayer Request <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="body"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="Describe the prayer request..."
                      required
                      maxLength={2000}
                      rows={6}
                      data-testid="textarea-body"
                    />
                  </div>

                  {/* Submitter Name */}
                  <div className="space-y-2">
                    <Label htmlFor="submitter-name">Submitter Name (optional)</Label>
                    <Input
                      id="submitter-name"
                      value={submitterName}
                      onChange={(e) => setSubmitterName(e.target.value)}
                      placeholder="e.g., John Smith"
                      data-testid="input-submitter-name"
                    />
                    <p className="text-xs text-muted-foreground">
                      If provided, will be displayed as "First Name L." (e.g., "John S.")
                    </p>
                  </div>

                  {/* Submit Button */}
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={createPrayerMutation.isPending}
                      data-testid="button-create-prayer"
                    >
                      {createPrayerMutation.isPending ? "Creating..." : "Create Prayer"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pending" className="mt-6">
            {renderPrayerList('pending')}
          </TabsContent>

          <TabsContent value="approved" className="mt-6">
            {renderPrayerList('approved')}
          </TabsContent>

          <TabsContent value="answered" className="mt-6">
            {renderPrayerList('answered')}
          </TabsContent>

          <TabsContent value="rejected" className="mt-6">
            {renderPrayerList('rejected')}
          </TabsContent>

          <TabsContent value="archived" className="mt-6">
            {renderPrayerList('archived')}
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
