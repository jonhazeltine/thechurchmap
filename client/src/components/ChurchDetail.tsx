import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ChurchHeader } from "./ChurchHeader";
import { ChurchContactInfo } from "./ChurchContactInfo";
import { BoundarySearch } from "./BoundarySearch";
import { PinAdjustment } from "./PinAdjustment";
import { ChurchCollaborationsSection } from "./ChurchCollaborationsSection";
import { GuestPrayerModal } from "./GuestPrayerModal";
import { SubmitPrayerDialog } from "./SubmitPrayerDialog";
import { ClaimChurchButton } from "./ClaimChurchButton";
import { FacilityCard } from "./FacilityCard";
import { useToast } from "@/hooks/use-toast";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useAuth } from "@/contexts/AuthContext";
import { useSafePlatformContext } from "@/contexts/PlatformContext";
import { type ChurchWithCallings, type Area, type Boundary, type InternalTagWithUsage } from "@shared/schema";
import { Eye, EyeOff, Trash2, MapPin, Pencil, Plus, Hand, Tag, Star, Flag, Heart, Bookmark, Circle, CheckCircle, AlertCircle, Info, Zap, Crown, Shield, Award, Target, Bell, Clock, Users, Building, X, Check, Send, MessageCircle, ExternalLink, Loader2, Sparkles, TrendingUp, Sprout, Sun, DollarSign } from "lucide-react";
import { Card } from "@/components/ui/card";

interface ChurchDetailProps {
  church: ChurchWithCallings;
  onDrawAreaClick: (churchId: string, isPrimary?: boolean, callingId?: string, areaToEdit?: Area) => void;
  onCancelDrawing?: () => void;
  isDrawingArea: boolean;
  isDrawingPrimaryArea?: boolean;
  churchAreas: Area[]; // Passed from Home, no duplicate fetch
  visibleChurchAreaIds: Set<string>;
  toggleChurchAreaVisibility: (churchId: string, areaId: string) => void;
  visibleBoundaryIds: Set<string>;
  toggleBoundaryVisibility: (churchId: string, boundaryId: string) => void;
  isPrimaryAreaVisible: boolean;
  togglePrimaryAreaVisibility: (churchId: string) => void;
  onHoverBoundary?: (boundary: Boundary | null) => void;
  highlightedAreaId?: string | null;
  onAreaClick?: (areaId: string) => void;
  onZoomToGeometry?: (geometry: any) => void; // Zoom map to fit geometry bounds
  activeSubTab?: string;
  onSubTabChange?: (tab: string) => void;
  drawingCallingId?: string | null; // Currently drawing for this calling
  isPinAdjustMode?: boolean;
  pendingPinPosition?: { lat: number; lng: number } | null;
  onEnterPinAdjustMode?: () => void;
  onExitPinAdjustMode?: () => void;
  onPinPositionSaved?: () => void;
  onPinPositionReset?: () => void;
  onEnterAllocationMode?: () => void;  // triggers allocation mode from the profile
  onOpenBudgetWizard?: () => void;     // opens budget wizard
  onViewPrayerCoverage?: () => void;   // centers map + shows prayer coverage
  onPrimaryAreaChanged?: (churchId: string, churchName: string) => void;
  onAllocationPreview?: (preview: Record<string, number> | null) => void;
}

interface MinistryCapacityCardProps {
  church: ChurchWithCallings;
  canEdit: boolean;
}

