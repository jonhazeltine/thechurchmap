import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CallingBadge } from "./CallingBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { X, ChevronDown, ChevronRight, MapPin, Info, ExternalLink, Trash2, Heart, Sparkles, TrendingUp, Sprout, Sun, Pencil, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { type Calling, type ChurchWithCallings, type MinistryAreaWithCalling } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { Link } from "wouter";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ChurchCallingsEditorProps {
  church: ChurchWithCallings;
  onOpenBudgetWizard?: () => void;
  onEnterAllocationMode?: () => void;
  onViewPrayerCoverage?: () => void;
}

interface PrayerFocusSectionProps {
  church: ChurchWithCallings;
  canEdit: boolean;
  onOpenBudgetWizard?: () => void;
  onEnterAllocationMode?: () => void;
  onViewPrayerCoverage?: () => void;
}

function PrayerFocusSection({
  church,
  canEdit,
  onOpenBudgetWizard,
  onEnterAllocationMode,
  onViewPrayerCoverage,
}: PrayerFocusSectionProps) {
  const { toast } = useToast();
  const { data: budgetData, isLoading: budgetLoading } = useQuery({
    queryKey: ['/api/churches', church.id, 'prayer-budget'],
    queryFn: async () => {
      const res = await fetch(`/api/churches/${church.id}/prayer-budget`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 30 * 1000,
  });

  const hasBudget = budgetData?.daily_intercessor_count ?? null;

  const { data: coverageData } = useQuery({
    queryKey: ['/api/prayer-coverage/church', church.id],
    queryFn: async () => {
      const res = await fetch(`/api/prayer-coverage/church/${church.id}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: hasBudget !== null,
    staleTime: 30 * 1000,
  });

  const { data: engagementData } = useQuery({
    queryKey: ['/api/churches', church.id, 'engagement'],
    queryFn: async () => {
      const res = await fetch(`/api/churches/${church.id}/engagement`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: hasBudget !== null,
    staleTime: 60 * 1000,
  });

  const getEngagementLevel = (score: number) => {
    if (score >= 0.8) return { label: "Active", color: "text-emerald-600 dark:text-emerald-400", icon: Sparkles };
    if (score >= 0.5) return { label: "Growing", color: "text-amber-600 dark:text-amber-400", icon: TrendingUp };
    if (score >= 0.2) return { label: "Getting Started", color: "text-blue-600 dark:text-blue-400", icon: Sprout };
    return { label: "Welcome Back", color: "text-violet-600 dark:text-violet-400", icon: Sun };
  };

  const engagementLevel = getEngagementLevel(engagementData?.effective_score ?? 1.0);
  const EngagementIcon = engagementLevel.icon;

  if (budgetLoading) {
    return <div className="p-3 border rounded-md bg-card animate-pulse h-12" />;
  }

  if (!hasBudget) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Define where your church is praying across the city using tract-based geographic allocation
        </p>
        {canEdit ? (
          <Button
            onClick={() => onOpenBudgetWizard?.()}
            variant="outline"
            className="w-full"
            data-testid="button-create-prayer-map-callings"
          >
            <Heart className="w-4 h-4 mr-2" />
            Set Up Prayer Map
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-2">
            No prayer map defined
          </p>
        )}
      </div>
    );
  }

  return (
    <Card className="bg-amber-500/5 border-amber-200 dark:border-amber-800">
      <div className="p-3 space-y-3">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div
            className={`space-y-1 ${canEdit ? "cursor-pointer hover-elevate rounded-md p-1 -m-1" : ""}`}
            onClick={canEdit ? () => onOpenBudgetWizard?.() : undefined}
            data-testid="cell-daily-intercessors-callings"
          >
            <p className="text-muted-foreground">Daily Intercessors</p>
            <p className="font-semibold text-sm" data-testid="text-intercessor-count">
              {budgetData?.daily_intercessor_count ?? 0}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Budget Allocated</p>
            <p className="font-semibold text-sm">{Math.round(coverageData?.total_allocation_pct ?? 0)}%</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Engagement</p>
            <div className="flex items-center gap-1">
              <EngagementIcon className={`w-3 h-3 ${engagementLevel.color}`} />
              <p className={`font-semibold text-sm ${engagementLevel.color}`}>{engagementLevel.label}</p>
            </div>
          </div>
        </div>

        {canEdit && (
          <div className="flex gap-2 pt-1">
            <Button
              onClick={() => onViewPrayerCoverage?.()}
              variant="ghost"
              size="sm"
              className="flex-1 text-xs"
              data-testid="button-view-prayer-coverage-callings"
            >
              <MapPin className="w-3 h-3 mr-1" />
              View Prayer Map
            </Button>
            <Button
              onClick={() => onEnterAllocationMode?.()}
              variant="ghost"
              size="sm"
              className="flex-1 text-xs"
              data-testid="button-edit-allocation-callings"
            >
              <Pencil className="w-3 h-3 mr-1" />
              Change Allocation
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

export function ChurchCallingsEditor({ church, onOpenBudgetWizard, onEnterAllocationMode, onViewPrayerCoverage }: ChurchCallingsEditorProps) {
  const { toast } = useToast();
  const { isSuperAdmin, isPlatformAdmin, churchAdminChurchIds } = useAdminAccess();
  const { getMapUrl } = usePlatformNavigation();
  
  // Check if user can edit this specific church
  const canEdit = isSuperAdmin || isPlatformAdmin || churchAdminChurchIds.includes(church.id);
  
  // Debug logging for church admin permissions
  console.log('🔐 ChurchCallingsEditor canEdit check:', {
    churchId: church.id,
    churchName: church.name,
    isSuperAdmin,
    isPlatformAdmin,
    churchAdminChurchIds,
    isInChurchAdminList: churchAdminChurchIds.includes(church.id),
    canEdit
  });
  
  // State for collapsible sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    place: true,
    people: false,
    problem: false,
    purpose: false,
    prayer: false,
  });

  const { data: prayerCoverageData } = useQuery({
    queryKey: ['/api/prayer-coverage/church', church.id],
    queryFn: async () => {
      const res = await fetch(`/api/prayer-coverage/church/${church.id}`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    if (prayerCoverageData?.allocations?.length > 0) {
      setOpenSections(prev => ({ ...prev, prayer: true }));
    }
  }, [prayerCoverageData]);

  // Fetch all callings
  const { data: allCallings = [] } = useQuery<Calling[]>({
    queryKey: ["/api/callings"],
  });
  
  // Fetch ministry areas for this church
  const { data: ministryAreasData = [] } = useQuery<MinistryAreaWithCalling[]>({
    queryKey: ["/api/ministry-areas"],
  });
  
  // Get ministry areas specific to this church
  const churchMinistryAreas = useMemo(() => {
    if (!ministryAreasData) return [];
    return ministryAreasData.filter(area => area.church_id === church.id);
  }, [ministryAreasData, church.id]);
  
  // Map calling_id to ministry area for quick lookup
  const callingToAreaMap = useMemo(() => {
    const map = new Map<string, MinistryAreaWithCalling>();
    churchMinistryAreas.forEach(area => {
      // Store by calling_id if available (for specific calling matches)
      if (area.calling_id) {
        map.set(`id:${area.calling_id}`, area);
      }
      // Also store by calling_type for fallback matching
      if (area.calling_type) {
        const existingKey = `type:${area.calling_type}`;
        if (!map.has(existingKey)) {
          map.set(existingKey, area);
        }
      }
    });
    return map;
  }, [churchMinistryAreas]);
  
  // Get the primary ministry area for this church (from ministry areas data)
  const primaryMinistryArea = useMemo(() => {
    if (!ministryAreasData) return null;
    return ministryAreasData.find(
      area => area.church_id === church.id && area.is_primary
    );
  }, [ministryAreasData, church.id]);
  
  // Check if church has a primary ministry area (Place calling)
  const hasPrimaryMinistryArea = Boolean(church.primary_ministry_area || primaryMinistryArea);

  // Group ministry areas by calling type (for showing areas without selected callings)
  const ministryAreasByType = useMemo(() => {
    const grouped: Record<string, MinistryAreaWithCalling[]> = {
      place: [],
      people: [],
      problem: [],
      purpose: [],
    };
    
    churchMinistryAreas.forEach((area) => {
      if (area.calling_type && !area.is_primary) {
        grouped[area.calling_type]?.push(area);
      }
    });
    
    return grouped;
  }, [churchMinistryAreas]);

  // Group callings by type
  const callingsByType = useMemo(() => {
    const grouped: Record<string, Calling[]> = {
      place: [],
      people: [],
      problem: [],
      purpose: [],
    };
    
    allCallings.forEach((calling) => {
      grouped[calling.type]?.push(calling);
    });
    
    return grouped;
  }, [allCallings]);

  // Get available callings (not already selected)
  const availableCallings = useMemo(() => {
    const selectedIds = new Set(church.callings?.map(c => c.id) || []);
    return allCallings.filter(calling => !selectedIds.has(calling.id));
  }, [allCallings, church.callings]);

  // Mutation to update church callings
  const updateCallingsMutation = useMutation({
    mutationFn: async (callingIds: string[]) => {
      return await apiRequest("PATCH", `/api/churches/${church.id}`, { calling_ids: callingIds });
    },
    onSuccess: async (_, callingIds) => {
      // Optimistically update cache: build the new callings array
      const newCallings = callingIds
        .map(id => allCallings.find(c => c.id === id))
        .filter((c): c is Calling => c !== undefined);
      
      // Update the individual church query cache
      queryClient.setQueryData(["/api/churches", church.id], (old: any) => {
        if (!old) return old;
        return { ...old, callings: newCallings };
      });
      
      // Update ALL churches list query caches (with different filter combinations)
      // Iterate over all existing queries that match the ["/api/churches", ...] pattern
      queryClient.getQueriesData({ queryKey: ["/api/churches"] }).forEach(([queryKey, oldData]) => {
        // Skip the individual church query (already updated above)
        if (queryKey.length === 2 && typeof queryKey[1] === 'string') return;
        
        // Update the churches array in this query
        if (Array.isArray(oldData)) {
          queryClient.setQueryData(queryKey, oldData.map(c => 
            c.id === church.id ? { ...c, callings: newCallings } : c
          ));
        }
      });
      
      // Invalidate to trigger refetch in background
      await queryClient.invalidateQueries({ queryKey: ["/api/churches", church.id], refetchType: "active" });
      await queryClient.invalidateQueries({ queryKey: ["/api/churches"], refetchType: "active" });
      
      toast({
        title: "Success",
        description: "Church callings updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update callings",
        variant: "destructive",
      });
    },
  });

  const handleRemoveCalling = (callingId: string) => {
    const currentCallingIds = church.callings?.map(c => c.id) || [];
    updateCallingsMutation.mutate(currentCallingIds.filter(id => id !== callingId));
  };

  // Mutation to delete primary ministry area
  const deletePrimaryAreaMutation = useMutation({
    mutationFn: async (churchId: string) => {
      // Primary ministry areas are stored on the church record, not in ministry_areas table
      // Use the dedicated endpoint for deleting primary ministry area
      return await apiRequest("DELETE", `/api/churches/${churchId}/primary-ministry-area`);
    },
    onSuccess: async () => {
      // Invalidate ministry areas and church queries
      await queryClient.invalidateQueries({ queryKey: ["/api/ministry-areas"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/churches", church.id] });
      await queryClient.invalidateQueries({ queryKey: ["/api/churches"] });
      
      toast({
        title: "Success",
        description: "Primary ministry area deleted",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete ministry area",
        variant: "destructive",
      });
    },
  });

  const handleDeletePrimaryArea = () => {
    // Pass the church ID, not the synthetic area ID
    deletePrimaryAreaMutation.mutate(church.id);
  };

  // Mutation to delete calling-specific ministry area
  const deleteCallingAreaMutation = useMutation({
    mutationFn: async (areaId: string) => {
      return await apiRequest("DELETE", `/api/churches/${church.id}/calling-areas/${areaId}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/ministry-areas"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/churches", church.id] });
      await queryClient.invalidateQueries({ queryKey: ["/api/churches"] });
      
      toast({
        title: "Success",
        description: "Ministry area deleted",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete ministry area",
        variant: "destructive",
      });
    },
  });
  
  // Handle adding a calling (direct add, no dropdown)
  const handleToggleCalling = (calling: Calling) => {
    const currentCallingIds = church.callings?.map(c => c.id) || [];
    const isSelected = currentCallingIds.includes(calling.id);
    
    if (isSelected) {
      // Remove
      updateCallingsMutation.mutate(currentCallingIds.filter(id => id !== calling.id));
    } else {
      // Add
      updateCallingsMutation.mutate([...currentCallingIds, calling.id]);
    }
  };
  
  
  // Get category info
  const getCategoryInfo = (type: string) => {
    switch (type) {
      case 'place':
        return 'A specific geographic area where your church ministers';
      case 'people':
        return 'Demographics and people groups your church serves';
      case 'problem':
        return 'Human needs and challenges your church addresses';
      case 'purpose':
        return 'Mission focus and spiritual objectives';
      case 'prayer':
        return 'Geographic prayer coverage through tract-based allocation';
      default:
        return '';
    }
  };
  
  // Get ministry area for a calling
  const getAreaForCalling = (calling: Calling) => {
    // First try to match by calling_id (most specific)
    const areaById = callingToAreaMap.get(`id:${calling.id}`);
    if (areaById) return areaById;
    
    // Fall back to matching by calling_type
    const areaByType = callingToAreaMap.get(`type:${calling.type}`);
    return areaByType || null;
  };
  
  // Render ministry area link
  const renderAreaLink = (calling: any) => {
    const area = getAreaForCalling(calling);
    
    // Check for a custom ministry area with matching calling
    if (area && !area.is_primary) {
      return (
        <Link 
          href={getMapUrl({ church: church.id, showArea: area.id })}
          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          data-testid={`link-area-${area.id}`}
        >
          <ExternalLink className="w-3 h-3" />
          {area.name}
        </Link>
      );
    }
    
    // For Place callings, show primary ministry area link if available
    if (calling.type === 'place' && hasPrimaryMinistryArea) {
      const areaName = primaryMinistryArea?.name || 'Primary Ministry Area';
      const areaId = primaryMinistryArea?.id || `primary-${church.id}`;
      return (
        <Link 
          href={getMapUrl({ church: church.id, showArea: areaId })}
          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          data-testid={`link-primary-area-${calling.id}`}
        >
          <ExternalLink className="w-3 h-3" />
          {areaName.replace(` - Primary Ministry Area`, '')}
        </Link>
      );
    }
    
    // Fallback text
    return (
      <span className="text-xs text-muted-foreground">
        {calling.type === 'place' ? 'No area drawn yet' : 'Using primary ministry area'}
      </span>
    );
  };

  // Get selected callings by type
  const selectedCallingsByType = useMemo(() => {
    const grouped: Record<string, Calling[]> = {
      place: [],
      people: [],
      problem: [],
      purpose: [],
    };
    
    (church.callings || []).forEach((calling) => {
      grouped[calling.type]?.push(calling);
    });
    
    return grouped;
  }, [church.callings]);

  return (
    <>
      <Card data-testid="card-callings-editor">
        <CardHeader>
          <CardTitle>Calling</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Select your church's calling focus areas
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 1. PLACE SECTION - Special handling */}
          <Collapsible
            open={openSections.place}
            onOpenChange={(open) => setOpenSections(prev => ({ ...prev, place: open }))}
          >
            <div className="border rounded-md">
              <CollapsibleTrigger asChild>
                <button className="flex items-center justify-between w-full p-3 hover-elevate" data-testid="button-toggle-place-section">
                  <div className="flex items-center gap-2">
                    {openSections.place ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                    <span className="font-semibold uppercase text-sm tracking-wide">Place</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="w-3 h-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{getCategoryInfo('place')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  {selectedCallingsByType.place.length > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {selectedCallingsByType.place.length}
                    </Badge>
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="p-4 pt-0 space-y-3">
                  {/* Show primary ministry area if it exists */}
                  {hasPrimaryMinistryArea && (
                    <div className="bg-primary/5 border border-primary/20 rounded-md p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h4 className="font-medium text-sm">Primary Ministry Area</h4>
                          <p className="text-xs text-muted-foreground">
                            Your church's main geographic focus area
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link
                            href={getMapUrl({ church: church.id, showArea: `primary-${church.id}` })}
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline whitespace-nowrap"
                            data-testid="link-view-primary-ministry-area"
                          >
                            <MapPin className="w-3 h-3" />
                            View on Map
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                          {canEdit && primaryMinistryArea?.id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={handleDeletePrimaryArea}
                              disabled={deletePrimaryAreaMutation.isPending}
                              data-testid="button-delete-primary-ministry-area"
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Show selected Place callings */}
                  {selectedCallingsByType.place.length > 0 && (
                    <div className="space-y-2">
                      {selectedCallingsByType.place.map((calling: any) => (
                        <div 
                          key={calling.id}
                          className="p-2 border rounded-md flex items-center justify-between gap-3"
                          data-testid={`calling-row-${calling.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <CallingBadge calling={calling} size="sm" />
                            <div className="mt-1">
                              {renderAreaLink(calling)}
                            </div>
                          </div>
                          
                          {canEdit && (
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleToggleCalling(calling)}
                                data-testid={`button-remove-calling-${calling.id}`}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Available Place callings as badges - only show if there are place callings in the system */}
                  {canEdit && callingsByType.place && callingsByType.place.length > 0 && (
                    <div>
                      <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">
                        Available Place Callings
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {callingsByType.place?.map((calling) => {
                          const isSelected = church.callings?.some(c => c.id === calling.id);
                          if (isSelected) return null; // Already shown above
                          
                          return (
                            <Badge
                              key={calling.id}
                              variant="outline"
                              className="cursor-pointer hover-elevate active-elevate-2"
                              onClick={() => handleToggleCalling(calling)}
                              data-testid={`badge-calling-${calling.id}`}
                            >
                              <div
                                className="w-2 h-2 rounded-full mr-2"
                                style={{ backgroundColor: calling.color || "#888" }}
                              />
                              {calling.name}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  {/* When no ministry areas exist, show Add Ministry Areas CTA */}
                  {canEdit && !hasPrimaryMinistryArea && churchMinistryAreas.length === 0 && (
                    <div className="bg-muted/50 rounded-md p-4">
                      <p className="text-sm text-muted-foreground mb-3">
                        Define your church's geographic ministry focus by drawing ministry areas on the map.
                      </p>
                      <Button asChild variant="outline" className="w-full">
                        <Link 
                          href={getMapUrl({ church: church.id })}
                          data-testid="link-draw-ministry-areas"
                        >
                          <MapPin className="w-4 h-4 mr-2" />
                          Add Ministry Areas
                        </Link>
                      </Button>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* 2. PRAYER SECTION - Tract-based mapping */}
          <Collapsible
            open={openSections.prayer}
            onOpenChange={(open) => setOpenSections(prev => ({ ...prev, prayer: open }))}
          >
            <div className="border rounded-md">
              <CollapsibleTrigger asChild>
                <button className="flex items-center justify-between w-full p-3 hover-elevate" data-testid="button-toggle-prayer-section">
                  <div className="flex items-center gap-2">
                    {openSections.prayer ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                    <span className="font-semibold uppercase text-sm tracking-wide">Prayer</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="w-3 h-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{getCategoryInfo('prayer')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="p-4 pt-0 space-y-3">
                  <PrayerFocusSection
                    church={church}
                    canEdit={canEdit}
                    onOpenBudgetWizard={onOpenBudgetWizard}
                    onEnterAllocationMode={onEnterAllocationMode}
                    onViewPrayerCoverage={onViewPrayerCoverage}
                  />
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* 3. PEOPLE, PROBLEM, PURPOSE SECTIONS */}
          {['people', 'problem', 'purpose'].map((type) => {
            const selectedCallings = selectedCallingsByType[type as keyof typeof selectedCallingsByType];
            const isOpen = openSections[type as keyof typeof openSections];
            
            return (
            <Collapsible
              key={type}
              open={isOpen}
              onOpenChange={(open) => setOpenSections(prev => ({ ...prev, [type]: open }))}
            >
              <div className="border rounded-md">
                <CollapsibleTrigger asChild>
                  <button className="flex items-center justify-between w-full p-3 hover-elevate" data-testid={`button-toggle-${type}-section`}>
                    <div className="flex items-center gap-2">
                      {isOpen ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      <span className="font-semibold uppercase text-sm tracking-wide">{type}</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-3 h-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{getCategoryInfo(type)}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    {(selectedCallings.length > 0 || ministryAreasByType[type]?.length > 0) && (
                      <Badge variant="secondary" className="ml-2">
                        {selectedCallings.length + (ministryAreasByType[type]?.length || 0)}
                      </Badge>
                    )}
                  </button>
                </CollapsibleTrigger>
                
                {/* Show selected callings and ministry areas outside the collapsible content (always visible) */}
                {!isOpen && (selectedCallings.length > 0 || ministryAreasByType[type]?.length > 0) && (
                  <div className="px-3 pb-3 flex flex-wrap gap-2">
                    {selectedCallings.map((calling: any) => (
                      <CallingBadge key={calling.id} calling={calling} size="sm" />
                    ))}
                    {ministryAreasByType[type]?.map((area) => (
                      <Badge 
                        key={area.id}
                        variant="secondary" 
                        className="text-xs"
                        style={{ 
                          backgroundColor: area.calling_color ? `${area.calling_color}20` : undefined,
                          borderColor: area.calling_color || undefined,
                          borderWidth: '1px',
                        }}
                      >
                        <MapPin className="w-3 h-3 mr-1" />
                        {area.calling_name || area.name}
                      </Badge>
                    ))}
                  </div>
                )}
                <CollapsibleContent>
                  <div className="p-4 pt-0 space-y-3">
                    {/* Show selected callings first */}
                    {selectedCallingsByType[type as keyof typeof selectedCallingsByType].length > 0 && (
                      <div className="space-y-2 mb-4">
                        <Label className="text-xs font-semibold uppercase text-muted-foreground">
                          Selected
                        </Label>
                        {selectedCallingsByType[type as keyof typeof selectedCallingsByType].map((calling: any) => (
                          <div 
                            key={calling.id}
                            className="p-2 border rounded-md flex items-center justify-between gap-3"
                            data-testid={`calling-row-${calling.id}`}
                          >
                            <div className="flex-1 min-w-0">
                              <CallingBadge calling={calling} size="sm" />
                              <div className="mt-1">
                                {renderAreaLink(calling)}
                              </div>
                            </div>
                            
                            {canEdit && (
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleToggleCalling(calling)}
                                  data-testid={`button-remove-calling-${calling.id}`}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Show ministry areas for this type (even without selected callings) */}
                    {ministryAreasByType[type]?.length > 0 && (
                      <div className="space-y-2 mb-4">
                        <Label className="text-xs font-semibold uppercase text-muted-foreground">
                          Ministry Areas
                        </Label>
                        {ministryAreasByType[type].map((area) => (
                          <div 
                            key={area.id}
                            className="p-3 border rounded-md bg-muted/30"
                            data-testid={`ministry-area-row-${area.id}`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm">{area.name}</p>
                                {area.calling_name && (
                                  <Badge 
                                    variant="secondary" 
                                    className="text-xs mt-1"
                                    style={{ 
                                      backgroundColor: area.calling_color ? `${area.calling_color}20` : undefined,
                                      borderColor: area.calling_color || undefined,
                                      borderWidth: '1px',
                                    }}
                                  >
                                    {area.calling_name}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Link
                                  href={getMapUrl({ church: church.id, showArea: area.id })}
                                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline whitespace-nowrap"
                                  data-testid={`link-view-area-${area.id}`}
                                >
                                  <MapPin className="w-3 h-3" />
                                  View on Map
                                  <ExternalLink className="w-3 h-3" />
                                </Link>
                                {canEdit && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => deleteCallingAreaMutation.mutate(area.id)}
                                    disabled={deleteCallingAreaMutation.isPending}
                                    data-testid={`button-delete-area-${area.id}`}
                                  >
                                    <Trash2 className="w-3 h-3 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Available callings as chips - only show if canEdit */}
                    {canEdit && (
                      <div>
                        <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">
                          Available
                        </Label>
                        <div className="flex flex-wrap gap-2">
                          {callingsByType[type]?.map((calling) => {
                            const isSelected = church.callings?.some(c => c.id === calling.id);
                            if (isSelected) return null; // Already shown above
                            
                            return (
                              <Badge
                                key={calling.id}
                                variant="outline"
                                className="cursor-pointer hover-elevate active-elevate-2"
                                onClick={() => handleToggleCalling(calling)}
                                data-testid={`badge-calling-${calling.id}`}
                              >
                                <div
                                  className="w-2 h-2 rounded-full mr-2"
                                  style={{ backgroundColor: calling.color || "#888" }}
                                />
                                {calling.name}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
          })}

        </CardContent>
      </Card>

    </>
  );
}