function MinistryCapacityCard({ church, canEdit }: MinistryCapacityCardProps) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [volunteers, setVolunteers] = useState<string>("0");
  const [budget, setBudget] = useState<string>("0");

  const { data: ministryCapacity } = useQuery({
    queryKey: ["/api/churches", church.id, "ministry-capacity"],
    queryFn: () => fetch(`/api/churches/${church.id}/ministry-capacity`).then(r => r.json()),
    enabled: canEdit && !!church.id,
  });

  useEffect(() => {
    if (ministryCapacity) {
      setVolunteers(String(ministryCapacity.community_ministry_volunteers ?? 0));
      setBudget(String(ministryCapacity.annual_ministry_budget ?? 0));
    }
  }, [ministryCapacity]);

  const volunteersNum = parseInt(volunteers) || 0;
  const budgetNum = parseInt(budget) || 0;

  const saveCapacityMutation = useMutation({
    mutationFn: async (data: { community_ministry_volunteers: number; annual_ministry_budget: number }) => {
      return apiRequest("POST", `/api/churches/${church.id}/ministry-capacity`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches", church.id, "ministry-capacity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/churches", church.id] });
      toast({
        title: "Saved",
        description: "Ministry capacity updated successfully.",
      });
      setDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save ministry capacity.",
        variant: "destructive",
      });
    },
  });

  const capacityUnits = volunteersNum + Math.floor(budgetNum / 1000);

  if (!canEdit) return null;

  return (
    <>
      <Button
        onClick={() => setDialogOpen(true)}
        variant="outline"
        className="w-full"
        data-testid="button-open-ministry-capacity"
      >
        <TrendingUp className="w-4 h-4 mr-2" />
        Ministry Capacity
      </Button>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Ministry Capacity</DialogTitle>
            <DialogDescription>
              Help us accurately reflect the powerful work your church does and the generosity you bring to your city. By sharing your ministry capacity, we can better visualize the incredible impact churches like yours are making across the community.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-xs font-medium">
                <Users className="w-3.5 h-3.5" />
                Community Ministry Volunteers
              </Label>
              <Input
                type="number"
                min={0}
                step={1}
                value={volunteers}
                onChange={(e) => setVolunteers(e.target.value)}
                data-testid="input-volunteer-count"
              />
              <p className="text-xs text-muted-foreground">
                Count unique people who serve regularly in community-facing ministry (at least monthly). Exclude Sunday-only roles.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-xs font-medium">
                <DollarSign className="w-3.5 h-3.5" />
                Annual Community Ministry Budget ($)
              </Label>
              <Input
                type="number"
                min={0}
                step={1}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                data-testid="input-annual-budget"
              />
              <p className="text-xs text-muted-foreground">
                Estimated dollars per year that directly support community-facing ministry work.
              </p>
            </div>

            <div className="rounded-md bg-muted/50 p-3 space-y-1">
              <p className="text-sm font-medium" data-testid="text-capacity-units">
                {capacityUnits} capacity units
              </p>
              <p className="text-xs text-muted-foreground">
                Ministry Capacity increases your church's map saturation, showing the strength of your geographic investment.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => saveCapacityMutation.mutate({ community_ministry_volunteers: volunteersNum, annual_ministry_budget: budgetNum })}
              disabled={saveCapacityMutation.isPending}
              className="w-full"
              data-testid="button-save-ministry-capacity"
            >
              {saveCapacityMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Ministry Capacity"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface MinistryAllocationSlidersProps {
  church: ChurchWithCallings;
  canEdit: boolean;
  onAllocationPreview?: (preview: Record<string, number> | null) => void;
}

function MinistryAllocationSliders({ church, canEdit, onAllocationPreview }: MinistryAllocationSlidersProps) {
  const { toast } = useToast();
  const [localAllocations, setLocalAllocations] = useState<Record<string, number>>({});
  const [isDirty, setIsDirty] = useState(false);

  const { data: ministryAreas = [], isLoading: areasLoading } = useQuery<Array<{ id: string; name: string; church_id: string }>>({
    queryKey: ["/api/ministry-areas", { church_id: church.id }],
    queryFn: async () => {
      const res = await fetch(`/api/ministry-areas?church_id=${church.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: canEdit && !!church.id,
  });

  const { data: allocationsData, isLoading: allocationsLoading } = useQuery<{ allocations: Array<{ area_id: string; allocation_pct: number }> }>({
    queryKey: ["/api/churches", church.id, "ministry-allocations"],
    queryFn: async () => {
      const res = await fetch(`/api/churches/${church.id}/ministry-allocations`);
      if (!res.ok) return { allocations: [] };
      return res.json();
    },
    enabled: canEdit && !!church.id,
  });

  const churchAreas = ministryAreas.filter(a => a.church_id === church.id);

  useEffect(() => {
    if (!churchAreas.length) return;

    const existingAllocations = allocationsData?.allocations || [];
    const allocMap: Record<string, number> = {};

    if (existingAllocations.length > 0) {
      for (const alloc of existingAllocations) {
        allocMap[alloc.area_id] = alloc.allocation_pct;
      }
      for (const area of churchAreas) {
        if (!(area.id in allocMap)) {
          allocMap[area.id] = 0;
        }
      }
    } else {
      const equalPct = churchAreas.length > 0 ? Math.floor(100 / churchAreas.length) : 0;
      const remainder = 100 - equalPct * churchAreas.length;
      churchAreas.forEach((area, i) => {
        allocMap[area.id] = equalPct + (i === 0 ? remainder : 0);
      });
    }

    setLocalAllocations(allocMap);
    setIsDirty(false);
  }, [allocationsData, ministryAreas.length]);

  const handleSliderChange = (areaId: string, newValue: number) => {
    const oldValue = localAllocations[areaId] ?? 0;
    const diff = newValue - oldValue;
    if (diff === 0) return;

    const otherIds = churchAreas.filter(a => a.id !== areaId).map(a => a.id);
    if (otherIds.length === 0) return;

    const updated = { ...localAllocations };
    updated[areaId] = newValue;

    const otherTotal = otherIds.reduce((sum, id) => sum + (updated[id] ?? 0), 0);

    if (otherTotal === 0 && diff > 0) {
      const perOther = diff / otherIds.length;
      otherIds.forEach(id => {
        updated[id] = Math.max(0, (updated[id] ?? 0) - perOther);
      });
    } else if (otherTotal > 0) {
      let remaining = -diff;
      for (const id of otherIds) {
        const proportion = (updated[id] ?? 0) / otherTotal;
        const adjustment = remaining * proportion;
        const newPct = Math.max(0, Math.round(((updated[id] ?? 0) + adjustment) * 10) / 10);
        updated[id] = newPct;
      }
    }

    const total = Object.values(updated).reduce((s, v) => s + v, 0);
    if (Math.abs(total - 100) > 0.5) {
      const correction = 100 - total;
      const firstOther = otherIds.find(id => (updated[id] ?? 0) > 0) || otherIds[0];
      if (firstOther) {
        updated[firstOther] = Math.max(0, (updated[firstOther] ?? 0) + correction);
      }
    }

    setLocalAllocations(updated);
    if (onAllocationPreview) {
      const scales: Record<string, number> = {};
      const savedAllocations = allocationsData?.allocations || [];
      for (const area of churchAreas) {
        const savedPct = savedAllocations.find(a => a.area_id === area.id)?.allocation_pct
          ?? (100 / churchAreas.length);
        const newPct = updated[area.id] ?? 0;
        scales[area.id] = savedPct > 0 ? newPct / savedPct : 0;
      }
      onAllocationPreview(scales);
    }
    setIsDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (allocations: Array<{ area_id: string; allocation_pct: number }>) => {
      return apiRequest("POST", `/api/churches/${church.id}/ministry-allocations`, { allocations });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches", church.id, "ministry-allocations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ministry-saturation/clipped"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ministry-saturation/city"] });
      setIsDirty(false);
      onAllocationPreview?.(null);
      toast({ title: "Saved", description: "Ministry focus distribution updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to save distribution.", variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/churches/${church.id}/ministry-allocations`, { allocations: [] });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches", church.id, "ministry-allocations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ministry-saturation/clipped"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ministry-saturation/city"] });
      setIsDirty(false);
      onAllocationPreview?.(null);
      toast({ title: "Reset", description: "Distribution reset to population-weighted default." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to reset distribution.", variant: "destructive" });
    },
  });

  const handleSave = () => {
    const allocations = churchAreas.map(area => ({
      area_id: area.id,
      allocation_pct: Math.round((localAllocations[area.id] ?? 0) * 10) / 10,
    }));
    saveMutation.mutate(allocations);
  };

  if (!canEdit) return null;
  if (areasLoading || allocationsLoading) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Ministry Focus Distribution</h3>
        <div className="p-3 border rounded-md bg-card animate-pulse h-12" />
      </div>
    );
  }
  if (churchAreas.length < 2) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold" data-testid="text-ministry-focus-title">Ministry Focus Distribution</h3>
      <p className="text-xs text-muted-foreground">
        Adjust how your ministry capacity is distributed across your areas. By default, capacity is weighted by population.
      </p>
      <Card>
        <div className="p-3 space-y-4">
          {churchAreas.map((area) => {
            const pct = Math.round((localAllocations[area.id] ?? 0) * 10) / 10;
            return (
              <div key={area.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-medium truncate flex-1">{area.name}</Label>
                  <span className="text-xs font-semibold tabular-nums w-12 text-right" data-testid={`text-allocation-pct-${area.id}`}>
                    {pct.toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={0.5}
                  value={pct}
                  onChange={(e) => handleSliderChange(area.id, parseFloat(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-muted accent-primary"
                  data-testid={`slider-allocation-${area.id}`}
                />
              </div>
            );
          })}

          <div className="flex gap-2 pt-1">
            <Button
              onClick={handleSave}
              disabled={!isDirty || saveMutation.isPending}
              className="flex-1"
              data-testid="button-save-distribution"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Distribution"
              )}
            </Button>
            <Button
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              variant="outline"
              data-testid="button-reset-distribution"
            >
              {resetMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Reset to Default"
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

interface PrayerFocusAreaCardProps {
  church: ChurchWithCallings;
  canEdit: boolean;
  onOpenBudgetWizard?: () => void;
  onEnterAllocationMode?: () => void;
  onViewPrayerCoverage?: () => void;
}

function PrayerFocusAreaCard({
  church,
  canEdit,
  onOpenBudgetWizard,
  onEnterAllocationMode,
  onViewPrayerCoverage,
}: PrayerFocusAreaCardProps) {
  // Fetch prayer budget
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

  // Fetch coverage (only when budget exists)
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

  // Fetch engagement (only when budget exists)
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

  // Determine engagement level
  const getEngagementLevel = (score: number) => {
    if (score >= 0.8) return { label: "Active", color: "text-emerald-600 dark:text-emerald-400", bgColor: "bg-emerald-500/10", icon: Sparkles };
    if (score >= 0.5) return { label: "Growing", color: "text-amber-600 dark:text-amber-400", bgColor: "bg-amber-500/10", icon: TrendingUp };
    if (score >= 0.2) return { label: "Getting Started", color: "text-blue-600 dark:text-blue-400", bgColor: "bg-blue-500/10", icon: Sprout };
    return { label: "Welcome Back", color: "text-violet-600 dark:text-violet-400", bgColor: "bg-violet-500/10", icon: Sun };
  };

  const engagementLevel = getEngagementLevel(engagementData?.effective_score ?? 1.0);
  const EngagementIcon = engagementLevel.icon;

  // Empty state: no budget
  if (budgetLoading) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Prayer Focus Area</h3>
        <p className="text-xs text-muted-foreground">
          Define where your church is praying across the city
        </p>
        <div className="p-3 border rounded-md bg-card animate-pulse h-12" />
      </div>
    );
  }

  if (!hasBudget) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Prayer Focus Area</h3>
        <p className="text-xs text-muted-foreground">
          Define where your church is praying across the city
        </p>
        {canEdit ? (
          <Button
            onClick={() => onOpenBudgetWizard?.()}
            variant="outline"
            className="w-full"
            data-testid="button-create-prayer-map"
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

  // Active state: budget exists
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Prayer Focus Area</h3>
      <p className="text-xs text-muted-foreground">
        Church-owned prayer coverage
      </p>

      <Card className="bg-amber-500/5 border-amber-200 dark:border-amber-800">
        <div className="p-3 space-y-3">
          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div
              className={`space-y-1 ${canEdit ? "cursor-pointer hover-elevate rounded-md p-1 -m-1" : ""}`}
              onClick={canEdit ? () => onOpenBudgetWizard?.() : undefined}
              data-testid="cell-daily-intercessors"
            >
              <p className="text-muted-foreground">Daily Intercessors</p>
              <p className="font-semibold text-sm">{budgetData?.daily_intercessor_count ?? 0}</p>
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

          {/* Action Buttons */}
          {canEdit && (
            <div className="flex gap-2 pt-1">
              <Button
                onClick={() => onViewPrayerCoverage?.()}
                variant="ghost"
                size="sm"
                className="flex-1 h-8 text-xs"
                data-testid="button-view-prayer-coverage"
              >
                <MapPin className="w-3 h-3 mr-1" />
                View on Map
              </Button>
              <Button
                onClick={() => onEnterAllocationMode?.()}
                variant="ghost"
                size="sm"
                className="flex-1 h-8 text-xs"
                data-testid="button-edit-allocation"
              >
                <Pencil className="w-3 h-3 mr-1" />
                Edit Allocation
              </Button>
              <Button
                onClick={() => onOpenBudgetWizard?.()}
                variant="ghost"
                size="sm"
                className="flex-1 h-8 text-xs"
                data-testid="button-update-budget"
              >
                <Heart className="w-3 h-3 mr-1" />
                Update
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

export function ChurchDetail({ 
  church, 
  onDrawAreaClick, 
  onCancelDrawing,
  isDrawingArea, 
  isDrawingPrimaryArea = false,
  churchAreas,
  visibleChurchAreaIds, 
  toggleChurchAreaVisibility,
  visibleBoundaryIds,
  toggleBoundaryVisibility,
  isPrimaryAreaVisible,
  togglePrimaryAreaVisibility,
  onHoverBoundary,
  highlightedAreaId,
  onAreaClick,
  onZoomToGeometry,
  activeSubTab,
  onSubTabChange,
  drawingCallingId,
  isPinAdjustMode = false,
  pendingPinPosition,
  onEnterPinAdjustMode,
  onExitPinAdjustMode,
  onPinPositionSaved,
  onPinPositionReset,
  onEnterAllocationMode,
  onOpenBudgetWizard,
  onViewPrayerCoverage,
  onPrimaryAreaChanged,
  onAllocationPreview
}: ChurchDetailProps) {
  const { toast } = useToast();
  const { isSuperAdmin, isPlatformAdmin, churchAdminChurchIds } = useAdminAccess();
  const { platform } = useSafePlatformContext();
  const [internalActiveTab, setInternalActiveTab] = useState("details");
  const [removingBoundaryId, setRemovingBoundaryId] = useState<string | null>(null);
  
  // Check if user can edit this specific church
  const canEdit = isSuperAdmin || isPlatformAdmin || churchAdminChurchIds.includes(church.id);
  
  // Debug logging for church admin permissions
  console.log('🔐 ChurchDetail canEdit check:', {
    churchId: church.id,
    churchName: church.name,
    isSuperAdmin,
    isPlatformAdmin,
    churchAdminChurchIds,
    isInChurchAdminList: churchAdminChurchIds.includes(church.id),
    canEdit
  });
  
  // Use controlled tab if provided, otherwise use internal state
  const activeTab = activeSubTab ?? internalActiveTab;
  const setActiveTab = onSubTabChange ?? setInternalActiveTab;

  const deleteAreaMutation = useMutation({
    mutationFn: async (areaId: string) => {
      return apiRequest("DELETE", `/api/areas/${areaId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/areas", church.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/areas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ministry-areas"] });
      toast({
        title: "Area deleted",
        description: "The ministry area has been removed.",
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
  
  const deletePrimaryAreaMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/churches/${church.id}/primary-ministry-area`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/churches", church.id] });
      await queryClient.invalidateQueries({ queryKey: ["/api/churches"] });
      await queryClient.refetchQueries({ queryKey: ["/api/churches", church.id] });
      toast({
        title: "Success",
        description: "Primary ministry area removed",
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

  const setPrimaryAreaMutation = useMutation({
    mutationFn: async ({ area_id, geometry }: { area_id: string; geometry: any }) => {
      return apiRequest("PATCH", `/api/churches/${church.id}/primary-ministry-area`, { area_id, geometry });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/churches", church.id] });
      await queryClient.invalidateQueries({ queryKey: ["/api/churches"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/ministry-areas"] });
      await queryClient.refetchQueries({ queryKey: ["/api/churches", church.id] });
      toast({
        title: "Primary area updated",
        description: "This area is now the primary ministry area.",
      });
      onPrimaryAreaChanged?.(church.id, church.name);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const attachBoundaryMutation = useMutation({
    mutationFn: async (boundary: Boundary) => {
      const currentIds = church.boundary_ids || [];
      
      if (currentIds.includes(boundary.id)) {
        throw new Error("This boundary is already attached");
      }

      return apiRequest("PATCH", `/api/churches/${church.id}`, {
        boundary_ids: [...currentIds, boundary.id],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches", church.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/churches"] });
      toast({
        title: "Boundary attached",
        description: "The boundary has been attached to this church.",
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

  const removeBoundaryMutation = useMutation({
    mutationFn: async (boundaryId: string) => {
      const currentIds = church.boundary_ids || [];
      const newIds = currentIds.filter((id) => id !== boundaryId);

      return apiRequest("PATCH", `/api/churches/${church.id}`, {
        boundary_ids: newIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches", church.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/churches"] });
      setRemovingBoundaryId(null);
      toast({
        title: "Boundary removed",
        description: "The boundary has been removed from this church.",
      });
    },
    onError: (error: Error) => {
      setRemovingBoundaryId(null);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Platform admin check for internal tags
  const isPlatformAdminOrSuper = isSuperAdmin || isPlatformAdmin;

  // Fetch all available internal tags (admin only)
  const { data: allInternalTags = [], isLoading: tagsLoading } = useQuery<InternalTagWithUsage[]>({
    queryKey: ["/api/admin/internal-tags"],
    enabled: isPlatformAdminOrSuper,
    staleTime: 5 * 60 * 1000,
  });

  // Define the shape of assigned tags from the API
  type ChurchInternalTag = {
    tag_id: string;
    tag_name: string;
    tag_slug: string;
    tag_description: string | null;
    color_hex: string;
    icon_key: string;
    applied_at: string;
    applied_by: string | null;
    notes: string | null;
  };

  // Fetch currently assigned internal tags for this church
  // Uses default queryFn which includes auth headers
  const { data: assignedTags = [], isLoading: assignedTagsLoading } = useQuery<ChurchInternalTag[]>({
    queryKey: [`/api/admin/internal-tags/churches/${church.id}`],
    enabled: isPlatformAdminOrSuper,
    retry: false,
  });

  const assignedTagIds = assignedTags.map(a => a.tag_id);

  // Mutation to assign a tag
  const assignTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      return apiRequest("POST", `/api/admin/internal-tags/${tagId}/churches`, { church_id: church.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/internal-tags/churches/${church.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/internal-tags"] });
      toast({
        title: "Tag assigned",
        description: "Internal tag has been assigned to this church.",
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

  // Mutation to unassign a tag
  const unassignTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      return apiRequest("DELETE", `/api/admin/internal-tags/${tagId}/churches`, { church_id: church.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/internal-tags/churches/${church.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/internal-tags"] });
      toast({
        title: "Tag removed",
        description: "Internal tag has been removed from this church.",
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

  // Icon map for internal tags
  const getInternalTagIcon = (iconKey: string) => {
    const iconMap: Record<string, any> = {
      tag: Tag, star: Star, flag: Flag, heart: Heart, bookmark: Bookmark,
      circle: Circle, "check-circle": CheckCircle, "alert-circle": AlertCircle,
      info: Info, zap: Zap, crown: Crown, shield: Shield, award: Award,
      target: Target, bell: Bell, clock: Clock, users: Users, building: Building,
      "map-pin": MapPin,
    };
    return iconMap[iconKey] || Tag;
  };

  return (
    <div className="flex flex-col h-full min-w-0 w-full">
      {/* Church Header with Banner */}
      <div className="p-4 border-b min-w-0">
        <ChurchHeader 
          church={church} 
          variant="medium" 
          showAllCallings={true} 
          canEdit={canEdit}
          showBanner={true}
        />
      </div>
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TabsList className="w-full justify-start rounded-none border-b px-4">
          <TabsTrigger value="details" data-testid="tab-details">Details</TabsTrigger>
          <TabsTrigger value="areas" data-testid="tab-areas">Ministry Areas</TabsTrigger>
          <TabsTrigger value="collaborations" data-testid="tab-collaborations">Collaborations</TabsTrigger>
          <TabsTrigger value="pray" data-testid="tab-pray">Pray</TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1 min-w-0 [&>div>div]:!block">
          <TabsContent value="details" className="m-0 p-4 space-y-6">
            {church.description && (
              <div>
                <h4 className="font-medium mb-2">About</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {church.description}
                </p>
              </div>
            )}

            <div>
              <h4 className="font-medium mb-2">Contact Info</h4>
              <ChurchContactInfo
                address={church.address}
                city={church.city}
                state={church.state}
                zip={church.zip}
                email={church.email}
                phone={church.phone}
                website={church.website}
                layout="full"
              />
              <ClaimChurchButton 
                churchId={church.id} 
                churchName={church.name} 
                church={church}
                className="mt-4 w-full"
              />
            </div>

            {/* Pin Adjustment - Admin Only */}
            {canEdit && (
              <PinAdjustment
                church={church}
                isAdjustMode={isPinAdjustMode}
                pendingPosition={pendingPinPosition}
                onEnterAdjustMode={onEnterPinAdjustMode}
                onExitAdjustMode={onExitPinAdjustMode}
                onSave={onPinPositionSaved}
                onReset={onPinPositionReset}
              />
            )}

            {/* Facility Information - Any Church Admin */}
            <FacilityCard 
              churchId={church.id} 
              isVisible={isSuperAdmin || isPlatformAdmin || churchAdminChurchIds.length > 0}
              canEdit={canEdit}
            />

            {/* Internal Tags - Admin Only */}
            {isPlatformAdminOrSuper && (
              <div className="border-t pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <EyeOff className="w-4 h-4 text-muted-foreground" />
                  <h4 className="font-medium">Internal Tags</h4>
                  <Badge variant="outline" className="text-xs">Admin Only</Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Invisible labels for internal organization. Click to add/remove tags.
                </p>
                
                {(tagsLoading || assignedTagsLoading) ? (
                  <div className="text-sm text-muted-foreground">Loading tags...</div>
                ) : allInternalTags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {allInternalTags.filter(t => t.is_active).map((tag) => {
                      const TagIcon = getInternalTagIcon(tag.icon_key);
                      const isAssigned = assignedTagIds.includes(tag.id);
                      const isPending = assignTagMutation.isPending || unassignTagMutation.isPending;
                      
                      return (
                        <Badge
                          key={tag.id}
                          variant={isAssigned ? "default" : "outline"}
                          className={`cursor-pointer hover-elevate active-elevate-2 gap-1.5 ${isPending ? 'opacity-50' : ''}`}
                          style={isAssigned ? { backgroundColor: tag.color_hex, borderColor: tag.color_hex } : undefined}
                          onClick={() => {
                            if (isPending) return;
                            if (isAssigned) {
                              unassignTagMutation.mutate(tag.id);
                            } else {
                              assignTagMutation.mutate(tag.id);
                            }
                          }}
                          data-testid={`chip-internal-tag-assign-${tag.slug}`}
                        >
                          <TagIcon className="w-3 h-3" />
                          {tag.name}
                          {isAssigned && <Check className="w-3 h-3 ml-1" />}
                        </Badge>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No internal tags configured.{" "}
                    <a href="/admin/internal-tags" className="text-primary underline">Create one</a>
                  </p>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="areas" className="m-0 p-4 space-y-4 overflow-hidden min-w-0">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Ministry Areas</h3>
              <p className="text-xs text-muted-foreground">
                Geographic areas where your church serves. The primary area is your intentional geographic commitment.
              </p>

              <div className="space-y-2">
                {churchAreas.map((area) => {
                  const isVisible = visibleChurchAreaIds.has(area.id);
                  const isHighlighted = area.id === highlightedAreaId;

                  return (
                    <div
                      key={area.id}
                      className="p-2 border rounded bg-background/50"
                      style={isHighlighted ? {
                        borderColor: 'hsl(var(--primary))',
                        borderWidth: '2px'
                      } : undefined}
                      data-testid={`church-area-item-${area.id}`}
                    >
                      <div className="flex items-center justify-between gap-1 min-w-0">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div
                            className="w-3 h-3 rounded-full border-2 flex-shrink-0"
                            style={{
                              backgroundColor: area.is_primary ? 'rgba(234, 179, 8, 0.3)' : 'hsl(var(--primary) / 0.1)',
                              borderColor: area.is_primary ? '#EAB308' : 'hsl(var(--primary))'
                            }}
                          />
                          <div
                            className="flex-1 cursor-pointer min-w-0 hover-elevate rounded px-1 -mx-1"
                            onClick={() => {
                              onAreaClick?.(area.id);
                              if (area.geometry) onZoomToGeometry?.(area.geometry);
                            }}
                            data-testid={`button-zoom-area-${area.id}`}
                          >
                            <p className="font-medium text-sm truncate">{area.name}</p>
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs text-muted-foreground">
                                {new Date(area.created_at).toLocaleDateString()}
                              </p>
                              {area.is_primary && (
                                <Badge variant="secondary" className="text-xs gap-1">
                                  <Crown className="w-3 h-3" />
                                  Primary
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          {canEdit && area.geometry && (
                            <Button
                              onClick={() => setPrimaryAreaMutation.mutate({ area_id: area.id, geometry: area.geometry })}
                              variant="ghost"
                              size="icon"
                              disabled={setPrimaryAreaMutation.isPending || area.is_primary}
                              title={area.is_primary ? "This is the primary area" : "Set as primary area"}
                              data-testid={`button-set-primary-${area.id}`}
                            >
                              <Crown className={`w-3 h-3 ${area.is_primary ? 'text-yellow-500' : ''}`} />
                            </Button>
                          )}
                          <Button
                            onClick={() => toggleChurchAreaVisibility(church.id, area.id)}
                            variant="ghost"
                            size="icon"
                            data-testid={`button-toggle-visibility-${area.id}`}
                          >
                            {isVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          </Button>
                          {canEdit && (
                            <>
                              <Button
                                onClick={() => onDrawAreaClick(church.id, false, undefined, area)}
                                variant="ghost"
                                size="icon"
                                data-testid={`button-edit-area-${area.id}`}
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button
                                onClick={() => deleteAreaMutation.mutate(area.id)}
                                variant="ghost"
                                size="icon"
                                data-testid={`button-delete-area-${area.id}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {!church.primary_ministry_area && !churchAreas.length && !canEdit && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No ministry areas defined
                </p>
              )}

              {isDrawingArea ? (
                <Button
                  onClick={() => onCancelDrawing?.()}
                  variant="outline"
                  className="w-full border-destructive text-destructive"
                  data-testid="button-cancel-draw-area"
                >
                  Cancel Drawing
                </Button>
              ) : canEdit && (
                <Button
                  onClick={() => onDrawAreaClick(church.id, !church.primary_ministry_area && churchAreas.length === 0)}
                  variant="outline"
                  className="w-full"
                  data-testid="button-draw-new-area"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Draw Ministry Area
                </Button>
              )}
            </div>

            <PrayerFocusAreaCard
              church={church}
              canEdit={canEdit}
              onOpenBudgetWizard={onOpenBudgetWizard}
              onEnterAllocationMode={onEnterAllocationMode}
              onViewPrayerCoverage={onViewPrayerCoverage}
            />

            <MinistryCapacityCard
              church={church}
              canEdit={canEdit}
            />

            <MinistryAllocationSliders
              church={church}
              canEdit={canEdit}
              onAllocationPreview={onAllocationPreview}
            />

            {/* Places (Geographic Boundaries) Section */}
            <div className="space-y-3 pt-2 mt-4 border-t">
              <div>
                <h3 className="text-sm font-semibold">Places</h3>
                <p className="text-xs text-muted-foreground">
                  Geographic boundaries (cities, neighborhoods, etc.) your church serves
                </p>
              </div>

              {canEdit && (
                <BoundarySearch
                  onSelect={(boundary) => attachBoundaryMutation.mutate(boundary)}
                  onHover={onHoverBoundary}
                />
              )}

              {church.boundaries && church.boundaries.length > 0 && (
                <div className="space-y-2">
                  {church.boundaries.map((boundary) => (
                    <div
                      key={boundary.id}
                      className="p-3 border rounded-md flex items-center justify-between"
                      onMouseEnter={() => onHoverBoundary?.(boundary)}
                      onMouseLeave={() => onHoverBoundary?.(null)}
                      data-testid={`boundary-item-${boundary.id}`}
                    >
                      <div 
                        className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer hover-elevate rounded px-1 -mx-1"
                        onClick={() => boundary.geometry && onZoomToGeometry?.(boundary.geometry)}
                        data-testid={`button-zoom-boundary-${boundary.id}`}
                      >
                        <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{boundary.name}</div>
                          <Badge variant="outline" className="mt-1">
                            {boundary.type}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleBoundaryVisibility(church.id, boundary.id)}
                          data-testid={`button-toggle-boundary-${boundary.id}`}
                        >
                          {visibleBoundaryIds.has(boundary.id) ? (
                            <Eye className="h-4 w-4" />
                          ) : (
                            <EyeOff className="h-4 w-4" />
                          )}
                        </Button>
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setRemovingBoundaryId(boundary.id);
                              removeBoundaryMutation.mutate(boundary.id);
                            }}
                            disabled={removingBoundaryId === boundary.id}
                            data-testid={`button-remove-boundary-${boundary.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(!church.boundaries || church.boundaries.length === 0) && (
                <div className="text-center py-6 border border-dashed rounded-md">
                  <p className="text-sm text-muted-foreground">
                    No places attached yet. Search above to add one.
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="collaborations" className="m-0 p-0">
            <ChurchCollaborationsSection
              churchId={church.id}
              churchName={church.name}
              hasMinistryArea={!!church.primary_ministry_area}
              collaborationHave={church.collaboration_have || []}
              collaborationNeed={church.collaboration_need || []}
              onNavigateToMinistryAreas={() => {
                // Navigate to Ministry Areas tab
                if (onSubTabChange) {
                  onSubTabChange("areas");
                } else {
                  setInternalActiveTab("areas");
                }
              }}
            />
          </TabsContent>

          <TabsContent value="pray" className="m-0 p-4 space-y-4">
            <ChurchPrayerList church={church} />
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

// Prayer list component for church prayers tab
function ChurchPrayerList({ church }: { church: ChurchWithCallings }) {
  const churchId = church.id;
  const { toast } = useToast();
  const { user } = useAuth();
  const { platform } = useSafePlatformContext();
  const [prayingFor, setPrayingFor] = useState<string | null>(null);
  const [prayedIds, setPrayedIds] = useState<Set<string>>(new Set());
  const [namePromptOpen, setNamePromptOpen] = useState(false);
  const [pendingPrayerId, setPendingPrayerId] = useState<string | null>(null);
  const [pendingPrayerTitle, setPendingPrayerTitle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [encouragement, setEncouragement] = useState("");
  const [isSubmittingEncouragement, setIsSubmittingEncouragement] = useState(false);
  const [postedResponse, setPostedResponse] = useState<{ postId: string } | null>(null);
  
  // Submit prayer request dialog state
  const [showSubmitPrayerDialog, setShowSubmitPrayerDialog] = useState(false);
  
  // Guest prayer modal state
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [pendingGuestPrayer, setPendingGuestPrayer] = useState<{
    prayerId: string;
    prayerTitle: string;
  } | null>(null);

  const { data, isLoading, error } = useQuery<{
    approved: Array<{
      id: string;
      title: string;
      body: string;
      is_anonymous: boolean;
      created_at: string;
    }>;
    pending_count: number;
    is_admin: boolean;
  }>({
    queryKey: [`/api/churches/${churchId}/prayers`],
  });

  const postPrayerResponse = useMutation({
    mutationFn: async (data: { 
      commentType: 'prayer_tap' | 'encouragement'; 
      body: string; 
      displayName?: string; 
      prayerId?: string;
    }) => {
      const response = await apiRequest("POST", `/api/churches/${churchId}/prayer-post`, data);
      return response;
    },
    onSuccess: (data) => {
      if (data.posted) {
        setPostedResponse({ postId: data.postId });
        queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      }
    },
  });

  const handlePrayerTap = async (prayerId: string, prayerTitle: string, guestName?: string) => {
    console.log('[ChurchPrayerList] handlePrayerTap called:', { prayerId, prayerTitle, alreadyPrayed: prayedIds.has(prayerId), isPraying: !!prayingFor, guestName });
    
    if (prayingFor || prayedIds.has(prayerId)) return;
    
    setPrayingFor(prayerId);
    
    try {
      const payload: any = { prayer_id: prayerId };
      if (guestName) {
        payload.guest_name = guestName;
      }
      
      console.log('[ChurchPrayerList] Calling /api/prayers/pray with:', payload);
      await apiRequest("POST", "/api/prayers/pray", payload);
      setPrayedIds(prev => new Set(Array.from(prev).concat(prayerId)));
      
      // For logged-in users, auto-post using their profile name
      if (user) {
        try {
          const userName = user.user_metadata?.full_name || user.user_metadata?.first_name || user.email?.split('@')[0] || 'Someone';
          await postPrayerResponse.mutateAsync({
            commentType: 'prayer_tap',
            body: `Prayed for: "${prayerTitle}"`,
            displayName: userName,
            prayerId: prayerId,
          });
          toast({
            title: "Prayer Shared",
            description: "Your prayer has been added to the community feed.",
          });
        } catch (postError) {
          // Prayer was recorded but community post failed - that's okay
          toast({
            title: "Prayer Recorded",
            description: "Your prayer has been counted.",
          });
        }
      } else if (guestName) {
        // Guest with name provided - success is handled by the modal
      } else {
        // For anonymous users, show name prompt for optional community posting
        setPendingPrayerId(prayerId);
        setPendingPrayerTitle(prayerTitle);
        setNamePromptOpen(true);
      }
    } catch (error: any) {
      console.error('[ChurchPrayerList] Prayer tap failed:', {
        prayerId,
        prayerTitle,
        error: error.message,
        fullError: error
      });
      
      // Check if guest needs to provide name
      if (error.message?.includes('400') || error.message?.includes('Guest name required')) {
        setPendingGuestPrayer({ prayerId, prayerTitle });
        setShowGuestModal(true);
        setPrayingFor(null);
        return;
      }
      
      // Handle rate limit silently - prayer was already counted
      if (error.message?.includes('429')) {
        // Silent - no toast needed
      } else if (error.message?.includes('409')) {
        // Already prayed - just mark as prayed locally
        setPrayedIds(prev => new Set(Array.from(prev).concat(prayerId)));
        toast({
          title: "Prayer Recorded",
          description: "You've already prayed for this request.",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to record prayer. Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setPrayingFor(null);
    }
  };
  
  const handleGuestPrayerSubmit = async (guestName: string, _fullName: string) => {
    if (!pendingGuestPrayer) return;
    await handlePrayerTap(pendingGuestPrayer.prayerId, pendingGuestPrayer.prayerTitle, guestName);
  };

  const handleNameSubmit = async () => {
    const name = displayName.trim();
    if (!name) {
      setNamePromptOpen(false);
      setPendingPrayerId(null);
      setDisplayName("");
      toast({
        title: "Prayer Recorded",
        description: "Your prayer has been counted privately.",
      });
      return;
    }

    try {
      await postPrayerResponse.mutateAsync({
        commentType: 'prayer_tap',
        body: `Prayed for: "${pendingPrayerTitle}"`,
        displayName: name,
        prayerId: pendingPrayerId || undefined,
      });
      
      toast({
        title: "Prayer Shared",
        description: "Your prayer has been added to the community feed.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to share prayer. Your prayer was still counted.",
        variant: "destructive",
      });
    } finally {
      setNamePromptOpen(false);
      setPendingPrayerId(null);
      setDisplayName("");
    }
  };

  const handleEncouragementSubmit = async () => {
    if (!encouragement.trim()) return;
    
    if (!user) {
      toast({
        title: "Login Required",
        description: "Please log in to share encouragements.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmittingEncouragement(true);
    
    try {
      await postPrayerResponse.mutateAsync({
        commentType: 'encouragement',
        body: encouragement.trim(),
      });
      
      toast({
        title: "Encouragement Shared",
        description: "Your encouragement has been added to the community feed.",
      });
      setEncouragement("");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to share encouragement. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingEncouragement(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="p-4 border rounded-md animate-pulse">
            <div className="h-4 bg-muted rounded w-3/4 mb-2" />
            <div className="h-3 bg-muted rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">
          Unable to load prayer requests.
        </p>
      </div>
    );
  }

  const prayers = data?.approved || [];

  return (
    <div className="space-y-4">
      {/* Posted response notification */}
      {postedResponse && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-md flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 text-sm">
            <Check className="w-4 h-4" />
            <span>Posted to community</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.href = `/community?post=${postedResponse.postId}`}
            className="text-emerald-700 dark:text-emerald-300 hover:text-emerald-800 dark:hover:text-emerald-200 text-xs gap-1"
            data-testid="button-view-in-community"
          >
            <ExternalLink className="w-3 h-3" />
            View
          </Button>
        </div>
      )}

      {/* Prayer list header with submit button */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Prayer Requests</h4>
          {prayers.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {prayers.length} {prayers.length === 1 ? 'request' : 'requests'}
            </Badge>
          )}
        </div>
        
        {/* Submit Prayer Request CTA */}
        <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-2">
          <div className="flex items-start gap-2">
            <Heart className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Need prayer?</p>
              <p className="text-xs text-muted-foreground">
                Submit a prayer request for the community to pray for you.
              </p>
            </div>
          </div>
          <Button
            variant="default"
            size="sm"
            className="w-full gap-2"
            onClick={() => setShowSubmitPrayerDialog(true)}
            data-testid="button-submit-prayer-request-panel"
          >
            <Plus className="w-4 h-4" />
            Submit Prayer Request
          </Button>
        </div>
      </div>
      
      {/* Submit Prayer Dialog */}
      <SubmitPrayerDialog
        open={showSubmitPrayerDialog}
        onOpenChange={setShowSubmitPrayerDialog}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: [`/api/churches/${churchId}/prayers`] });
        }}
        cityPlatformId={platform?.id}
        defaultChurch={church}
      />

      {prayers.length === 0 ? (
        <div className="text-center py-6 space-y-3">
          <Hand className="w-10 h-10 mx-auto text-muted-foreground/50" />
          <div>
            <p className="text-sm font-medium">No prayer requests yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Share an encouragement below!
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {prayers.map((prayer) => {
            const hasPrayed = prayedIds.has(prayer.id);
            const isPraying = prayingFor === prayer.id;
            
            return (
              <div 
                key={prayer.id} 
                className={`p-3 border rounded-md space-y-2 transition-colors ${
                  hasPrayed ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' : ''
                }`}
                data-testid={`prayer-card-${prayer.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h5 className="font-medium text-sm">{prayer.title}</h5>
                    {prayer.body && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {prayer.body}
                      </p>
                    )}
                  </div>
                  <Button
                    variant={hasPrayed ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePrayerTap(prayer.id, prayer.title)}
                    disabled={hasPrayed || isPraying}
                    className={`flex-shrink-0 gap-1 ${
                      hasPrayed ? 'bg-amber-500 hover:bg-amber-500 text-white' : ''
                    }`}
                    data-testid={`button-pray-${prayer.id}`}
                  >
                    {isPraying ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Hand className={`w-3 h-3 ${hasPrayed ? 'fill-current' : ''}`} />
                    )}
                    {hasPrayed ? 'Prayed' : 'Pray'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Encouragement input section */}
      <div className="pt-3 border-t space-y-2">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Share an encouragement</span>
        </div>
        <div className="flex gap-2">
          <Textarea
            value={encouragement}
            onChange={(e) => setEncouragement(e.target.value)}
            placeholder={user ? "Write a prayer or encouragement for this church..." : "Log in to share encouragements"}
            disabled={!user || isSubmittingEncouragement}
            className="flex-1 min-h-[60px] max-h-[100px] resize-none text-sm"
            data-testid="input-encouragement-sidebar"
          />
          <Button
            onClick={handleEncouragementSubmit}
            disabled={!encouragement.trim() || !user || isSubmittingEncouragement}
            size="icon"
            className="self-end"
            data-testid="button-submit-encouragement-sidebar"
          >
            {isSubmittingEncouragement ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        {!user && (
          <p className="text-xs text-muted-foreground">
            <a href="/login" className="text-primary hover:underline">Log in</a> to share encouragements
          </p>
        )}
      </div>

      {/* Name prompt dialog */}
      <Dialog open={namePromptOpen} onOpenChange={setNamePromptOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Share with Community?</DialogTitle>
            <DialogDescription>
              Enter your name to share this prayer in the community feed. Leave blank to pray privately.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your first name (optional)"
            autoFocus
            data-testid="input-display-name-sidebar"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleNameSubmit();
              }
            }}
          />
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setNamePromptOpen(false);
                setPendingPrayerId(null);
                setDisplayName("");
                toast({
                  title: "Prayer Recorded",
                  description: "Your prayer has been counted privately.",
                });
              }}
              data-testid="button-pray-privately-sidebar"
            >
              Pray Privately
            </Button>
            <Button
              onClick={handleNameSubmit}
              disabled={postPrayerResponse.isPending}
              data-testid="button-share-prayer-sidebar"
            >
              {postPrayerResponse.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Share
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <GuestPrayerModal
        open={showGuestModal}
        onClose={() => {
          setShowGuestModal(false);
          setPendingGuestPrayer(null);
        }}
        onSubmit={handleGuestPrayerSubmit}
        prayerTitle={pendingGuestPrayer?.prayerTitle}
      />
    </div>
  );
}
