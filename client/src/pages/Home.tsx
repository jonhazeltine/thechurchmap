import { useState, useRef, useEffect, useMemo, useCallback, lazy, Suspense } from "react";
import { useQuery, useMutation, keepPreviousData } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import bbox from "@turf/bbox";
import { polygon, point, multiPolygon as turfMultiPolygon } from "@turf/helpers";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import distance from "@turf/distance";
import { Header } from "@/components/Header";
import { MapView, type MapViewRef, type InternalTagStyle, type CollaborationLine } from "@/components/MapView";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { usePlatformContext, buildPlatformQueryParams } from "@/contexts/PlatformContext";
import { FilterSidebar } from "@/components/FilterSidebar";
import { ChurchCard } from "@/components/ChurchCard";
import { ChurchDetail } from "@/components/ChurchDetail";
import { EmptyState } from "@/components/EmptyState";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/AuthContext";
import {
  type ChurchWithCallings,
  type Calling,
  type ChurchFilters,
  type InsertChurch,
  type Area,
  type MinistryAreaWithCalling,
  type Boundary,
  HEALTH_METRIC_KEYS,
} from "@shared/schema";
import { MinistryAreasPanel } from "@/components/MinistryAreasPanel";
import { PrayerModeOverlay } from "@/components/PrayerModeOverlay";
import { ChurchPrayerDialog } from "@/components/ChurchPrayerDialog";
import { ViewsSidebar } from "@/components/ViewsSidebar";
import { AreaIntelligencePopup } from "@/components/AreaIntelligencePopup";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Trash2, Filter, Layers, LogIn, UserPlus, Building2, Map, Globe, RotateCcw, MapPin, Check, Church } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";
import type { VisiblePrayer } from "@shared/schema";
import { WelcomeTour, useShouldShowTour } from "@/components/WelcomeTour";

const ChurchOnboardingModal = lazy(() => import("@/components/ChurchOnboardingModal").then(m => ({ default: m.ChurchOnboardingModal })));
const PrayerBudgetWizard = lazy(() => import("@/components/PrayerBudgetWizard").then(m => ({ default: m.PrayerBudgetWizard })));
const TractAllocationPopover = lazy(() => import("@/components/TractAllocationPopover").then(m => ({ default: m.TractAllocationPopover })));
const AllocationModeOverlay = lazy(() => import("@/components/AllocationModeOverlay").then(m => ({ default: m.AllocationModeOverlay })));

// Stable empty array to prevent unnecessary re-renders
const EMPTY_ARRAY: any[] = [];

// Stable empty Set to prevent unnecessary re-renders from reference inequality
const EMPTY_SET = new Set<string>();

// Helper functions to detect LDS/Mormon and Jehovah's Witness churches
// These are used to filter churches based on platform settings
function isLdsChurch(church: { name?: string | null; denomination?: string | null }): boolean {
  const name = (church.name || '').toLowerCase();
  const denomination = (church.denomination || '').toLowerCase();
  const combined = `${name} ${denomination}`;
  
  return (
    combined.includes('latter-day') ||
    combined.includes('latter day') ||
    combined.includes('lds') ||
    combined.includes('mormon') ||
    combined.includes('church of jesus christ of latter')
  );
}

function isJwChurch(church: { name?: string | null; denomination?: string | null }): boolean {
  const name = (church.name || '').toLowerCase();
  const denomination = (church.denomination || '').toLowerCase();
  const combined = `${name} ${denomination}`;
  
  return (
    combined.includes('jehovah') ||
    combined.includes('kingdom hall') ||
    combined.includes('watchtower')
  );
}

// Viewport persistence keys - separate for national vs platform views
const VIEWPORT_STORAGE_KEY_NATIONAL = 'kingdom-map-viewport-national';
const VIEWPORT_STORAGE_KEY_PLATFORM = 'kingdom-map-viewport-platform';

interface SavedViewport {
  center: { lat: number; lng: number };
  zoom: number;
  platformId?: string | null;
}

export default function Home() {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const shouldShowTour = useShouldShowTour();
  const { isPlatformAdmin, isSuperAdmin } = useAdminAccess();
  const isAdmin = isPlatformAdmin || isSuperAdmin;
  
  // Use wouter's location hook to trigger re-renders on URL changes
  // This is essential for region filtering when user selects from dropdown
  const [location, setLocation] = useLocation();
  
  // Platform context for multi-tenant filtering (Phase 5C)
  const { platformId, platform, hasPlatformContext, setPlatformId } = usePlatformContext();
  
  // Check URL parameters for prayer mode activation and panel state
  const urlParams = new URLSearchParams(window.location.search);
  const prayerModeFromUrl = urlParams.get('prayerMode') === 'true' || location.endsWith('/prayer');
  const panelFromUrl = urlParams.get('panel');
  
  // Determine initial sidebar state: URL param takes precedence, default closed
  const initialRightSidebarOpen = panelFromUrl === 'closed' ? false : 
                                   panelFromUrl === 'open' ? true : 
                                   false;
  
  const [filters, setFilters] = useState<ChurchFilters>({});
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(initialRightSidebarOpen);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  
  // Mobile-only mutual exclusivity: opening one panel closes the other
  const openLeftSidebar = () => {
    if (isMobile) {
      setRightSidebarOpen(false);
    }
    setLeftSidebarOpen(true);
  };
  
  const openRightSidebar = () => {
    if (isMobile) {
      setLeftSidebarOpen(false);
    }
    setRightSidebarOpen(true);
  };
  const [addChurchOpen, setAddChurchOpen] = useState(false);
  const [selectedChurch, setSelectedChurch] = useState<ChurchWithCallings | null>(null);
  const [drawingArea, setDrawingArea] = useState(false);
  const [drawingChurchId, setDrawingChurchId] = useState<string | null>(null);
  const [drawingCallingId, setDrawingCallingId] = useState<string | null>(null);
  const [drawingPrimaryArea, setDrawingPrimaryArea] = useState(false);
  const [newAreaCoordinates, setNewAreaCoordinates] = useState<[number, number][][]>([]);
  const [newAreaDialogOpen, setNewAreaDialogOpen] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [newAreaType, setNewAreaType] = useState<'custom' | 'church'>('custom');
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'areas'>('details');
  const [highlightedAreaId, setHighlightedAreaId] = useState<string | null>(null);
  const [hoveredAreaId, setHoveredAreaId] = useState<string | null>(null);
  const [churchDetailSubTab, setChurchDetailSubTab] = useState<string>('details');
  const [editingArea, setEditingArea] = useState<Area | null>(null);
  const [editAreaName, setEditAreaName] = useState("");
  const [editingGeometry, setEditingGeometry] = useState(false);
  const [editAreaCoordinates, setEditAreaCoordinates] = useState<[number, number][][]>([]);
  const [showAllAreas, setShowAllAreas] = useState(false);
  const [ministryAreasVisible, setMinistryAreasVisible] = useState(true);
  const [mapOverlayMode, setMapOverlayMode] = useState<'saturation' | 'boundaries' | 'off'>('saturation');
  const ministrySaturationVisible = mapOverlayMode === 'saturation';
  const showBoundariesMode = mapOverlayMode === 'boundaries';
  const [saturationTooltipVisible, setSaturationTooltipVisible] = useState(false);
  const [pinMode, setPinMode] = useState<'all' | 'mapped' | 'hidden'>('all');
  const [hoverBoundary, setHoverBoundary] = useState<Boundary | null>(null);
  const [mapBounds, setMapBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null);
  const [ministryCallingTypeFilters, setMinistryCallingTypeFilters] = useState<Set<string>>(new Set());
  const [prayerOverlayVisible, setPrayerOverlayVisible] = useState(prayerModeFromUrl);
  
  // Prayer Mode V2 state
  const [prayerMapZoom, setPrayerMapZoom] = useState<number>(12);
  const [prayerMapBbox, setPrayerMapBbox] = useState<string | null>(null);
  const [prayerMapCenter, setPrayerMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [lastPrayerUpdate, setLastPrayerUpdate] = useState<number>(Date.now());
  
  // Dual-context visibility architecture
  const [visibleGlobalAreaIds, setVisibleGlobalAreaIds] = useState<Set<string>>(new Set());
  const [visibleChurchAreaIdsByChurch, setVisibleChurchAreaIdsByChurch] = useState<Record<string, Set<string>>>({});
  
  // Health data overlay state
  const [leftSidebarTab, setLeftSidebarTab] = useState<'filters' | 'views'>('filters');
  const [selectedHealthMetric, setSelectedHealthMetric] = useState<string | null>(null);
  const [healthOverlayVisible, setHealthOverlayVisible] = useState(true);
  const [prayerCoverageVisible, setPrayerCoverageVisible] = useState(false);
  const [prayerCoverageMode, setPrayerCoverageMode] = useState<"citywide" | "myChurch">("citywide");
  const [allocationModeActive, setAllocationModeActive] = useState(false);
  const [allocationModeChurchId, setAllocationModeChurchId] = useState<string | null>(null);
  const [allocationIncrement, setAllocationIncrement] = useState(10);
  const [budgetWizardOpen, setBudgetWizardOpen] = useState(false);
  const [tractPopover, setTractPopover] = useState<{
    tractGeoid: string;
    tractLabel: string;
    population: number;
    point: { x: number; y: number };
  } | null>(null);
  const [allocationPreview, setAllocationPreview] = useState<Record<string, number> | null>(null);
  const [seenGlobalAreaIds, setSeenGlobalAreaIds] = useState<Set<string>>(new Set());
  const [seenChurchAreaIdsByChurch, setSeenChurchAreaIdsByChurch] = useState<Record<string, Set<string>>>({});
  
  const churchPinsVisible = pinMode !== 'hidden';
  const hideChurchesWithoutMaps = pinMode === 'mapped';

  // Performance mode for low-power devices (clusters pins instead of individual markers)
  const [performanceMode, setPerformanceMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('performanceMode');
    return saved === 'true';
  });
  
  // Persist performance mode to localStorage
  const handlePerformanceModeChange = (enabled: boolean) => {
    setPerformanceMode(enabled);
    if (typeof window !== 'undefined') {
      localStorage.setItem('performanceMode', String(enabled));
    }
  };
  
  const enterAllocationModeRef = useRef<(churchId: string) => void>(() => {});
  const enterAllocationMode = useCallback((churchId: string) => {
    enterAllocationModeRef.current(churchId);
  }, []);

  const exitAllocationMode = useCallback(() => {
    setAllocationModeActive(false);
    setAllocationModeChurchId(null);
  }, []);

  const allocationFlyDoneRef = useRef<string | null>(null);

  // Health data loading toast handler
  const healthLoadingToastDismissRef = useRef<(() => void) | null>(null);
  const healthLoadingMetricRef = useRef<string | null>(null);
  const handleHealthDataLoadingChange = useCallback((loading: boolean, metricKey?: string) => {
    if (loading && metricKey) {
      // Dismiss any existing loading toast first
      if (healthLoadingToastDismissRef.current) {
        healthLoadingToastDismissRef.current();
      }
      
      // Track which metric is loading
      healthLoadingMetricRef.current = metricKey;
      
      const metricName = HEALTH_METRIC_KEYS[metricKey]?.display || metricKey;
      const { dismiss } = toast({
        title: "Loading data overlay...",
        description: `Fetching ${metricName} data for your area`,
        duration: 60000, // 60 seconds max (long timeout since data can be slow)
      });
      healthLoadingToastDismissRef.current = dismiss;
    } else if (!loading && metricKey) {
      // Only dismiss if this matches the current loading metric (prevents stale callbacks)
      if (healthLoadingMetricRef.current === metricKey && healthLoadingToastDismissRef.current) {
        healthLoadingToastDismissRef.current();
        healthLoadingToastDismissRef.current = null;
        healthLoadingMetricRef.current = null;
        
        // Show brief success toast
        toast({
          title: "Data loaded",
          description: "The overlay is now visible on the map",
          duration: 2000,
        });
      }
    }
  }, [toast]);
  
  // Boundary visibility state (similar to areas)
  const [visibleBoundaryIdsByChurch, setVisibleBoundaryIdsByChurch] = useState<Record<string, Set<string>>>({});
  const [seenBoundaryIdsByChurch, setSeenBoundaryIdsByChurch] = useState<Record<string, Set<string>>>({});
  
  // Primary ministry area visibility state (per church)
  const [primaryAreaVisibleByChurch, setPrimaryAreaVisibleByChurch] = useState<Record<string, boolean>>({});
  
  // Area Intelligence popup state
  const [showAreaIntelligencePopup, setShowAreaIntelligencePopup] = useState(false);
  const [areaIntelligenceChurchId, setAreaIntelligenceChurchId] = useState<string | null>(null);
  const [areaIntelligenceChurchName, setAreaIntelligenceChurchName] = useState<string>("");
  
  // Pin adjustment state
  const [pinAdjustMode, setPinAdjustMode] = useState(false);
  const [pendingPinPosition, setPendingPinPosition] = useState<{ lat: number; lng: number } | null>(null);
  
  // Church Prayer Dialog state (Prayer Mode focus)
  const [focusedPrayerChurchId, setFocusedPrayerChurchId] = useState<string | null>(null);
  const [focusedPrayerChurchName, setFocusedPrayerChurchName] = useState<string>("");

  // Map click prayer location state
  const [mapClickPrayerLocation, setMapClickPrayerLocation] = useState<{
    lng: number;
    lat: number;
    label: string;
    tractId?: string;
    screenPosition: { x: number; y: number };
  } | null>(null);
  
  // National View platform overlay state (when platformId is null)
  const [showPlatformBoundaries, setShowPlatformBoundaries] = useState(false);
  const [showPlatformLabels, setShowPlatformLabels] = useState(false);
  const platformLayersAddedRef = useRef(false);
  
  // Region highlighting state (for navigating from PlatformDetail)
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
  const [highlightedRegion, setHighlightedRegion] = useState<{
    id: string;
    name: string;
    color: string;
    boundaries: Array<{ id: string; geometry: any; name: string }>;
  } | null>(null);
  // Store region boundary IDs for filtering churches when a region is active
  const [activeRegionBoundaryIds, setActiveRegionBoundaryIds] = useState<string[]>([]);
  
  // Use ref to avoid stale closure in event handlers
  const drawingAreaRef = useRef(drawingArea);
  const drawingPrimaryAreaRef = useRef(drawingPrimaryArea);
  const drawingChurchIdRef = useRef(drawingChurchId);
  const editingGeometryRef = useRef(editingGeometry);
  const editingAreaRef = useRef(editingArea);
  const mapRef = useRef<MapViewRef>(null);
  
  // Fetch user's claimed church for prayer coverage
  const { data: myChurches } = useQuery<Array<{ id: string; name: string; platform?: { id: string; name: string; slug: string } | null }>>({
    queryKey: ["/api/admin/my-churches"],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  
  const { data: onboardingStatus } = useQuery<{
    church_id: string | null;
    church: { id: string; name: string } | null;
    platform: { id: string; name: string; slug: string } | null;
  }>({
    queryKey: ['/api/onboarding/status'],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  
  const userChurchId = myChurches?.[0]?.id ?? onboardingStatus?.church_id ?? undefined;
  const userChurchPlatform = myChurches?.[0]?.platform ?? onboardingStatus?.platform ?? null;
  const coverageChurchId = allocationModeActive && allocationModeChurchId ? allocationModeChurchId : userChurchId;

  const ensureChurchPlatform = useCallback(() => {
    if (userChurchPlatform && (!hasPlatformContext || platformId !== userChurchPlatform.id)) {
      setPlatformId(userChurchPlatform.id, userChurchPlatform.slug);
    }
  }, [userChurchPlatform, hasPlatformContext, platformId, setPlatformId]);

  useEffect(() => {
    enterAllocationModeRef.current = (churchId: string) => {
      ensureChurchPlatform();
      setAllocationModeActive(true);
      setAllocationModeChurchId(churchId);
      setPrayerCoverageVisible(true);
      setPrayerCoverageMode("citywide");
      setPrayerOverlayVisible(false);
      setDrawingArea(false);
      setHighlightedAreaId(null);
      setPrimaryAreaVisibleByChurch(prev => ({ ...prev, [churchId]: false }));
      setChurchDetailSubTab('areas');
    };
  }, [ensureChurchPlatform]);

  // Fetch prayer coverage data when coverage is visible
  const { data: prayerCoverageData } = useQuery<{
    tracts: Array<{ tract_geoid: string; total_allocation_pct: number; effective_allocation_pct?: number; church_count: number; population: number; avg_engagement_score?: number; coverage_pct?: number }>;
  }>({
    queryKey: ["/api/prayer-coverage", prayerCoverageMode, prayerCoverageMode === "myChurch" ? coverageChurchId : platform?.id, mapBounds],
    queryFn: async () => {
      if (prayerCoverageMode === "myChurch" && coverageChurchId) {
        const res = await fetch(`/api/prayer-coverage/church/${coverageChurchId}`);
        if (!res.ok) return { tracts: [] };
        const data = await res.json();
        return {
          tracts: (data.allocations || []).map((a: any) => ({
            tract_geoid: a.tract_geoid,
            total_allocation_pct: a.allocation_pct,
            effective_allocation_pct: a.allocation_pct,
            church_count: 1,
            population: a.population ?? 0,
            coverage_pct: a.coverage_pct ?? 0,
          })),
        };
      }
      if (prayerCoverageMode === "citywide" && platform?.id && mapBounds) {
        const bbox = `${mapBounds.west},${mapBounds.south},${mapBounds.east},${mapBounds.north}`;
        const res = await fetch(`/api/prayer-coverage/city?city_platform_id=${platform.id}&bbox=${bbox}`);
        if (!res.ok) return { tracts: [] };
        return res.json();
      }
      return { tracts: [] };
    },
    enabled: prayerCoverageVisible && (
      (prayerCoverageMode === "myChurch" && !!coverageChurchId) ||
      (prayerCoverageMode === "citywide" && !!platform?.id && !!mapBounds)
    ),
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  });

  const { data: clippedSaturationGeoJSON } = useQuery<{
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      geometry: any;
      properties: {
        tract_geoid: string;
        area_id: string;
        saturation: number;
        raw_saturation: number;
        overlap_fraction: number;
        church_count: number;
        population: number;
        piece_population: number;
        pop_density: number;
        has_capacity: boolean;
        area_name: string;
        church_name: string;
      };
    }>;
  }>({
    queryKey: ["/api/ministry-saturation/clipped", mapBounds, platform?.id],
    queryFn: async () => {
      if (!mapBounds) return { type: 'FeatureCollection' as const, features: [] };
      const bbox = `${mapBounds.west},${mapBounds.south},${mapBounds.east},${mapBounds.north}`;
      const platformParam = platform?.id ? `&platform_id=${platform.id}` : '';
      const res = await fetch(`/api/ministry-saturation/clipped?bbox=${bbox}${platformParam}`);
      if (!res.ok) return { type: 'FeatureCollection' as const, features: [] };
      return res.json();
    },
    enabled: ministrySaturationVisible && !!mapBounds,
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  });

  const effectiveSaturationGeoJSON = useMemo(() => {
    if (!allocationPreview || !clippedSaturationGeoJSON) return clippedSaturationGeoJSON;
    return {
      ...clippedSaturationGeoJSON,
      features: clippedSaturationGeoJSON.features.map(f => {
        const scale = allocationPreview[f.properties.area_id];
        if (scale === undefined) return f;
        return {
          ...f,
          properties: { ...f.properties, saturation: f.properties.saturation * scale }
        };
      })
    };
  }, [clippedSaturationGeoJSON, allocationPreview]);

  // Fetch church IDs that have prayer budgets (for sidebar listing)
  const { data: prayerChurchIds = [] } = useQuery<string[]>({
    queryKey: ["/api/prayer-coverage/churches"],
    queryFn: async () => {
      const res = await fetch("/api/prayer-coverage/churches");
      if (!res.ok) return [];
      const data = await res.json();
      return data.church_ids || [];
    },
    staleTime: 60 * 1000,
  });

  // Track which churches have had their visibility initialized (prevent re-seeding on toggles)
  const initializedChurchAreasRef = useRef<Set<string>>(new Set());
  const initializedChurchBoundariesRef = useRef<Set<string>>(new Set());
  const initializedGlobalAreasRef = useRef(false);
  
  // Track previous normalized prayer viewport values to prevent redundant fetches
  const prevPrayerBboxRef = useRef<string | null>(null);
  const prevPrayerZoomRef = useRef<number | null>(null);
  const prevPrayerCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  
  // Track whether prayer mode map listeners are attached (prevent duplicates)
  const prayerModeListenersAttachedRef = useRef(false);
  
  // Track if we've restored viewport from sessionStorage (prevents duplicate restoration)
  const viewportRestoredRef = useRef(false);
  // Track if map listeners for viewport persistence are attached
  const viewportListenersAttachedRef = useRef(false);
  // Track the last platform ID we flew to (to detect platform switches vs returns)
  const lastFlyToPlatformRef = useRef<string | null>(null);
  
  // Pending claim auto-submit after login
  const PENDING_CLAIM_KEY = 'pending_church_claim';
  const pendingClaimSubmittedRef = useRef(false);
  
  useEffect(() => {
    const checkAndSubmitPendingClaim = async () => {
      // Only run once per session and when user is logged in
      if (!user || pendingClaimSubmittedRef.current) return;
      
      const pendingClaimStr = sessionStorage.getItem(PENDING_CLAIM_KEY);
      if (!pendingClaimStr) return;
      
      try {
        const pendingClaim = JSON.parse(pendingClaimStr);
        
        // Validate claim is recent (within 1 hour)
        if (Date.now() - pendingClaim.savedAt > 60 * 60 * 1000) {
          sessionStorage.removeItem(PENDING_CLAIM_KEY);
          return;
        }
        
        // Mark as submitted to prevent duplicate submissions
        pendingClaimSubmittedRef.current = true;
        
        const { churchId, platformId, wizardData, churchName } = pendingClaim;
        
        // Build the claim payload (same logic as onClaimSubmit)
        const roleMap: Record<string, string> = {
          owner: "Lead Pastor / Church Owner",
          administrator: "Administrator", 
          member: "Team Member"
        };
        
        const verificationParts: string[] = [];
        verificationParts.push(`Role: ${roleMap[wizardData.roleSelection]}`);
        if (wizardData.roleNotes) {
          verificationParts.push(`Notes: ${wizardData.roleNotes}`);
        }
        if (wizardData.callingCategories.length > 0) {
          verificationParts.push(`Calling Focus: ${wizardData.callingCategories.join(', ')}`);
        }
        if (wizardData.specificCallings.length > 0) {
          verificationParts.push(`Specific Callings: ${wizardData.specificCallings.join(', ')}`);
        }
        verificationParts.push(`Facility: ${wizardData.facilityOwnership} - ${wizardData.facilityAdequacy}`);
        if (wizardData.unmetFacilityNeeds) {
          verificationParts.push(`Unmet Needs: ${wizardData.unmetFacilityNeeds}`);
        }
        const collabParts = [];
        if (wizardData.collaborationWillingness?.shareSpace) collabParts.push('Share Space (OFFER)');
        if (wizardData.collaborationWillingness?.hostPartners) collabParts.push('Host Partners (OFFER)');
        if (wizardData.collaborationWillingness?.participateInPartners) collabParts.push('Participate in Partners (NEED)');
        if (wizardData.collaborationWillingness?.seekSpace) collabParts.push('Seeking Space (NEED)');
        if (wizardData.collaborationWillingness?.openToCoLocation) collabParts.push('Open to Co-location');
        if (collabParts.length > 0) {
          verificationParts.push(`Collaboration: ${collabParts.join(', ')}`);
        }
        if (wizardData.collaborationHave && wizardData.collaborationHave.length > 0) {
          verificationParts.push(`We Offer Tags: ${wizardData.collaborationHave.join(', ')}`);
        }
        if (wizardData.collaborationNeed && wizardData.collaborationNeed.length > 0) {
          verificationParts.push(`We Need Tags: ${wizardData.collaborationNeed.join(', ')}`);
        }
        
        await apiRequest("POST", `/api/churches/${churchId}/claim`, {
          city_platform_id: platformId,
          role_at_church: roleMap[wizardData.roleSelection],
          verification_notes: verificationParts.join('\n'),
          wizard_data: JSON.stringify(wizardData),
        });
        
        // Clear the pending claim
        sessionStorage.removeItem(PENDING_CLAIM_KEY);
        
        queryClient.invalidateQueries({ queryKey: ["/api/churches", churchId, "claim"] });
        toast({
          title: "Claim Submitted",
          description: `Your claim for ${churchName} has been submitted for review.`,
        });
      } catch (error) {
        console.error('Failed to submit pending claim:', error);
        // Clear the pending claim on error to prevent infinite retry loops
        sessionStorage.removeItem(PENDING_CLAIM_KEY);
        pendingClaimSubmittedRef.current = false;
        toast({
          title: "Claim Submission Failed",
          description: "There was an error submitting your saved claim. Please try again.",
          variant: "destructive",
        });
      }
    };
    
    checkAndSubmitPendingClaim();
  }, [user, toast]);
  
  // Close right sidebar when switching to National View, open when selecting a platform
  useEffect(() => {
    if (!hasPlatformContext) {
      setRightSidebarOpen(false);
      setSelectedChurch(null);
    }
  }, [hasPlatformContext]);
  
  useEffect(() => {
    if (!selectedChurch && drawingArea) {
      setDrawingArea(false);
      setDrawingPrimaryArea(false);
      setDrawingChurchId(null);
      setDrawingCallingId(null);
      setEditingGeometry(false);
    }
  }, [selectedChurch]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawingArea) {
        setDrawingArea(false);
        setDrawingPrimaryArea(false);
        setDrawingChurchId(null);
        setDrawingCallingId(null);
        setEditingGeometry(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawingArea]);

  // Keep ref in sync with state
  useEffect(() => {
    drawingAreaRef.current = drawingArea;
  }, [drawingArea]);
  
  useEffect(() => {
    drawingPrimaryAreaRef.current = drawingPrimaryArea;
  }, [drawingPrimaryArea]);
  
  useEffect(() => {
    drawingChurchIdRef.current = drawingChurchId;
  }, [drawingChurchId]);
  
  useEffect(() => {
    editingGeometryRef.current = editingGeometry;
  }, [editingGeometry]);
  
  useEffect(() => {
    editingAreaRef.current = editingArea;
  }, [editingArea]);

  // Auto-disable tooltips during prayer allocation and map drawing modes
  const savedTooltipStateRef = useRef<boolean | null>(null);
  useEffect(() => {
    const anyModeActive = allocationModeActive || drawingArea || drawingPrimaryArea || editingGeometry;
    if (anyModeActive && savedTooltipStateRef.current === null) {
      savedTooltipStateRef.current = saturationTooltipVisible;
      setSaturationTooltipVisible(false);
    } else if (!anyModeActive && savedTooltipStateRef.current !== null) {
      setSaturationTooltipVisible(savedTooltipStateRef.current);
      savedTooltipStateRef.current = null;
    }
  }, [allocationModeActive, drawingArea, drawingPrimaryArea, editingGeometry]);
  
  // Normalize bbox coordinates to 4 decimal places (~11m precision) to prevent cache thrashing
  const normalizeBbox = (bbox: string): string => {
    const coords = bbox.split(',').map(parseFloat);
    return coords.map(c => c.toFixed(4)).join(',');
  };

  // Normalize zoom to 1 decimal place to prevent cache thrashing
  const normalizeZoom = (zoom: number): number => {
    return parseFloat(zoom.toFixed(1));
  };
  
  // Initialize bbox as soon as map is ready (polling until available)
  useEffect(() => {
    if (prayerMapBbox) return; // Already initialized
    
    // Poll every 100ms until map is ready
    const interval = setInterval(() => {
      if (prayerMapBbox) {
        clearInterval(interval);
        return;
      }
      
      const map = mapRef.current?.getMap();
      if (!map) return; // Keep polling
      
      const bounds = map.getBounds();
      if (!bounds) return; // Keep polling
      
      // Success - map is ready!
      const rawBbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
      const normalizedBbox = normalizeBbox(rawBbox);
      const normalizedZoom = normalizeZoom(map.getZoom());
      const center = map.getCenter();
      const normalizedCenter = { 
        lat: parseFloat(center.lat.toFixed(4)), 
        lng: parseFloat(center.lng.toFixed(4)) 
      };
      
      console.log('[Initial Bbox] Setting bbox on map load:', normalizedBbox, 'zoom:', normalizedZoom, 'center:', normalizedCenter);
      prevPrayerBboxRef.current = normalizedBbox;
      prevPrayerZoomRef.current = normalizedZoom;
      prevPrayerCenterRef.current = normalizedCenter;
      setPrayerMapBbox(normalizedBbox);
      setPrayerMapZoom(normalizedZoom);
      setPrayerMapCenter(normalizedCenter);
      clearInterval(interval);
    }, 100);
    
    // Cleanup after 10 seconds to avoid infinite polling
    const timeout = setTimeout(() => clearInterval(interval), 10000);
    
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [prayerMapBbox]); // Re-run if bbox becomes null (shouldn't happen, but safe)

  // Save viewport to sessionStorage for persistence across navigation
  const saveViewportToStorage = useCallback((center: { lat: number; lng: number }, zoom: number) => {
    const storageKey = platformId ? VIEWPORT_STORAGE_KEY_PLATFORM : VIEWPORT_STORAGE_KEY_NATIONAL;
    const viewport: SavedViewport = {
      center,
      zoom,
      platformId: platformId || null,
    };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(viewport));
    } catch (e) {
      // Silently fail if sessionStorage is unavailable
    }
  }, [platformId]);

  // Map viewport change handler using useCallback pattern
  const handleMoveEnd = useCallback(() => {
    if (!mapRef.current) return;
    
    const map = mapRef.current.getMap();
    if (!map) return;
    
    const bounds = map.getBounds();
    const zoom = map.getZoom();
    const center = map.getCenter();
    
    if (!bounds) return;
    
    const rawBbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
    const normalizedBbox = normalizeBbox(rawBbox);
    const normalizedZoom = normalizeZoom(zoom);
    const normalizedCenter = { 
      lat: parseFloat(center.lat.toFixed(4)), 
      lng: parseFloat(center.lng.toFixed(4)) 
    };
    
    // Save viewport to sessionStorage for navigation persistence
    saveViewportToStorage(normalizedCenter, normalizedZoom);
    
    // ONLY update if normalized values changed
    const centerChanged = !prevPrayerCenterRef.current || 
      prevPrayerCenterRef.current.lat !== normalizedCenter.lat || 
      prevPrayerCenterRef.current.lng !== normalizedCenter.lng;
    
    if (prevPrayerBboxRef.current !== normalizedBbox || prevPrayerZoomRef.current !== normalizedZoom || centerChanged) {
      prevPrayerBboxRef.current = normalizedBbox;
      prevPrayerZoomRef.current = normalizedZoom;
      prevPrayerCenterRef.current = normalizedCenter;
      setPrayerMapBbox(normalizedBbox);
      setPrayerMapZoom(normalizedZoom);
      setPrayerMapCenter(normalizedCenter);
    }
  }, [saveViewportToStorage]);

  // Attach viewport persistence listeners (separate from restoration)
  useEffect(() => {
    const attachListeners = () => {
      const map = mapRef.current?.getMap();
      if (!map) {
        setTimeout(attachListeners, 100);
        return;
      }
      
      // Attach listeners for viewport persistence (only once)
      if (!viewportListenersAttachedRef.current) {
        map.on('moveend', handleMoveEnd);
        viewportListenersAttachedRef.current = true;
      }
    };
    
    attachListeners();
    
    return () => {
      // Clean up listeners on unmount
      if (viewportListenersAttachedRef.current && mapRef.current) {
        const map = mapRef.current.getMap();
        if (map) {
          map.off('moveend', handleMoveEnd);
          viewportListenersAttachedRef.current = false;
        }
      }
    };
  }, [handleMoveEnd]);

  // Restore viewport for NATIONAL view only (platform restoration is handled in flyToPlatform)
  useEffect(() => {
    // Only handle national view restoration here
    if (platformId) return;
    if (viewportRestoredRef.current) return;
    
    // Check if URL has a platform parameter - if so, don't restore national view
    // This prevents a race condition when navigating from Platforms page via "View Map" button
    const urlParams = new URLSearchParams(window.location.search);
    const urlPlatformParam = urlParams.get('platform');
    if (urlPlatformParam) {
      console.log('[Viewport] Skipping national restore - URL has platform param:', urlPlatformParam);
      viewportRestoredRef.current = true; // Mark as handled so we don't retry
      return;
    }
    
    const restoreNationalViewport = () => {
      const map = mapRef.current?.getMap();
      if (!map) {
        setTimeout(restoreNationalViewport, 100);
        return;
      }
      
      viewportRestoredRef.current = true;
      
      try {
        const saved = sessionStorage.getItem(VIEWPORT_STORAGE_KEY_NATIONAL);
        if (saved) {
          const viewport: SavedViewport = JSON.parse(saved);
          if (!viewport.platformId && viewport.center && viewport.zoom) {
            console.log('[Viewport] Restoring national view viewport:', viewport);
            map.jumpTo({
              center: [viewport.center.lng, viewport.center.lat],
              zoom: viewport.zoom,
            });
          }
        }
      } catch (e) {
        // Silently fail
      }
    };
    
    restoreNationalViewport();
  }, [platformId]);

  // Track map viewport changes for Prayer Mode
  useEffect(() => {
    if (!prayerOverlayVisible) {
      // Clean up listeners when exiting Prayer Mode
      if (prayerModeListenersAttachedRef.current && mapRef.current) {
        const map = mapRef.current.getMap();
        if (map) {
          console.log('[Prayer Mode] Exiting - cleaning up listeners');
          map.off('moveend', handleMoveEnd);
          map.off('zoomend', handleMoveEnd);
          prayerModeListenersAttachedRef.current = false;
        }
      }
      return;
    }

    // Try to set up initial bbox and event listeners, with retry if map isn't ready
    const setupPrayerModeTracking = () => {
      if (!mapRef.current) {
        console.log('[Prayer Mode] Map ref not ready, retrying in 100ms...');
        setTimeout(setupPrayerModeTracking, 100);
        return;
      }

      const map = mapRef.current.getMap();
      if (!map) {
        console.log('[Prayer Mode] Map instance not ready, retrying in 100ms...');
        setTimeout(setupPrayerModeTracking, 100);
        return;
      }

      const bounds = map.getBounds();
      if (!bounds) {
        console.log('[Prayer Mode] Map bounds not ready, retrying in 100ms...');
        setTimeout(setupPrayerModeTracking, 100);
        return;
      }

      // Successfully got map - set initial bbox
      console.log('[Prayer Mode] Map ready, setting initial bbox');
      handleMoveEnd();

      // Set up event listeners for continuous tracking (only if not already attached)
      if (!prayerModeListenersAttachedRef.current) {
        console.log('[Prayer Mode] Attaching map event listeners');
        map.on('moveend', handleMoveEnd);
        map.on('zoomend', handleMoveEnd);
        prayerModeListenersAttachedRef.current = true;
      }
    };

    // Start setup process
    setupPrayerModeTracking();

    return () => {
      // Cleanup happens in the !prayerOverlayVisible branch above
      // This ensures we only cleanup when Prayer Mode is actually disabled
    };
  }, [prayerOverlayVisible, handleMoveEnd]);

  // Navigate to platform when platform changes - single smooth animation
  useEffect(() => {
    if (!platform) {
      // Reset the last fly-to platform when going to national view
      lastFlyToPlatformRef.current = null;
      return;
    }
    
    // Check if this is a SWITCH to a different platform or a RETURN to the same platform
    const isSwitchingPlatforms = lastFlyToPlatformRef.current !== platform.id;
    
    let cancelled = false;
    
    const handlePlatformNavigation = () => {
      if (cancelled) return;
      
      const map = mapRef.current?.getMap();
      if (!map) {
        // Retry if map isn't ready yet
        setTimeout(handlePlatformNavigation, 100);
        return;
      }
      
      if (!isSwitchingPlatforms) {
        // Returning to same platform - try to restore saved viewport
        try {
          const saved = sessionStorage.getItem(VIEWPORT_STORAGE_KEY_PLATFORM);
          if (saved) {
            const viewport: SavedViewport = JSON.parse(saved);
            if (viewport.platformId === platform.id && viewport.center && viewport.zoom) {
              console.log('[Platform] Returning to same platform - restoring viewport:', platform.id);
              map.jumpTo({
                center: [viewport.center.lng, viewport.center.lat],
                zoom: viewport.zoom,
              });
              return; // Don't fly, we restored
            }
          }
        } catch (e) {
          // Silently fail and continue with navigation
        }
      } else {
        // Switching to a NEW platform - clear saved viewport
        console.log('[Platform] Switching to new platform:', platform.id);
        try {
          sessionStorage.removeItem(VIEWPORT_STORAGE_KEY_PLATFORM);
        } catch (e) {
          // Silently fail
        }
      }
      
      // Update the last platform we flew to
      lastFlyToPlatformRef.current = platform.id;
      
      // Try using combined_geometry for bounds if available (provides better fit)
      if (platform.combined_geometry?.coordinates?.length) {
        // Calculate bounds from combined_geometry (MultiPolygon or Polygon GeoJSON)
        let minLng = Infinity, maxLng = -Infinity;
        let minLat = Infinity, maxLat = -Infinity;
        
        // Handle both Polygon and MultiPolygon geometries
        const geomType = (platform.combined_geometry as any).type;
        const coords = platform.combined_geometry.coordinates as unknown;
        
        if (geomType === 'Polygon') {
          // Polygon: coordinates is number[][][] (rings)
          for (const ring of coords as number[][][]) {
            for (const coord of ring) {
              const [lng, lat] = coord;
              if (lng < minLng) minLng = lng;
              if (lng > maxLng) maxLng = lng;
              if (lat < minLat) minLat = lat;
              if (lat > maxLat) maxLat = lat;
            }
          }
        } else {
          // MultiPolygon: coordinates is number[][][][] (polygons)
          for (const polygon of coords as number[][][][]) {
            for (const ring of polygon) {
              for (const coord of ring) {
                const [lng, lat] = coord;
                if (lng < minLng) minLng = lng;
                if (lng > maxLng) maxLng = lng;
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
              }
            }
          }
        }
        
        // Apply fitBounds if we have valid bounds
        if (minLng !== Infinity && maxLng !== -Infinity) {
          console.log('[Platform] Using combined_geometry bounds for:', platform.id);
          map.fitBounds(
            [[minLng, minLat], [maxLng, maxLat]],
            {
              padding: { top: 80, bottom: 80, left: 80, right: 80 },
              maxZoom: 14,
              duration: 1500,
            }
          );
          return;
        }
      }
      
      // Fallback: use default center/zoom (single smooth animation)
      if (platform.default_center_lat != null && platform.default_center_lng != null) {
        console.log('[Platform] Using default center/zoom for:', platform.id);
        map.flyTo({
          center: [platform.default_center_lng!, platform.default_center_lat!],
          zoom: platform.default_zoom || 9, // Use zoom 9 for a good city-level view
          duration: 1500,
        });
      }
    };
    
    handlePlatformNavigation();
    
    return () => {
      cancelled = true;
    };
  }, [platform?.id, platform?.combined_geometry]); // React to platform ID or geometry changes

  // Toggle global area visibility
  const toggleGlobalAreaVisibility = (areaId: string) => {
    setVisibleGlobalAreaIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(areaId)) {
        newSet.delete(areaId);
      } else {
        newSet.add(areaId);
      }
      return newSet;
    });
  };

  // Toggle church-specific area visibility
  const toggleChurchAreaVisibility = (churchId: string, areaId: string) => {
    setVisibleChurchAreaIdsByChurch(prev => {
      const existingSet = prev[churchId] || new Set();
      const churchSet = new Set(existingSet);
      if (churchSet.has(areaId)) {
        churchSet.delete(areaId);
      } else {
        churchSet.add(areaId);
      }
      return {
        ...prev,
        [churchId]: churchSet,
      };
    });
  };

  // Toggle church boundary visibility
  const toggleBoundaryVisibility = (churchId: string, boundaryId: string) => {
    setVisibleBoundaryIdsByChurch(prev => {
      const existingSet = prev[churchId] || new Set();
      const churchSet = new Set(existingSet);
      if (churchSet.has(boundaryId)) {
        churchSet.delete(boundaryId);
      } else {
        churchSet.add(boundaryId);
      }
      return {
        ...prev,
        [churchId]: churchSet,
      };
    });
  };

  // Toggle primary ministry area visibility
  const togglePrimaryAreaVisibility = (churchId: string) => {
    setPrimaryAreaVisibleByChurch(prev => ({
      ...prev,
      // Default to true if undefined, then invert
      [churchId]: !(prev[churchId] ?? true),
    }));
  };

  const { data: callings = [], isLoading: callingsLoading } = useQuery<Calling[]>({
    queryKey: ["/api/callings"],
    queryFn: () => fetch("/api/callings").then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }),
  });
  
  // Fetch visible prayers for Prayer Mode V2
  // Uses keepPreviousData to maintain visible prayers during map movement
  // Now respects church filters - prayers only from filtered churches
  // Phase 5C: Also respects platform context
  // IMPORTANT: Use platform?.id (resolved UUID) instead of platformId (could be slug)
  const { data: visiblePrayers = [], refetch: refetchPrayers } = useQuery<VisiblePrayer[]>({
    queryKey: ["/api/prayers/visible", prayerMapBbox, prayerMapZoom, prayerMapCenter?.lat, prayerMapCenter?.lng, lastPrayerUpdate, platform?.id],
    queryFn: () => {
      console.log('[Prayer Query] queryFn called - bbox:', prayerMapBbox, 'zoom:', prayerMapZoom, 'center:', prayerMapCenter, 'platform:', platform?.id);
      if (!prayerMapBbox || !prayerMapCenter) {
        console.log('[Prayer Query] No bbox or center, returning empty array');
        return Promise.resolve([]);
      }
      const params = buildPlatformQueryParams(platform?.id ?? null, {
        bbox: prayerMapBbox,
        zoom: String(prayerMapZoom),
        center_lat: String(prayerMapCenter.lat),
        center_lng: String(prayerMapCenter.lng),
      });
      const url = `/api/prayers/visible?${params.toString()}`;
      console.log('[Prayer Query] Fetching:', url);
      return fetch(url).then((res) => {
        console.log('[Prayer Query] Response status:', res.status);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }).then(data => {
        console.log('[Prayer Query] Received prayers:', data?.length || 0);
        return data;
      });
    },
    enabled: prayerOverlayVisible && !!prayerMapBbox && !!prayerMapCenter,
    placeholderData: keepPreviousData, // Keep old prayers visible while fetching new ones
    staleTime: 30000, // Consider data fresh for 30 seconds to reduce refetches during pan
  });

  // Fetch global areas (not bound to any church) - only when inside a platform
  // Ministry areas should NOT show in national view
  const { data: globalAreas = [] } = useQuery<Area[]>({
    queryKey: ["/api/areas", "global", platform?.id],
    enabled: !!platform?.id, // Only fetch when inside a platform
    queryFn: () => fetch("/api/areas").then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }).then(areas => areas.filter((a: Area) => !a.church_id)),
  });

  // Fetch church-specific areas when a church is selected
  // TanStack Query already handles caching - no need for additional memoization
  const { data: selectedChurchAreas = [] } = useQuery<Area[]>({
    queryKey: ["/api/areas", selectedChurch?.id ?? "none"],
    enabled: !!selectedChurch,
    queryFn: () =>
      fetch(`/api/areas?church_id=${selectedChurch!.id}`).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }),
  });


  // Fetch ALL ministry areas with calling info when in "show all" mode (Sprint 1.8)
  // IMPORTANT: Only fetch when inside a platform context using the resolved UUID (not slug)
  // Ministry areas should NOT show in national view
  const { data: allMinistryAreas = [] } = useQuery<MinistryAreaWithCalling[]>({
    queryKey: ["/api/ministry-areas", platform?.id],
    enabled: !!platform?.id,
    queryFn: () => {
      // Use platform.id (UUID) instead of platformId (which might be a slug)
      const url = `/api/ministry-areas?platform_id=${platform!.id}`;
      return fetch(url).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      });
    },
  });

  // Interface for platform map data
  interface PlatformMapData {
    id: string;
    name: string;
    slug: string;
    is_active: boolean;
    is_public: boolean;
    church_count: number;
    member_count: number;
    centroid: { type: "Point"; coordinates: [number, number] } | null;
    boundary_geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon | null; // Legacy single
    boundaries: (GeoJSON.Polygon | GeoJSON.MultiPolygon)[]; // All boundaries
  }

  // Fetch platforms for national view overlay (when no platform is selected)
  const { data: platformsMapData = [] } = useQuery<PlatformMapData[]>({
    queryKey: ["/api/platforms/map"],
    enabled: platformId === null,
    queryFn: () =>
      fetch("/api/platforms/map").then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }),
  });

  // CONUS constants for national view
  const CONUS_CENTER: [number, number] = [-98.5795, 39.8283];
  // Use lower zoom on mobile to show full continental US from coast to coast
  const CONUS_ZOOM = isMobile ? 2.5 : 3.5;

  // Handle platform click (select platform and zoom in)
  const handlePlatformClick = useCallback((clickedPlatformId: string) => {
    const clickedPlatform = platformsMapData.find(p => p.id === clickedPlatformId);
    if (clickedPlatform) {
      // Navigate to the platform map page using slug if available
      const platformSlug = clickedPlatform.slug || clickedPlatformId;
      setLocation(`/${platformSlug}/map`);
      
      const map = mapRef.current?.getMap();
      if (map) {
        // Use all boundaries to compute bounding box
        const allBoundaries = clickedPlatform.boundaries || [];
        if (allBoundaries.length > 0) {
          // Create a FeatureCollection from all boundaries and compute bbox
          const featureCollection: GeoJSON.FeatureCollection = {
            type: "FeatureCollection",
            features: allBoundaries.map(geom => ({
              type: "Feature" as const,
              properties: {},
              geometry: geom,
            })),
          };
          const bounds = bbox(featureCollection);
          map.fitBounds(
            [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
            { padding: 50, duration: 1000 }
          );
        } else if (clickedPlatform.centroid) {
          map.flyTo({
            center: clickedPlatform.centroid.coordinates,
            zoom: 10,
            duration: 1000,
          });
        }
      }
    }
  }, [platformsMapData, setLocation]);

  // Reset to CONUS view
  const handleResetToUSView = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) {
      map.flyTo({
        center: CONUS_CENTER,
        zoom: CONUS_ZOOM,
        duration: 1000,
      });
    }
  }, []);

  // Manage platform overlay layers for national view
  useEffect(() => {
    if (platformId !== null) {
      const map = mapRef.current?.getMap();
      if (map && platformLayersAddedRef.current) {
        if (map.getLayer("platforms-boundaries-fill")) {
          map.off("click", "platforms-boundaries-fill", () => {});
          map.removeLayer("platforms-boundaries-fill");
        }
        if (map.getLayer("platforms-boundaries-line")) {
          map.removeLayer("platforms-boundaries-line");
        }
        if (map.getLayer("platforms-centroids-labels")) {
          map.removeLayer("platforms-centroids-labels");
        }
        if (map.getLayer("platforms-centroids-markers")) {
          map.off("click", "platforms-centroids-markers", () => {});
          map.removeLayer("platforms-centroids-markers");
        }
        if (map.getSource("platforms-boundaries")) {
          map.removeSource("platforms-boundaries");
        }
        if (map.getSource("platforms-centroids")) {
          map.removeSource("platforms-centroids");
        }
        platformLayersAddedRef.current = false;
      }
      return;
    }

    if (!platformsMapData || platformsMapData.length === 0) return;

    const setupPlatformLayers = () => {
      const map = mapRef.current?.getMap();
      if (!map || !map.isStyleLoaded()) {
        setTimeout(setupPlatformLayers, 100);
        return;
      }

      // Flatten all boundaries from all platforms into individual features
      const boundariesFeatures = platformsMapData.flatMap((p) => {
        const allBoundaries = p.boundaries || [];
        // If no boundaries array, fall back to legacy boundary_geojson
        const geometries = allBoundaries.length > 0 
          ? allBoundaries 
          : (p.boundary_geojson ? [p.boundary_geojson] : []);
        
        console.log(`🗺️ Platform "${p.name}": rendering ${geometries.length} boundaries`);
        
        return geometries.map((geometry) => ({
          type: "Feature" as const,
          properties: { id: p.id, name: p.name, church_count: p.church_count, member_count: p.member_count },
          geometry,
        }));
      });
      
      console.log(`🗺️ Total boundary features for national map: ${boundariesFeatures.length}`);

      const centroidsFeatures = platformsMapData
        .filter((p) => p.centroid)
        .map((p) => ({
          type: "Feature" as const,
          properties: { id: p.id, name: p.name, church_count: p.church_count, member_count: p.member_count },
          geometry: p.centroid!,
        }));

      const boundariesGeoJSON: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: boundariesFeatures };
      const centroidsGeoJSON: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: centroidsFeatures };

      // Add or update boundaries source and layers
      if (map.getSource("platforms-boundaries")) {
        (map.getSource("platforms-boundaries") as any).setData(boundariesGeoJSON);
      } else {
        map.addSource("platforms-boundaries", { type: "geojson", data: boundariesGeoJSON });
      }
      
      // Ensure boundary layers exist - start hidden since showPlatformBoundaries defaults to false
      if (!map.getLayer("platforms-boundaries-fill")) {
        map.addLayer({ id: "platforms-boundaries-fill", type: "fill", source: "platforms-boundaries", layout: { "visibility": "none" }, paint: { "fill-color": "rgba(59, 130, 246, 0.2)", "fill-opacity": 0.6 } });
      }
      if (!map.getLayer("platforms-boundaries-line")) {
        map.addLayer({ id: "platforms-boundaries-line", type: "line", source: "platforms-boundaries", layout: { "visibility": "none" }, paint: { "line-color": "#3b82f6", "line-width": 2 } });
      }

      // Add or update centroids source and layers
      if (map.getSource("platforms-centroids")) {
        (map.getSource("platforms-centroids") as any).setData(centroidsGeoJSON);
      } else {
        map.addSource("platforms-centroids", { type: "geojson", data: centroidsGeoJSON });
      }
      
      // Ensure centroid layers exist - start hidden since showPlatformLabels defaults to false
      if (!map.getLayer("platforms-centroids-labels")) {
        map.addLayer({ 
          id: "platforms-centroids-labels", 
          type: "symbol", 
          source: "platforms-centroids", 
          layout: { 
            "visibility": "none",
            "text-field": ["get", "name"], 
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"], 
            "text-size": 12, 
            "text-anchor": "bottom", 
            "text-offset": [0, -0.5], 
            "text-allow-overlap": false 
          }, 
          paint: { 
            "text-color": "#1f2937", 
            "text-halo-color": "#ffffff", 
            "text-halo-width": 2 
          } 
        });
      }
      if (!map.getLayer("platforms-centroids-markers")) {
        map.addLayer({ 
          id: "platforms-centroids-markers", 
          type: "circle", 
          source: "platforms-centroids", 
          paint: { 
            "circle-radius": 8,
            "circle-color": "#DC2626", 
            "circle-stroke-color": "#ffffff", 
            "circle-stroke-width": 2 
          } 
        });
      }

      // Only register click handlers if not already done
      if (!platformLayersAddedRef.current) {
        const clickHandler = (e: any) => {
          console.log('🖱️ Platform click detected:', e.features?.[0]?.properties);
          if (e.features && e.features[0]) {
            const id = e.features[0].properties?.id;
            if (id) handlePlatformClick(id);
          }
        };

        // Touch handler for mobile - query features at touch point
        const touchHandler = (e: any) => {
          const point = e.point || (e.lngLat && map.project(e.lngLat));
          if (!point) return;
          
          // Query features at touch point for centroid markers
          const features = map.queryRenderedFeatures(point, { layers: ["platforms-centroids-markers"] });
          console.log('👆 Platform touch detected:', features?.[0]?.properties);
          if (features && features[0]) {
            const id = features[0].properties?.id;
            if (id) {
              e.preventDefault?.();
              handlePlatformClick(id);
            }
          }
        };

        // Register click handlers for desktop
        map.on("click", "platforms-boundaries-fill", clickHandler);
        map.on("click", "platforms-centroids-markers", clickHandler);
        
        // Register touch handlers for mobile (touchend is more reliable than click on mobile)
        map.on("touchend", "platforms-centroids-markers", touchHandler);
        map.on("touchend", "platforms-boundaries-fill", clickHandler);
        
        // Cursor feedback for desktop hover
        map.on("mouseenter", "platforms-boundaries-fill", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "platforms-boundaries-fill", () => { map.getCanvas().style.cursor = ""; });
        map.on("mouseenter", "platforms-centroids-markers", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "platforms-centroids-markers", () => { map.getCanvas().style.cursor = ""; });
      }

      platformLayersAddedRef.current = true;

      if (!hasPlatformContext) {
        map.flyTo({ center: CONUS_CENTER, zoom: CONUS_ZOOM, duration: 1500 });
      }
    };

    setupPlatformLayers();
  }, [platformId, platformsMapData, handlePlatformClick, hasPlatformContext]);

  // Toggle platform boundary visibility
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !platformLayersAddedRef.current) return;
    if (map.getLayer("platforms-boundaries-fill")) {
      map.setLayoutProperty("platforms-boundaries-fill", "visibility", showPlatformBoundaries ? "visible" : "none");
    }
    if (map.getLayer("platforms-boundaries-line")) {
      map.setLayoutProperty("platforms-boundaries-line", "visibility", showPlatformBoundaries ? "visible" : "none");
    }
  }, [showPlatformBoundaries]);

  // Toggle platform label visibility
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !platformLayersAddedRef.current) return;
    if (map.getLayer("platforms-centroids-labels")) {
      map.setLayoutProperty("platforms-centroids-labels", "visibility", showPlatformLabels ? "visible" : "none");
    }
  }, [showPlatformLabels]);

  // Render highlighted region boundaries on map (from PlatformDetail navigation)
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    // Clean up existing region highlight layers
    const cleanup = () => {
      if (map.getLayer("region-highlight-fill")) {
        map.removeLayer("region-highlight-fill");
      }
      if (map.getLayer("region-highlight-line")) {
        map.removeLayer("region-highlight-line");
      }
      if (map.getSource("region-highlight")) {
        map.removeSource("region-highlight");
      }
    };

    if (!highlightedRegion || highlightedRegion.boundaries.length === 0) {
      // Cleanup if no region to highlight
      // Wrap in try/catch to safely handle cases where style isn't fully loaded
      try {
        cleanup();
        // Show platform boundaries again when no region is active
        if (map.getLayer("platforms-boundaries-fill")) {
          map.setLayoutProperty("platforms-boundaries-fill", "visibility", showPlatformBoundaries ? "visible" : "none");
        }
        if (map.getLayer("platforms-boundaries-line")) {
          map.setLayoutProperty("platforms-boundaries-line", "visibility", showPlatformBoundaries ? "visible" : "none");
        }
      } catch (e) {
        // Silently ignore errors during cleanup
      }
      return;
    }
    
    // Hide platform boundaries when viewing a region
    try {
      if (map.getLayer("platforms-boundaries-fill")) {
        map.setLayoutProperty("platforms-boundaries-fill", "visibility", "none");
      }
      if (map.getLayer("platforms-boundaries-line")) {
        map.setLayoutProperty("platforms-boundaries-line", "visibility", "none");
      }
    } catch (e) {
      // Silently ignore if layers don't exist yet
    }

    // Wait for map style to load
    const addRegionLayers = () => {
      if (!map.isStyleLoaded()) {
        setTimeout(addRegionLayers, 100);
        return;
      }

      // Cleanup any existing layers first
      cleanup();

      // Create GeoJSON from boundary geometries
      const features = highlightedRegion.boundaries
        .filter(b => b.geometry)
        .map(b => ({
          type: "Feature" as const,
          geometry: b.geometry,
          properties: { id: b.id, name: b.name },
        }));

      if (features.length === 0) return;

      const geojson = {
        type: "FeatureCollection" as const,
        features,
      };

      // Add source
      map.addSource("region-highlight", {
        type: "geojson",
        data: geojson,
      });

      // Add fill layer with region color
      const regionColor = highlightedRegion.color || "#3b82f6";
      map.addLayer({
        id: "region-highlight-fill",
        type: "fill",
        source: "region-highlight",
        paint: {
          "fill-color": regionColor,
          "fill-opacity": 0.25,
        },
      });

      // Add outline layer
      map.addLayer({
        id: "region-highlight-line",
        type: "line",
        source: "region-highlight",
        paint: {
          "line-color": regionColor,
          "line-width": 3,
          "line-opacity": 0.9,
        },
      });
    };

    addRegionLayers();

    // Cleanup on unmount or region change
    // Run cleanup regardless of style state to prevent layer leaks
    // Wrap in try/catch since map operations can fail during unmount
    return () => {
      try {
        cleanup();
      } catch (e) {
        // Silently ignore errors during cleanup (e.g., map already destroyed)
      }
    };
  }, [highlightedRegion, showPlatformBoundaries]);

  // Clear highlighted region when platform context changes
  useEffect(() => {
    if (!hasPlatformContext) {
      setActiveRegionId(null);
      setHighlightedRegion(null);
      setActiveRegionBoundaryIds([]);
    }
  }, [hasPlatformContext]);
  
  // Handle region changes from URL (when user selects region from Header dropdown)
  // This runs separately to ensure smooth region switching
  // We track the search string in state because wouter's location doesn't include search params
  const [searchString, setSearchString] = useState(window.location.search);
  const prevRegionIdRef = useRef<string | null>(null);
  
  // Listen for URL changes (including search params)
  useEffect(() => {
    const handleUrlChange = () => {
      setSearchString(window.location.search);
    };
    
    // Listen for popstate (back/forward navigation)
    window.addEventListener('popstate', handleUrlChange);
    
    // Also poll for changes since pushState doesn't fire popstate
    const interval = setInterval(() => {
      if (window.location.search !== searchString) {
        setSearchString(window.location.search);
      }
    }, 100);
    
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      clearInterval(interval);
    };
  }, [searchString]);
  
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const urlRegionId = params.get('region');
    const urlPlatformId = params.get('platform');
    
    console.log('🗺️ Region URL check:', { urlRegionId, urlPlatformId, prev: prevRegionIdRef.current, searchString });
    
    // Skip if no change
    if (urlRegionId === prevRegionIdRef.current) return;
    prevRegionIdRef.current = urlRegionId;
    
    // Clear region if URL param is removed (user selected "All Areas")
    if (!urlRegionId) {
      console.log('🗺️ Clearing region selection');
      setActiveRegionId(null);
      setHighlightedRegion(null);
      setActiveRegionBoundaryIds([]);
      return;
    }
    
    // Skip if no platform context
    if (!urlPlatformId) return;
    
    // Fetch region data
    console.log('🗺️ Fetching region data for:', urlRegionId);
    fetch(`/api/platforms/${urlPlatformId}/regions/${urlRegionId}`)
      .then(res => res.ok ? res.json() : null)
      .then(regionData => {
        if (!regionData) {
          console.warn('🗺️ Region not found:', urlRegionId);
          return;
        }
        
        console.log('🗺️ Region data received:', {
          id: regionData.id,
          name: regionData.name,
          boundaryCount: regionData.boundaries?.length || 0,
          hasBoundaryGeometry: regionData.boundaries?.[0]?.geometry ? 'yes' : 'no'
        });
        
        // Set region data
        setActiveRegionId(urlRegionId);
        setHighlightedRegion({
          id: regionData.id,
          name: regionData.name,
          color: regionData.color,
          boundaries: regionData.boundaries || [],
        });
        
        // Store boundary IDs for filtering
        const boundaryIds = (regionData.boundaries || []).map((b: any) => b.id);
        console.log('🗺️ Setting activeRegionBoundaryIds:', boundaryIds);
        setActiveRegionBoundaryIds(boundaryIds);
        
        // Zoom to region boundaries
        if (regionData.boundaries?.length > 0 && mapRef.current) {
          const map = mapRef.current.getMap();
          if (map) {
            try {
              const allBboxes: number[][] = [];
              regionData.boundaries.forEach((boundary: any) => {
                if (boundary.geometry) {
                  try {
                    const boundaryBbox = bbox(boundary.geometry);
                    console.log('🗺️ Boundary bbox:', boundaryBbox);
                    if (boundaryBbox && boundaryBbox.every((v: number) => isFinite(v))) {
                      allBboxes.push(boundaryBbox);
                    }
                  } catch (e) {
                    console.error('🗺️ Failed to compute bbox for boundary:', e);
                  }
                }
              });
              
              if (allBboxes.length > 0) {
                const combinedBbox = [
                  Math.min(...allBboxes.map(b => b[0])),
                  Math.min(...allBboxes.map(b => b[1])),
                  Math.max(...allBboxes.map(b => b[2])),
                  Math.max(...allBboxes.map(b => b[3])),
                ];
                
                console.log('🗺️ Zooming to combined bbox:', combinedBbox);
                map.fitBounds(
                  [[combinedBbox[0], combinedBbox[1]], [combinedBbox[2], combinedBbox[3]]],
                  { padding: 80, duration: 1500 }
                );
              } else {
                console.log('🗺️ No valid bboxes found');
              }
            } catch (e) {
              console.error('🗺️ Failed to zoom to region boundaries:', e);
            }
          } else {
            console.log('🗺️ Map not available');
          }
        } else {
          console.log('🗺️ No boundaries or map ref:', { 
            boundaryCount: regionData.boundaries?.length, 
            hasMapRef: !!mapRef.current 
          });
        }
      })
      .catch(err => console.error('🗺️ Failed to fetch region:', err));
  }, [searchString]); // Re-run when URL search params change

  // Handle drawMinistry URL parameter - deep link to draw ministry boundary for a church
  const prevDrawMinistryRef = useRef<string | null>(null);
  
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const drawMinistryChurchId = params.get('drawMinistry');
    
    // Skip if no change or already processed
    if (drawMinistryChurchId === prevDrawMinistryRef.current) return;
    prevDrawMinistryRef.current = drawMinistryChurchId;
    
    if (!drawMinistryChurchId) return;
    
    console.log('🎨 Draw ministry boundary for church:', drawMinistryChurchId);
    
    // Fetch church data and enable draw mode
    fetch(`/api/churches/${drawMinistryChurchId}`)
      .then(res => res.ok ? res.json() : null)
      .then(churchData => {
        if (!churchData) {
          console.warn('🎨 Church not found:', drawMinistryChurchId);
          return;
        }
        
        console.log('🎨 Church data received:', churchData.name);
        
        // Select the church
        setSelectedChurch(churchData);
        
        // Set the active right sidebar tab to Ministry Areas
        setActiveTab('areas');
        
        // Enable drawing mode for this church
        setDrawingChurchId(drawMinistryChurchId);
        exitAllocationMode();
        setDrawingArea(true);
        
        // Fly to the church location if available
        const lat = churchData.display_lat || churchData.lat;
        const lng = churchData.display_lng || churchData.lng;
        
        if (lat && lng && mapRef.current) {
          const map = mapRef.current.getMap();
          if (map) {
            map.flyTo({
              center: [lng, lat],
              zoom: 14,
              duration: 1500
            });
          }
        }
        
        // Clean up the URL parameter after processing
        const newParams = new URLSearchParams(window.location.search);
        newParams.delete('drawMinistry');
        const newUrl = newParams.toString() 
          ? `${window.location.pathname}?${newParams.toString()}`
          : window.location.pathname;
        window.history.replaceState({}, '', newUrl);
      })
      .catch(err => console.error('🎨 Failed to fetch church:', err));
  }, [searchString]);

  // Handle drawPrimary URL parameter - deep link to draw primary ministry area for a church
  const prevDrawPrimaryRef = useRef<string | null>(null);
  
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const drawPrimaryChurchId = params.get('church');
    const shouldDrawPrimary = params.get('drawPrimary') === 'true';
    
    // Skip if no drawPrimary flag or no church
    if (!shouldDrawPrimary || !drawPrimaryChurchId) return;
    
    // Skip if already processed
    if (drawPrimaryChurchId === prevDrawPrimaryRef.current) return;
    prevDrawPrimaryRef.current = drawPrimaryChurchId;
    
    console.log('🎨 Draw primary ministry area for church:', drawPrimaryChurchId);
    
    // Fetch church data and enable draw mode
    fetch(`/api/churches/${drawPrimaryChurchId}`)
      .then(res => res.ok ? res.json() : null)
      .then(churchData => {
        if (!churchData) {
          console.warn('🎨 Church not found:', drawPrimaryChurchId);
          return;
        }
        
        console.log('🎨 Church data received for primary draw:', churchData.name);
        
        // Select the church
        setSelectedChurch(churchData);
        
        // Set to Church details tab with Ministry Areas sub-tab
        setActiveTab('details');
        setChurchDetailSubTab('areas');
        
        // Enable drawing mode for primary ministry area
        setDrawingChurchId(drawPrimaryChurchId);
        setDrawingPrimaryArea(true);
        exitAllocationMode();
        setDrawingArea(true);
        
        // Fly to the church location if available
        const lat = churchData.display_lat || churchData.lat;
        const lng = churchData.display_lng || churchData.lng;
        
        if (lat && lng && mapRef.current) {
          const map = mapRef.current.getMap();
          if (map) {
            map.flyTo({
              center: [lng, lat],
              zoom: 14,
              duration: 1500
            });
          }
        }
        
        // Clean up the URL parameter after processing (but keep church param)
        const newParams = new URLSearchParams(window.location.search);
        newParams.delete('drawPrimary');
        const newUrl = newParams.toString() 
          ? `${window.location.pathname}?${newParams.toString()}`
          : window.location.pathname;
        window.history.replaceState({}, '', newUrl);
      })
      .catch(err => console.error('🎨 Failed to fetch church for primary draw:', err));
  }, [searchString]);

  // Fetch internal tag styles when internal tag filters are active (admin only)
  // Uses default queryFn which includes auth headers
  const internalTagIdsParam = filters.internalTagIds?.join(',') || '';
  const { data: internalTagStyleData } = useQuery<{ churches: Record<string, InternalTagStyle> }>({
    queryKey: [`/api/admin/internal-tags/by-tags?tag_ids=${internalTagIdsParam}`],
    enabled: isAdmin && !!filters.internalTagIds && filters.internalTagIds.length > 0,
    retry: false,
  });

  // Get internal tag styles map from response (already in correct format)
  const internalTagStyles = useMemo((): Record<string, InternalTagStyle> => {
    console.log('🔑 Internal Tag Query State:', {
      isAdmin,
      internalTagIds: filters.internalTagIds,
      internalTagIdsParam,
      queryEnabled: isAdmin && !!filters.internalTagIds && filters.internalTagIds.length > 0,
      responseData: internalTagStyleData,
    });
    return internalTagStyleData?.churches || {};
  }, [internalTagStyleData, isAdmin, filters.internalTagIds, internalTagIdsParam]);

  // Memoize visibility Sets with STABLE PRIMITIVE values only
  // Use refs to track previous values and prevent unnecessary updates
  const currentChurchId = selectedChurch?.id ?? '';
  const prevChurchAreaIdsKey = useRef<string>('');
  const prevBoundaryIdsKey = useRef<string>('');
  
  // Compute string keys directly without intermediate dependencies
  const currentChurchAreaIdsKey = (() => {
    const set = visibleChurchAreaIdsByChurch[currentChurchId];
    const key = set ? Array.from(set).sort().join(',') : '';
    // Only update ref if key actually changed
    if (key !== prevChurchAreaIdsKey.current) {
      prevChurchAreaIdsKey.current = key;
    }
    return prevChurchAreaIdsKey.current;
  })();

  const currentBoundaryIdsKey = (() => {
    const set = visibleBoundaryIdsByChurch[currentChurchId];
    // If no visibility state exists for this church yet, check if it has a primary ministry area
    // Churches with primary areas should hide boundaries by default (no flash)
    // Churches without primary areas should show all boundaries by default
    if (!set && selectedChurch?.boundaries?.length) {
      if ('' !== prevBoundaryIdsKey.current) {
        prevBoundaryIdsKey.current = '';
      }
      return prevBoundaryIdsKey.current;
    }
    const key = set ? Array.from(set).sort().join(',') : '';
    if (key !== prevBoundaryIdsKey.current) {
      prevBoundaryIdsKey.current = key;
    }
    return prevBoundaryIdsKey.current;
  })();

  const primaryVisible = primaryAreaVisibleByChurch[currentChurchId] ?? true;
  
  // Now create stable Set references using the stable ref values
  const memoizedVisibleChurchAreaIds = useMemo(() => {
    if (showAllAreas) return new Set<string>();
    return new Set(currentChurchAreaIdsKey ? currentChurchAreaIdsKey.split(',').filter(s => s) : []);
  }, [showAllAreas, currentChurchAreaIdsKey]);

  const memoizedVisibleBoundaryIds = useMemo(() => {
    return new Set(currentBoundaryIdsKey ? currentBoundaryIdsKey.split(',').filter(s => s) : []);
  }, [currentBoundaryIdsKey]);

  const memoizedIsPrimaryAreaVisible = useMemo(() => {
    return primaryVisible;
  }, [primaryVisible]);

  const filterBoundaries = useMemo(() => {
    if (filters.boundaryFilterLocated !== true || !filters.boundaryIds?.length || !filters.boundaryGeometries) {
      return EMPTY_ARRAY as Boundary[];
    }
    return filters.boundaryIds
      .filter(id => filters.boundaryGeometries?.[id])
      .map(id => ({
        id,
        name: '',
        type: 'filter',
        geometry: filters.boundaryGeometries![id],
      })) as Boundary[];
  }, [filters.boundaryFilterLocated, filters.boundaryIds, filters.boundaryGeometries]);

  // Sync global area visibility - show new global areas by default (only on first load)
  useEffect(() => {
    if (globalAreas.length === 0 || initializedGlobalAreasRef.current) return;
    
    const currentIds = new Set(globalAreas.map(a => a.id));
    
    setVisibleGlobalAreaIds(currentIds);
    setSeenGlobalAreaIds(currentIds);
    initializedGlobalAreasRef.current = true;
  }, [globalAreas]);

  // Sync church area visibility - show new church areas by default (only on first load per church)
  useEffect(() => {
    if (!selectedChurch || selectedChurchAreas.length === 0) return;
    
    const churchId = selectedChurch.id;
    const initKey = `${churchId}-${selectedChurchAreas.map(a => a.id).sort().join(',')}`;
    
    // Skip if we've already initialized this exact church+areas combination
    if (initializedChurchAreasRef.current.has(initKey)) {
      return;
    }
    
    const currentIds = new Set(selectedChurchAreas.map(a => a.id));
    
    setVisibleChurchAreaIdsByChurch(prev => ({
      ...prev,
      [churchId]: currentIds,
    }));
    
    setSeenChurchAreaIdsByChurch(prev => ({
      ...prev,
      [churchId]: currentIds,
    }));
    
    initializedChurchAreasRef.current.add(initKey);
  }, [selectedChurch, selectedChurchAreas]);

  // Sync boundary visibility - behavior depends on whether church has a primary ministry area
  // If church HAS primary ministry area: hide all place boundaries (they're redundant)
  // If church does NOT have primary ministry area: show all place boundaries by default
  useEffect(() => {
    if (!selectedChurch) return;
    
    const churchId = selectedChurch.id;
    const boundaries = selectedChurch.boundaries || [];
    const hasPrimaryArea = !!selectedChurch.primary_ministry_area;
    
    if (boundaries.length === 0) return;
    
    const initKey = `${churchId}-${boundaries.map(b => b.id).sort().join(',')}-${hasPrimaryArea}`;
    
    // Skip if we've already initialized this exact church+boundaries+hasPrimaryArea combination
    if (initializedChurchBoundariesRef.current.has(initKey)) return;
    
    const currentIds = new Set<string>();
    
    setVisibleBoundaryIdsByChurch(prev => ({
      ...prev,
      [churchId]: currentIds,
    }));
    
    // Always track all boundaries as "seen" so user can manually toggle them back on
    setSeenBoundaryIdsByChurch(prev => ({
      ...prev,
      [churchId]: new Set(boundaries.map(b => b.id)),
    }));
    
    initializedChurchBoundariesRef.current.add(initKey);
  }, [selectedChurch]);

  // Initialize primary ministry area visibility to true by default (only once per church)
  useEffect(() => {
    if (!selectedChurch) return;
    
    const churchId = selectedChurch.id;
    const hasPrimaryArea = !!selectedChurch.primary_ministry_area;
    
    // Only initialize if not already set (prevents re-seeding on toggles)
    if (hasPrimaryArea && primaryAreaVisibleByChurch[churchId] === undefined) {
      setPrimaryAreaVisibleByChurch(prev => ({
        ...prev,
        [churchId]: true,
      }));
    }
  }, [selectedChurch]);

  // Auto-enable showAllAreas when switching to Ministry Map tab, disable when switching to Churches tab
  const prevActiveTabRef = useRef(activeTab);
  useEffect(() => {
    if (activeTab === 'areas' && prevActiveTabRef.current !== 'areas') {
      setShowAllAreas(true);
    } else if (activeTab === 'details' && prevActiveTabRef.current !== 'details') {
      setShowAllAreas(false);
    }
    prevActiveTabRef.current = activeTab;
  }, [activeTab]);

  // Track if we've initialized global ministry area visibility
  const initializedAllMinistryAreasRef = useRef(false);
  
  // Auto-show all ministry areas on map when data loads (only once)
  useEffect(() => {
    if (allMinistryAreas.length === 0 || initializedAllMinistryAreasRef.current) return;
    
    const allIds = new Set(allMinistryAreas.map(a => a.id));
    setVisibleGlobalAreaIds(allIds);
    initializedAllMinistryAreasRef.current = true;
  }, [allMinistryAreas]);

  // Only fetch churches when a platform is selected AND fully loaded (not in national view)
  // National view shows only platform markers via /api/platforms/map
  // IMPORTANT: Wait for platform?.id to be resolved before fetching to avoid race condition
  // NOTE: searchTerm is NOT included here - search only affects the dropdown, not the map pins
  const baseFilters = useMemo(() => ({
    polygon: filters.polygon,
    denomination: filters.denomination,
    collabHave: filters.collabHave,
    collabNeed: filters.collabNeed,
    boundaryIds: filters.boundaryIds,
  }), [filters.polygon, filters.denomination, filters.collabHave, filters.collabNeed, filters.boundaryIds]);
  
  // Quick load: cached platform pins (instant first paint from static GeoJSON)
  const { data: cachedPinData } = useQuery<{ type: string; features: Array<{ properties: { id: string; name: string; denomination: string | null; profile_photo_url: string | null }; geometry: { coordinates: [number, number] } }> }>({
    queryKey: ["/api/churches/pins", platform?.id],
    queryFn: () => fetch(`/api/churches/pins/${platform!.id}`).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),
    enabled: !!platform?.id,
    staleTime: 60 * 60 * 1000, // 1 hour — matches server cache
    gcTime: 2 * 60 * 60 * 1000,
  });

  // Convert cached GeoJSON features to ChurchWithCallings shape for placeholder rendering
  const cachedPinsAsChurches = useMemo(() => {
    if (!cachedPinData?.features?.length) return undefined;
    return cachedPinData.features.map(f => ({
      id: f.properties.id,
      name: f.properties.name,
      denomination: f.properties.denomination,
      profile_photo_url: f.properties.profile_photo_url,
      location: {
        type: "Point" as const,
        coordinates: f.geometry.coordinates,
      },
      // Minimal defaults for remaining Church fields
      address: null, city: null, state: null, zip: null,
      website: null, email: null, phone: null,
      display_lat: f.geometry.coordinates[1], display_lng: f.geometry.coordinates[0],
      primary_ministry_area: null,
      place_calling_id: null,
      collaboration_have: [] as string[], collaboration_need: [] as string[],
      banner_image_url: null, description: null,
      approved: true, claimed_by: null, boundary_ids: [] as string[],
      prayer_auto_approve: false, prayer_name_display_mode: 'first_name_last_initial',
    } as ChurchWithCallings));
  }, [cachedPinData]);

  const { data: churches = [], isLoading: churchesLoading, isFetching: churchesFetching } = useQuery<ChurchWithCallings[]>({
    queryKey: ["/api/churches", baseFilters, platform?.id, activeRegionId],
    enabled: platformId !== null && !!platform?.id, // Wait for platform to be fully loaded
    staleTime: 5 * 60 * 1000, // Keep data fresh for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes (survives platform switches)
    placeholderData: (prev) => prev ?? cachedPinsAsChurches ?? undefined, // Use cached pins for instant first paint, then keep previous data
    queryFn: async () => {
      if (baseFilters.polygon) {
        return apiRequest("POST", "/api/churches/by-polygon", { polygon: baseFilters.polygon });
      }

      // For filters, use the main churches endpoint with platform context
      // Search term is handled separately by the search dropdown - doesn't affect map pins
      // IMPORTANT: Use platform?.id (resolved UUID) instead of platformId (could be slug)
      const params = buildPlatformQueryParams(platform?.id ?? null, {
        denomination: baseFilters.denomination,
        collab_have: baseFilters.collabHave,
        collab_need: baseFilters.collabNeed,
      });
      
      // Add region filtering if a region is selected (server-side spatial filtering)
      if (activeRegionId) {
        params.set('region_id', activeRegionId);
      }

      const url = `/api/churches${params.toString() ? `?${params.toString()}` : ''}`;
      return fetch(url).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      });
    },
  });

  // Note: Platform zoom is now handled in the platform navigation effect using combined_geometry
  // No longer need to wait for churches to load - the boundary geometry provides immediate bounds

  // Dedicated search query for dropdown suggestions
  // This is separate from the main churches query to keep map pins stable while searching
  const debouncedSearchTerm = filters.searchTerm?.trim() || '';
  const { data: searchSuggestions = [], isLoading: searchLoading } = useQuery<ChurchWithCallings[]>({
    queryKey: ["/api/churches/search", debouncedSearchTerm, platform?.id],
    enabled: debouncedSearchTerm.length >= 2 && !!platform?.id,
    staleTime: 30 * 1000, // 30 seconds
    queryFn: async () => {
      const searchParams = buildPlatformQueryParams(platform?.id ?? null, { q: debouncedSearchTerm });
      const searchUrl = `/api/churches/search?${searchParams.toString()}`;
      const res = await fetch(searchUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  // Fetch collaboration lines for the selected church (for map visualization)
  const { data: collaborationLinesData } = useQuery<{ lines: CollaborationLine[] }>({
    queryKey: ['/api/churches/collaboration-lines', selectedChurch?.id],
    queryFn: async () => {
      if (!selectedChurch?.id) return { lines: [] };
      const res = await fetch(`/api/churches/collaboration-lines?churchId=${selectedChurch.id}`);
      if (!res.ok) return { lines: [] };
      return res.json();
    },
    enabled: !!selectedChurch?.id,
    staleTime: 2 * 60 * 1000,
  });
  
  const collaborationLines = collaborationLinesData?.lines || [];

  useEffect(() => {
    if (!allocationModeActive || !allocationModeChurchId) {
      allocationFlyDoneRef.current = null;
      return;
    }
    if (allocationFlyDoneRef.current === allocationModeChurchId) return;
    if (!churches || churches.length === 0) return;
    const church = churches.find((c: any) => c.id === allocationModeChurchId);
    if (church?.location?.coordinates) {
      const [lng, lat] = church.location.coordinates;
      const mapInstance = mapRef.current?.getMap();
      if (mapInstance) {
        mapInstance.flyTo({ center: [lng, lat], zoom: 11, duration: 1500 });
        allocationFlyDoneRef.current = allocationModeChurchId;
      }
    }
  }, [allocationModeActive, allocationModeChurchId, churches]);

  // Filter visible prayers to only those from filtered churches (when filters are active)
  // This ensures prayers respect the same filters as the church list
  // Also respects LDS/JW platform display settings
  const filteredVisiblePrayers = useMemo(() => {
    // Get platform display settings for LDS/JW filtering
    const showLds = platform?.display_lds_churches !== false;
    const showJw = platform?.display_jw_churches !== false;
    
    // Build set of excluded church IDs based on LDS/JW settings
    const excludedChurchIds = new Set<string>();
    if (!showLds || !showJw) {
      churches.forEach(church => {
        if (!showLds && isLdsChurch(church)) excludedChurchIds.add(church.id);
        if (!showJw && isJwChurch(church)) excludedChurchIds.add(church.id);
      });
    }
    
    // Check if any filters are active
    const hasActiveFilters = filters.searchTerm || filters.denomination || 
      (filters.collabHave && filters.collabHave.length > 0) || 
      (filters.collabNeed && filters.collabNeed.length > 0) ||
      (filters.boundaryIds && filters.boundaryIds.length > 0) || filters.polygon;
    
    // First, filter out prayers from excluded (LDS/JW) churches
    const prayersAfterExclusion = visiblePrayers.filter(p => {
      // Global and regional prayers are always shown (no church affiliation)
      if (!p.church_id) return true;
      // Exclude prayers from LDS/JW churches if settings dictate
      return !excludedChurchIds.has(p.church_id);
    });
    
    if (!hasActiveFilters) {
      // No other filters - return prayers after LDS/JW exclusion
      return prayersAfterExclusion;
    }
    
    // Filters active - only show prayers from filtered churches (or global/regional)
    const filteredChurchIds = new Set(churches.map(c => c.id));
    
    return prayersAfterExclusion.filter(p => {
      // Global and regional prayers are always shown
      if (p.global || p.region_type || p.region_id) {
        return true;
      }
      // Church prayers only shown if church matches filters
      return p.church_id && filteredChurchIds.has(p.church_id);
    });
  }, [visiblePrayers, churches, filters, platform?.display_lds_churches, platform?.display_jw_churches]);

  // Sync selectedChurch with updated churches data when boundaries change
  useEffect(() => {
    if (selectedChurch && churches.length > 0) {
      const updatedChurch = churches.find(c => c.id === selectedChurch.id);
      if (updatedChurch) {
        // Only update if church data actually changed (compare key fields to avoid unnecessary re-renders)
        const hasChanged = 
          selectedChurch.name !== updatedChurch.name ||
          selectedChurch.boundaries?.length !== updatedChurch.boundaries?.length ||
          JSON.stringify(selectedChurch.primary_ministry_area) !== JSON.stringify(updatedChurch.primary_ministry_area) ||
          selectedChurch.callings?.length !== updatedChurch.callings?.length;
        
        if (hasChanged) {
          setSelectedChurch(updatedChurch);
        }
      }
    }
  }, [churches, selectedChurch]);

  // Fetch full church details (with boundary geometry) when church is selected
  // The list endpoint doesn't include geometry for performance - we fetch it here
  useEffect(() => {
    if (!selectedChurch) return;
    
    // Check if boundaries already have geometry
    const hasGeometry = selectedChurch.boundaries?.some((b: any) => b.geometry);
    if (hasGeometry || !selectedChurch.boundaries?.length) return;
    
    // Fetch full church details with geometry
    fetch(`/api/churches/${selectedChurch.id}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.boundaries?.length > 0) {
          // Update selected church with boundary geometry
          setSelectedChurch(prev => prev && prev.id === data.id ? {
            ...prev,
            boundaries: data.boundaries
          } : prev);
        }
      })
      .catch(err => console.error('Failed to fetch church boundary geometry:', err));
  }, [selectedChurch?.id, selectedChurch?.boundaries?.length]);

  // Handle deep linking from community feed and calling boundary drawing (/?church=id&calling=id&action=draw)
  // Also handles metric hotspot viewing from Area Intelligence (/?church=id&metric=obesity)
  // Also handles ministry area viewing from church profile (/?church=id&showArea=areaId)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const churchId = params.get('church');
    const callingId = params.get('calling');
    const action = params.get('action'); // 'view' or 'draw'
    const metric = params.get('metric'); // Health metric to view on map
    const showAreaId = params.get('showArea'); // Ministry area to view on map
    
    // Helper to clear URL params (platform context is now in path, not query param)
    const clearUrlParamsPreservePlatform = () => {
      const url = new URL(window.location.href);
      url.search = '';
      window.history.replaceState({}, '', url.toString());
    };
    
    // Handle metric-only view (no church needed)
    if (metric && !churchId) {
      setSelectedHealthMetric(metric);
      setHealthOverlayVisible(true);
      setLeftSidebarTab('views');
      setLeftSidebarOpen(true);
      clearUrlParamsPreservePlatform();
      return;
    }
    
    // NOTE: Region params are handled by the separate useEffect with prevRegionIdRef
    // Skip deep link processing if this is a region-only navigation (no churchId)
    const regionId = params.get('region');
    if (regionId && !churchId) {
      // Region handling is done by the other useEffect - just return here
      return;
    }
    
    // Skip if data is fetching to avoid validating stale cache
    if (!churchId || !churches || churches.length === 0 || churchesFetching) return;
    
    const church = churches.find(c => c.id === churchId);
    if (!church) {
      console.warn('Church not found:', churchId);
      clearUrlParamsPreservePlatform();
      return;
    }
    
    // Validate calling ID if provided AND an action is specified
    // Only validate for view/draw actions to avoid race conditions when adding callings
    if (callingId && (action === 'view' || action === 'draw')) {
      const hasValidCalling = church.callings?.some(c => c.id === callingId);
      if (!hasValidCalling) {
        console.warn('Calling not found or not assigned to church:', callingId);
        toast({
          title: "Invalid calling",
          description: "This calling is not assigned to this church",
          variant: "destructive",
        });
        clearUrlParamsPreservePlatform();
        return;
      }
    }
    
    // Select the church (even if already selected, to handle state updates)
    setSelectedChurch(church);
    if (isMobile) {
      setMobileDetailOpen(true);
    } else {
      openRightSidebar();
    }
    
    // Handle allocation mode entry from church profile
    const allocateParam = params.get('allocate');
    console.log('[Deep Link] allocate param:', allocateParam, 'churchId:', churchId);
    if (allocateParam === 'true') {
      console.log('[Deep Link] Entering allocation mode for church:', churchId);
      enterAllocationMode(churchId);
    }
    
    // If there's a calling param, switch to areas tab
    if (callingId) {
      setActiveTab('details');
      setChurchDetailSubTab('areas');
      
      // If action is 'draw', activate drawing mode
      if (action === 'draw') {
        // Cancel any existing drawing state first
        setDrawingArea(false);
        setDrawingChurchId(null);
        setDrawingCallingId(null);
        
        // Set the calling context for the draw operation
        const calling = church.callings?.find(c => c.id === callingId);
        const callingName = calling?.name || 'this calling';
        
        // Clear any existing shapes from Mapbox Draw
        if (mapRef.current) {
          const map = mapRef.current.getMap();
          if (map) {
            // Mapbox Draw instance is managed by MapView, just reset drawing state
            // The MapView component will handle activating polygon mode when drawingArea becomes true
            setDrawingChurchId(church.id);
            setDrawingCallingId(callingId);
            exitAllocationMode();
            setDrawingArea(true);
            toast({
              title: "Draw custom boundary",
              description: `Click "Draw Boundary" for ${callingName} in the panel, then draw on the map`,
            });
          }
        } else {
          // Fallback if map ref isn't ready yet
          setDrawingChurchId(church.id);
          setDrawingCallingId(callingId);
          exitAllocationMode();
          setDrawingArea(true);
          toast({
            title: "Draw custom boundary",
            description: `Click "Draw Boundary" for ${callingName} in the panel, then draw on the map`,
          });
        }
      }
    } else if (metric) {
      // Handle viewing hotspot from Area Intelligence - show metric overlay and fly to church area
      console.log('[URL Params] Setting selected church from metric param:', church.name, church.id);
      setSelectedHealthMetric(metric);
      setHealthOverlayVisible(true);
      setLeftSidebarTab('views');
      setLeftSidebarOpen(true);
      
      // Stay on Churches tab with Ministry Areas sub-tab
      setActiveTab('details');
      setSelectedChurch(church);
      setChurchDetailSubTab('areas');
      
      // Disable global Ministry Map filters to prevent interference with Churches tab
      setShowAllAreas(false);
      setMinistryCallingTypeFilters(new Set());
      
      // Ensure right sidebar is visible on all devices
      openRightSidebar();
      if (isMobile) {
        setMobileDetailOpen(true);
      }
      
      // Ensure the church's primary ministry area is visible on the map
      setPrimaryAreaVisibleByChurch(prev => ({
        ...prev,
        [church.id]: true,
      }));
      
      // Turn OFF all place boundaries to keep focus on health metric overlay
      setVisibleBoundaryIdsByChurch(prev => ({
        ...prev,
        [church.id]: new Set<string>(), // Empty set = no boundaries visible
      }));
      
      // Mark church as "initialized" to prevent the boundary seeding effect from restoring all boundaries
      // This must happen AFTER setting the empty boundary set to prevent race conditions
      const boundaryInitKey = `${church.id}-${(church.boundaries || []).map(b => b.id).sort().join(',')}`;
      initializedChurchBoundariesRef.current.add(boundaryInitKey);
      
      // Fly to church's ministry area or location
      if (mapRef.current) {
        const map = mapRef.current.getMap();
        if (map && church.primary_ministry_area) {
          // If church has a ministry area, fit bounds to it
          try {
            const areaBbox = bbox(church.primary_ministry_area);
            if (areaBbox && areaBbox.every((v: number) => isFinite(v))) {
              map.fitBounds(
                [[areaBbox[0], areaBbox[1]], [areaBbox[2], areaBbox[3]]],
                { padding: 50, duration: 1500 }
              );
            }
          } catch {
            // Fallback to church location
            if (church.location) {
              map.flyTo({
                center: church.location.coordinates as [number, number],
                zoom: 13,
                duration: 1500
              });
            }
          }
        } else if (map && church.location) {
          map.flyTo({
            center: church.location.coordinates as [number, number],
            zoom: 13,
            duration: 1500
          });
        }
      }
      
      toast({
        title: "Viewing Community Hotspot",
        description: `Showing ${metric.replace(/_/g, ' ')} data for the area`,
      });
    } else if (showAreaId) {
      // Handle viewing ministry area from church profile
      console.log('[URL Params] Showing ministry area:', showAreaId, 'for church:', church.name);
      
      // Switch to Ministry Areas tab
      setActiveTab('details');
      setChurchDetailSubTab('areas');
      
      // Ensure right sidebar is visible
      openRightSidebar();
      if (isMobile) {
        setMobileDetailOpen(true);
      }
      
      // Ensure the church's primary ministry area is visible
      setPrimaryAreaVisibleByChurch(prev => ({
        ...prev,
        [church.id]: true,
      }));
      
      // Determine geometry to fly to
      let geometryToShow: any = null;
      
      // Check if this is a primary area (id starts with "primary-")
      if (showAreaId.startsWith('primary-')) {
        geometryToShow = church.primary_ministry_area;
      } else {
        // Fetch the specific ministry area to get its geometry
        // We need to fetch this since allMinistryAreas might not be loaded
        fetch(`/api/ministry-areas/${showAreaId}`)
          .then(res => res.ok ? res.json() : null)
          .then(area => {
            if (area?.geometry && mapRef.current) {
              const map = mapRef.current.getMap();
              if (map) {
                try {
                  const areaBbox = bbox(area.geometry);
                  if (areaBbox && areaBbox.every((v: number) => isFinite(v))) {
                    map.fitBounds(
                      [[areaBbox[0], areaBbox[1]], [areaBbox[2], areaBbox[3]]],
                      { padding: 80, duration: 1500 }
                    );
                  }
                } catch (e) {
                  console.error('Failed to compute bbox for area:', e);
                }
              }
            }
          })
          .catch(e => console.error('Failed to fetch ministry area:', e));
      }
      
      // If we have geometry (primary area), fly to it immediately
      if (geometryToShow && mapRef.current) {
        const map = mapRef.current.getMap();
        if (map) {
          try {
            const areaBbox = bbox(geometryToShow);
            if (areaBbox && areaBbox.every((v: number) => isFinite(v))) {
              map.fitBounds(
                [[areaBbox[0], areaBbox[1]], [areaBbox[2], areaBbox[3]]],
                { padding: 80, duration: 1500 }
              );
            }
          } catch {
            // Fallback to church location
            if (church.location) {
              map.flyTo({
                center: church.location.coordinates as [number, number],
                zoom: 13,
                duration: 1500
              });
            }
          }
        }
      } else if (!showAreaId.startsWith('primary-') && church.location && mapRef.current) {
        // For non-primary areas, if fetch is still pending, fly to church location first
        const map = mapRef.current.getMap();
        if (map) {
          map.flyTo({
            center: church.location.coordinates as [number, number],
            zoom: 14,
            duration: 1500
          });
        }
      }
    } else {
      // Fly to the church on the map if no calling action
      if (mapRef.current && church.location) {
        const map = mapRef.current.getMap();
        if (map) {
          map.flyTo({
            center: church.location.coordinates as [number, number],
            zoom: 15,
            duration: 1500
          });
        }
      }
    }
    
    // Clear the query parameter to avoid re-triggering (but preserve platform)
    clearUrlParamsPreservePlatform();
  }, [churches, churchesFetching, isMobile, toast, hasPlatformContext, platformId, setPlatformId, searchString, userChurchId]); // churchesFetching ensures validation waits for fresh data

  const createChurchMutation = useMutation({
    mutationFn: async (data: InsertChurch): Promise<{ id: string; name: string }> => {
      const response = await apiRequest("POST", "/api/churches", data);
      return response as { id: string; name: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const savePrimaryAreaMutation = useMutation({
    mutationFn: async ({ churchId, geometry }: { churchId: string; geometry: any }) => {
      return apiRequest("PATCH", `/api/churches/${churchId}/primary-ministry-area`, { geometry });
    },
    onSuccess: async (data, variables) => {
      // Reset drawing state immediately for responsiveness
      setDrawingArea(false);
      setDrawingPrimaryArea(false);
      setNewAreaCoordinates([]);
      setDrawingChurchId(null);
      setEditingGeometry(false);
      setEditingArea(null);
      setEditAreaCoordinates([]);
      
      // Invalidate area intelligence cache FIRST to ensure fresh data is fetched
      // This prevents showing stale/old area intelligence data when popup opens
      await queryClient.invalidateQueries({ queryKey: ['/api/churches/area-intelligence', variables.churchId] });
      
      // Show Area Intelligence popup IMMEDIATELY for better UX
      // The popup will fetch its own data while we refresh church data in background
      setAreaIntelligenceChurchId(variables.churchId);
      const churchName = selectedChurch?.name || "Your Church";
      setAreaIntelligenceChurchName(churchName);
      setShowAreaIntelligencePopup(true);
      
      toast({
        title: "Primary area saved",
        description: "Your primary ministry area has been updated.",
      });
      
      // Invalidate and refetch in background (non-blocking)
      queryClient.invalidateQueries({ queryKey: ["/api/churches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ministry-areas"] });
      
      // Refetch churches in background to update map
      queryClient.refetchQueries({ queryKey: ["/api/churches", filters] }).then(() => {
        // Update selectedChurch from the refetched data only if still viewing the same church
        // Use functional setState to check current state and avoid stale closure issues
        setSelectedChurch(currentChurch => {
          if (currentChurch && currentChurch.id === variables.churchId) {
            const updatedChurches = queryClient.getQueryData<ChurchWithCallings[]>(["/api/churches", filters]);
            const updatedChurch = updatedChurches?.find(c => c.id === variables.churchId);
            return updatedChurch || currentChurch;
          }
          // User navigated to different church - don't override
          return currentChurch;
        });
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

  const createAreaMutation = useMutation({
    mutationFn: async (data: { name: string; type: string; geometry: any; church_id?: string; calling_id?: string }) => {
      return apiRequest("POST", "/api/areas", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/areas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ministry-areas"] });
      if (drawingChurchId) {
        queryClient.invalidateQueries({ queryKey: ["/api/areas", drawingChurchId] });
        queryClient.invalidateQueries({ queryKey: ["/api/churches", drawingChurchId] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/churches"] });
      
      // Clear the drawn shape from the map
      if (selectedShapeId && mapRef.current) {
        mapRef.current.deleteShape(selectedShapeId);
      }
      
      setNewAreaDialogOpen(false);
      setDrawingArea(false);
      setDrawingPrimaryArea(false);
      setNewAreaName("");
      setNewAreaCoordinates([]);
      setNewAreaType('custom');
      setDrawingChurchId(null);
      setDrawingCallingId(null);
      setSelectedShapeId(null);
      
      toast({
        title: "Area created",
        description: "Your ministry area has been saved.",
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

  const deleteAreaMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/areas/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/areas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ministry-areas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ministry-saturation/clipped"] });
      toast({
        title: "Area deleted",
        description: "Ministry area has been removed.",
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

  const editAreaMutation = useMutation({
    mutationFn: async ({ id, name, geometry }: { id: string; name?: string; geometry?: any }) => {
      const payload: any = {};
      if (name) payload.name = name;
      if (geometry) payload.geometry = geometry;
      return apiRequest("PATCH", `/api/areas/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/areas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ministry-areas"] });
      setEditingArea(null);
      setEditAreaName("");
      setEditingGeometry(false);
      setEditAreaCoordinates([]);
      toast({
        title: "Area updated",
        description: "Ministry area has been updated.",
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

  const filteredChurches = useMemo(() => {
    // Get set of church IDs that have matching internal tags (for filtering)
    const internalTagChurchIds = new Set(Object.keys(internalTagStyles));
    const hasInternalTagFilter = filters.internalTagIds && filters.internalTagIds.length > 0;
    const searchTerm = filters.searchTerm?.trim().toLowerCase() || '';
    
    // Get platform display settings for LDS/JW filtering
    const showLds = platform?.display_lds_churches !== false; // Default to true if no platform
    const showJw = platform?.display_jw_churches !== false;
    
    const filtered = Array.isArray(churches) 
      ? churches.filter((church) => {
          // Filter out LDS/JW churches based on platform settings
          if (!showLds && isLdsChurch(church)) return false;
          if (!showJw && isJwChurch(church)) return false;
          
          // NOTE: Region filtering is now done server-side via region_id parameter
          // The server uses PostGIS spatial queries for accurate filtering
          
          // Filter by search term (client-side text matching)
          if (searchTerm.length >= 2) {
            const matchesName = church.name?.toLowerCase().includes(searchTerm);
            const matchesCity = church.city?.toLowerCase().includes(searchTerm);
            const matchesAddress = church.address?.toLowerCase().includes(searchTerm);
            const matchesZip = church.zip?.toLowerCase().includes(searchTerm);
            if (!matchesName && !matchesCity && !matchesAddress && !matchesZip) {
              return false;
            }
          }
          
          // Filter by calling
          if (filters.callings && filters.callings.length > 0) {
            const churchCallingIds = church.callings?.map((c) => c.id) || [];
            if (!filters.callings.some((id) => churchCallingIds.includes(id))) {
              return false;
            }
          }
          
          if (filters.boundaryIds && filters.boundaryIds.length > 0) {
            const focusActive = filters.boundaryFilterFocus !== false;
            const locatedActive = filters.boundaryFilterLocated === true;
            
            let matchesFocus = false;
            let matchesLocated = false;
            
            if (focusActive) {
              const churchBoundaryIds = church.boundary_ids || [];
              matchesFocus = filters.boundaryIds.some(
                filterId => churchBoundaryIds.includes(filterId)
              );
            }
            
            if (locatedActive && filters.boundaryGeometries && church.location?.coordinates) {
              const [churchLng, churchLat] = church.location.coordinates;
              if (churchLat != null && churchLng != null) {
                matchesLocated = filters.boundaryIds.some(filterId => {
                  const geom = filters.boundaryGeometries?.[filterId];
                  if (!geom) return false;
                  try {
                    const pt = point([churchLng, churchLat]);
                    if (geom.type === "Polygon") {
                      return booleanPointInPolygon(pt, polygon(geom.coordinates));
                    } else if (geom.type === "MultiPolygon") {
                      return booleanPointInPolygon(pt, turfMultiPolygon(geom.coordinates));
                    }
                    return false;
                  } catch {
                    return false;
                  }
                });
              }
            }
            
            if (!matchesFocus && !matchesLocated) {
              return false;
            }
          }
          
          // Filter by internal tags (admin only) - only show churches that have the selected tags
          if (hasInternalTagFilter) {
            if (!internalTagChurchIds.has(church.id)) {
              return false;
            }
          }
          
          // Filter by viewport bounds (skip if region is active - we want to show all region churches)
          if (!activeRegionBoundaryIds.length && mapBounds && church.location && church.location.coordinates) {
            const [lng, lat] = church.location.coordinates;
            const inBounds = 
              lng >= mapBounds.west &&
              lng <= mapBounds.east &&
              lat >= mapBounds.south &&
              lat <= mapBounds.north;
            if (!inBounds) {
              return false;
            }
          }
          
          return true;
        })
      : [];
    
    // Sort by distance from map center when bounds are available
    if (mapBounds && filtered.length > 0) {
      const centerLng = (mapBounds.west + mapBounds.east) / 2;
      const centerLat = (mapBounds.south + mapBounds.north) / 2;
      const mapCenter = point([centerLng, centerLat]);
      
      return filtered.sort((a, b) => {
        if (!a.location?.coordinates && !b.location?.coordinates) return 0;
        if (!a.location?.coordinates) return 1;
        if (!b.location?.coordinates) return -1;
        
        const distanceA = distance(mapCenter, point(a.location.coordinates), { units: 'miles' });
        const distanceB = distance(mapCenter, point(b.location.coordinates), { units: 'miles' });
        
        return distanceA - distanceB;
      });
    }
    
    return filtered;
  }, [churches, filters, mapBounds, internalTagStyles, activeRegionBoundaryIds, platform?.display_lds_churches, platform?.display_jw_churches]);

  // Filter ministry areas - only by calling type, not by church visibility (Sprint 1.8)
  // Ministry areas should appear based on their own geometry, not where the church marker is
  const filteredMinistryAreas = useMemo(() => {
    if (!showAllAreas && activeTab !== 'areas' && mapOverlayMode !== 'boundaries') return [];
    if (!ministryAreasVisible && mapOverlayMode !== 'boundaries') return [];
    
    return allMinistryAreas.filter(area => {
      if (!area.church_id) return false;
      return true;
    });
  }, [showAllAreas, activeTab, ministryAreasVisible, allMinistryAreas, mapOverlayMode]);

  // Compute set of church IDs that have ministry areas
  const churchIdsWithMaps = useMemo(() => {
    const ids = new Set<string>();
    allMinistryAreas.forEach(area => {
      if (area.church_id) {
        // Handle primary ministry area IDs (format: "primary-{church_id}")
        if (area.id.startsWith('primary-')) {
          ids.add(area.id.replace('primary-', ''));
        } else {
          ids.add(area.church_id);
        }
      }
    });
    return ids;
  }, [allMinistryAreas]);

  // Churches for map display - does NOT include searchTerm filtering
  // Map should show all churches; only the sidebar list filters by search
  const mapFilteredChurches = useMemo(() => {
    const internalTagChurchIds = new Set(Object.keys(internalTagStyles));
    const hasInternalTagFilter = filters.internalTagIds && filters.internalTagIds.length > 0;
    
    // Get platform display settings for LDS/JW filtering
    const showLds = platform?.display_lds_churches !== false; // Default to true if no platform
    const showJw = platform?.display_jw_churches !== false;
    
    return Array.isArray(churches) 
      ? churches.filter((church) => {
          // Filter out LDS/JW churches based on platform settings
          if (!showLds && isLdsChurch(church)) return false;
          if (!showJw && isJwChurch(church)) return false;
          
          // NOTE: Region filtering is now done server-side via region_id parameter
          // The server uses PostGIS spatial queries for accurate filtering
          
          // Filter by calling (but NOT by searchTerm - that's only for sidebar)
          if (filters.callings && filters.callings.length > 0) {
            const churchCallingIds = church.callings?.map((c) => c.id) || [];
            if (!filters.callings.some((id) => churchCallingIds.includes(id))) {
              return false;
            }
          }
          
          if (filters.boundaryIds && filters.boundaryIds.length > 0) {
            const focusActive = filters.boundaryFilterFocus !== false;
            const locatedActive = filters.boundaryFilterLocated === true;
            
            let matchesFocus = false;
            let matchesLocated = false;
            
            if (focusActive) {
              const churchBoundaryIds = church.boundary_ids || [];
              matchesFocus = filters.boundaryIds.some(
                filterId => churchBoundaryIds.includes(filterId)
              );
            }
            
            if (locatedActive && filters.boundaryGeometries && church.location?.coordinates) {
              const [churchLng, churchLat] = church.location.coordinates;
              if (churchLat != null && churchLng != null) {
                matchesLocated = filters.boundaryIds.some(filterId => {
                  const geom = filters.boundaryGeometries?.[filterId];
                  if (!geom) return false;
                  try {
                    const pt = point([churchLng, churchLat]);
                    if (geom.type === "Polygon") {
                      return booleanPointInPolygon(pt, polygon(geom.coordinates));
                    } else if (geom.type === "MultiPolygon") {
                      return booleanPointInPolygon(pt, turfMultiPolygon(geom.coordinates));
                    }
                    return false;
                  } catch {
                    return false;
                  }
                });
              }
            }
            
            if (!matchesFocus && !matchesLocated) {
              return false;
            }
          }
          
          if (hasInternalTagFilter) {
            if (!internalTagChurchIds.has(church.id)) {
              return false;
            }
          }
          
          return true;
        })
      : [];
  }, [churches, filters.callings, filters.boundaryIds, filters.boundaryFilterFocus, filters.boundaryFilterLocated, filters.boundaryGeometries, filters.internalTagIds, internalTagStyles, platform?.display_lds_churches, platform?.display_jw_churches]);

  // Filter churches for map display (can exclude those without maps)
  // In national view (no platform context), don't show individual church pins
  const mapDisplayChurches = useMemo(() => {
    // National view should only show platform markers, not individual churches
    if (!hasPlatformContext) return [];
    
    if (!hideChurchesWithoutMaps) return mapFilteredChurches;
    return mapFilteredChurches.filter(church => churchIdsWithMaps.has(church.id));
  }, [mapFilteredChurches, hideChurchesWithoutMaps, churchIdsWithMaps, hasPlatformContext]);

  const handlePolygonDrawn = (coordinates: [number, number][][]) => {
    console.log("handlePolygonDrawn called", { 
      drawingArea: drawingAreaRef.current, 
      drawingPrimaryArea: drawingPrimaryAreaRef.current, 
      drawingCallingId: drawingCallingId,
      editingGeometry: editingGeometryRef.current,
      editingArea: editingAreaRef.current?.id,
      coordinates 
    });
    
    // If we're drawing a primary ministry area, store coordinates and let confirmation dialog handle save
    if (drawingAreaRef.current && drawingPrimaryAreaRef.current && drawingChurchIdRef.current) {
      console.log("Primary area polygon completed - storing coordinates for confirmation");
      setNewAreaCoordinates(coordinates);
      // Don't save yet - let the "Are you finished?" dialog show
      // The user will click "Save Area" to actually save
      return;
    }
    
    // If we're drawing a new area (not primary), save the coordinates and show dialog
    if (drawingAreaRef.current) {
      console.log("Setting dialog open");
      setNewAreaCoordinates(coordinates);
      setNewAreaDialogOpen(true);
      // Keep drawingArea true until dialog is closed to preserve the polygon
      return;
    }

    // If we're editing geometry, save the updated coordinates
    if (editingGeometryRef.current) {
      console.log("Updating geometry for area:", editingAreaRef.current?.id);
      setEditAreaCoordinates(coordinates);
      return;
    }

    // Otherwise, handle polygon filter
    // If coordinates is empty, clear the polygon filter
    if (coordinates.length === 0) {
      const { polygon, ...rest } = filters;
      setFilters(rest);
    } else {
      setFilters({
        ...filters,
        polygon: {
          type: "Polygon",
          coordinates,
        },
      });
    }
  };

  const handleMapClickForPrayer = useCallback(async (
    lngLat: { lng: number; lat: number },
    point: { x: number; y: number }
  ) => {
    setMapClickPrayerLocation({
      lng: lngLat.lng,
      lat: lngLat.lat,
      label: "this area",
      screenPosition: point,
    });

    try {
      const res = await fetch(`/api/tracts/resolve?lng=${lngLat.lng}&lat=${lngLat.lat}`);
      if (res.ok) {
        const data = await res.json();
        let label = "this area";
        if (data.friendly_label) {
          const match = data.friendly_label.match(/\(([^)]+)\)/);
          label = match ? `near ${match[1]}` : "this area";
        }

        setMapClickPrayerLocation(prev => prev ? {
          ...prev,
          label,
          tractId: data.geoid || undefined,
        } : null);
      }
    } catch (err) {
      console.warn("Failed to resolve tract for prayer location:", err);
    }
  }, []);

  const handleChurchClick = (church: ChurchWithCallings) => {
    setSelectedChurch(church);
    if (!isMobile) {
      openRightSidebar();
    }
  };

  const handleViewOnMap = (church: ChurchWithCallings) => {
    // Select the church and open sidebar/drawer
    setSelectedChurch(church);
    if (isMobile) {
      setMobileDetailOpen(true);
    } else {
      openRightSidebar();
    }
    
    // Center and zoom the map to this church
    if (mapRef.current && church.location?.coordinates) {
      const [lng, lat] = church.location.coordinates;
      mapRef.current.flyToChurch(lng, lat);
    }
  };

  const handleZoomToGeometry = (geometry: any) => {
    if (!mapRef.current || !geometry) return;
    
    try {
      const geomBbox = bbox(geometry);
      if (geomBbox && geomBbox.every((v: number) => isFinite(v))) {
        const map = mapRef.current.getMap();
        if (map) {
          map.fitBounds(
            [[geomBbox[0], geomBbox[1]], [geomBbox[2], geomBbox[3]]],
            { padding: 50, duration: 1000 }
          );
        }
      }
    } catch (error) {
      console.error('Error zooming to geometry:', error);
    }
  };

  const handleDrawChurchArea = (churchId: string, isPrimary = false, callingId?: string, areaToEdit?: Area) => {
    console.log("handleDrawChurchArea called", { churchId, isPrimary, callingId, areaToEdit });
    
    if (areaToEdit) {
      // Editing existing area - load it into edit mode
      setEditingArea(areaToEdit);
      setEditingGeometry(true);
      setDrawingChurchId(churchId);
      setDrawingPrimaryArea(isPrimary);
      setDrawingCallingId(callingId || null);
    } else {
      // Drawing new area
      setDrawingChurchId(churchId);
      setDrawingPrimaryArea(isPrimary);
      setDrawingCallingId(callingId || null);
      setNewAreaType('church');
      exitAllocationMode();
      setDrawingArea(true);
    }
  };

  // Pin adjustment handlers
  const handleEnterPinAdjustMode = () => {
    setPinAdjustMode(true);
    setPendingPinPosition(null);
  };

  const handleExitPinAdjustMode = () => {
    setPinAdjustMode(false);
    setPendingPinPosition(null);
  };

  const handlePinPositionSaved = () => {
    setPinAdjustMode(false);
    setPendingPinPosition(null);
  };

  const handlePinPositionReset = () => {
    setPinAdjustMode(false);
    setPendingPinPosition(null);
  };

  const handlePinDrag = (position: { lat: number; lng: number }) => {
    setPendingPinPosition(position);
  };

  const handleMinistryAreaClick = (churchId: string, areaId?: string) => {
    const church = churches.find(c => c.id === churchId);
    if (church) {
      setSelectedChurch(church);
      // Open the appropriate UI based on device
      if (isMobile) {
        setMobileDetailOpen(true);
      } else {
        openRightSidebar();
      }
      // Switch to details tab so church detail panel shows
      setActiveTab('details');
      setChurchDetailSubTab('areas'); // Switch to ministry areas subtab within church detail
      if (areaId) {
        // Set highlighted area - this will also keep it visible on the map
        // via the ministryAreas prop logic that preserves highlighted areas
        setHighlightedAreaId(areaId);
      }
    }
  };


  const handleShapeSelected = (featureId: string) => {
    setSelectedShapeId(featureId);
  };

  const handleShapeDeselected = () => {
    setSelectedShapeId(null);
  };
  
  // Clean up drawing state when selected church changes
  // BUT only if we're not actively drawing - otherwise keep drawing state intact
  useEffect(() => {
    // Skip cleanup if we're actively drawing - don't interrupt the drawing flow
    if (drawingAreaRef.current) {
      return;
    }
    // Reset drawing state when church changes to prevent state leakage
    setDrawingArea(false);
    setDrawingPrimaryArea(false);
    setDrawingCallingId(null);
    setNewAreaDialogOpen(false);
    setNewAreaName("");
    setNewAreaCoordinates([]);
  }, [selectedChurch?.id]);

  useEffect(() => {
    setAllocationPreview(null);
  }, [selectedChurch?.id]);

  const handleDeleteShape = () => {
    if (mapRef.current && selectedShapeId) {
      mapRef.current.deleteShape(selectedShapeId);
      setSelectedShapeId(null);
      // Keep drawing mode active so user can start over
      // The drawing instructions will reappear since selectedShapeId is null
      // No need to reset drawingArea or drawingPrimaryArea - they stay true
    }
  };
  
  const handleStartOver = () => {
    if (mapRef.current) {
      // Delete existing shape if any and restart drawing
      if (selectedShapeId) {
        mapRef.current.deleteShape(selectedShapeId);
      }
      // Explicitly restart drawing mode
      mapRef.current.startDrawing();
    }
    setSelectedShapeId(null);
    setNewAreaCoordinates([]); // Clear stored coordinates
    // Keep drawing mode active so user can draw again
  };

  if (callingsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="space-y-2">
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <Header 
        onAddChurch={() => setAddChurchOpen(true)}
        showPrayerOverlay={prayerOverlayVisible}
        onTogglePrayerOverlay={() => {
          if (!prayerOverlayVisible) {
            // Entering prayer mode - close both sidebars and exit allocation mode
            setLeftSidebarOpen(false);
            setRightSidebarOpen(false);
            exitAllocationMode();
          }
          setPrayerOverlayVisible(!prayerOverlayVisible);
        }}
        prayerModeActive={prayerOverlayVisible}
        platform={platform}
      />
      
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar or Slim Toggle - hide on mobile during Prayer Mode */}
        {leftSidebarOpen && !(isMobile && prayerOverlayVisible) ? (
          <div className="w-96 flex-shrink-0 h-full flex flex-col bg-background border-r">
            <div className="p-2 border-b flex items-center justify-between gap-2">
              <Tabs value={leftSidebarTab} onValueChange={(v) => setLeftSidebarTab(v as 'filters' | 'views')} className="flex-1">
                <TabsList className="grid w-full grid-cols-2 h-9">
                  <TabsTrigger value="filters" className="gap-1.5 text-xs" data-testid="tab-filters">
                    <Filter className="w-3.5 h-3.5" />
                    Filters
                  </TabsTrigger>
                  <TabsTrigger value="views" className="gap-1.5 text-xs" data-testid="tab-views">
                    <Layers className="w-3.5 h-3.5" />
                    Views
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex items-center gap-1">
                {leftSidebarTab === 'filters' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilters({})}
                    disabled={!((filters.callings && filters.callings.length > 0) ||
                      (filters.searchTerm && filters.searchTerm.length > 0) ||
                      (filters.collabHave && filters.collabHave.length > 0) ||
                      (filters.collabNeed && filters.collabNeed.length > 0) ||
                      (filters.boundaryIds && filters.boundaryIds.length > 0) ||
                      filters.polygon)}
                    className="h-8 text-xs"
                    data-testid="button-clear-all-filters"
                  >
                    Clear all
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setLeftSidebarOpen(false)}
                  data-testid="button-close-left-sidebar"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {leftSidebarTab === 'filters' ? (
              <FilterSidebar
                callings={callings}
                filters={filters}
                onFiltersChange={setFilters}
                resultsCount={filteredChurches.length}
                searchResults={searchSuggestions}
                searchLoading={searchLoading}
                onChurchSelect={(church) => {
                  setSelectedChurch(church);
                  if (isMobile) {
                    // Close the left sidebar on mobile so user can see the map
                    setLeftSidebarOpen(false);
                    setMobileDetailOpen(true);
                  } else {
                    openRightSidebar();
                  }
                  if (mapRef.current && church.location?.coordinates) {
                    const [lng, lat] = church.location.coordinates;
                    mapRef.current.flyToChurch(lng, lat);
                  }
                }}
              />
            ) : (
              <ViewsSidebar
                selectedMetric={selectedHealthMetric}
                onMetricChange={setSelectedHealthMetric}
                overlayVisible={healthOverlayVisible}
                onOverlayVisibilityChange={setHealthOverlayVisible}
                performanceMode={performanceMode}
                onPerformanceModeChange={handlePerformanceModeChange}
                prayerCoverageVisible={prayerCoverageVisible}
                onPrayerCoverageVisibilityChange={setPrayerCoverageVisible}
                prayerCoverageMode={prayerCoverageMode}
                onPrayerCoverageModeChange={(mode: "citywide" | "myChurch") => {
                  if (mode === "myChurch") ensureChurchPlatform();
                  setPrayerCoverageMode(mode);
                }}
                userChurchId={userChurchId}
                allocationModeActive={allocationModeActive}
                onAllocationModeChange={(active: boolean) => {
                  if (active && userChurchId) {
                    enterAllocationMode(userChurchId);
                  } else {
                    exitAllocationMode();
                  }
                }}
                onOpenBudgetWizard={() => setBudgetWizardOpen(true)}
              />
            )}
          </div>
        ) : !(isMobile && prayerOverlayVisible) ? (
          <div className="relative z-50 w-0 h-full flex-shrink-0 pointer-events-none">
            <Button
              variant="secondary"
              size="icon"
              onClick={openLeftSidebar}
              data-testid="button-open-left-sidebar"
              className="absolute top-1/2 -translate-y-1/2 left-0 shadow-xl pointer-events-auto"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        ) : null}

        {/* Map - grows to fill available space */}
        <div className="flex-1 relative z-0">
          {/* Editing area UI - Save/Cancel buttons */}
          {editingGeometry && editingArea && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-card border rounded-lg shadow-lg p-3 flex items-center gap-3">
              <span className="text-sm font-medium px-2">Editing: {editingArea.name}</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingGeometry(false);
                    setEditingArea(null);
                    setEditAreaCoordinates([]);
                  }}
                  data-testid="button-cancel-edit-geometry"
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    if (editAreaCoordinates.length === 0) {
                      toast({
                        title: "No changes",
                        description: "Please modify the area boundaries",
                        variant: "destructive",
                      });
                      return;
                    }
                    
                    // Check if editing primary ministry area (pseudo-area with id 'primary')
                    if (editingArea.id === 'primary' && drawingChurchId) {
                      savePrimaryAreaMutation.mutate({
                        churchId: drawingChurchId,
                        geometry: {
                          type: "Polygon",
                          coordinates: editAreaCoordinates,
                        },
                      });
                    } else {
                      // Editing custom calling boundary
                      editAreaMutation.mutate({
                        id: editingArea.id,
                        geometry: {
                          type: "Polygon",
                          coordinates: editAreaCoordinates,
                        },
                      });
                    }
                  }}
                  disabled={editAreaMutation.isPending || savePrimaryAreaMutation.isPending}
                  data-testid="button-save-edit-geometry"
                >
                  {(editAreaMutation.isPending || savePrimaryAreaMutation.isPending) ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
          
          {/* National View Map Controls */}
          {platformId === null && platformsMapData.length > 0 && !prayerOverlayVisible && (
            <Card className="absolute top-4 left-4 z-50 w-64 shadow-lg" data-testid="card-national-view-controls">
              <CardContent className="p-4 space-y-4">
                <Link href="/explore" className="flex items-center justify-between hover-elevate rounded-md p-1 -m-1 cursor-pointer" data-testid="link-explore-platforms">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-primary" />
                    <span className="font-medium text-sm">National View</span>
                  </div>
                  <Badge variant="secondary" className="text-xs" data-testid="badge-platform-count">
                    {platformsMapData.length} platforms
                  </Badge>
                </Link>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Map className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm">Boundaries</span>
                    </div>
                    <Switch
                      checked={showPlatformBoundaries}
                      onCheckedChange={setShowPlatformBoundaries}
                      data-testid="switch-platform-boundaries"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {showPlatformLabels ? (
                        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                      <span className="text-sm">Labels</span>
                    </div>
                    <Switch
                      checked={showPlatformLabels}
                      onCheckedChange={setShowPlatformLabels}
                      data-testid="switch-platform-labels"
                    />
                  </div>
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={handleResetToUSView}
                  data-testid="button-reset-us-view"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset to US View
                </Button>
              </CardContent>
            </Card>
          )}
          
          {/* Drawing mode instructions - show when actively drawing */}
          {drawingArea && !selectedShapeId && !editingGeometry && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-card border rounded-lg shadow-lg p-3 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              <span className="text-sm">Click points to draw your area. <strong>Click on the first point to complete.</strong></span>
            </div>
          )}
          
          {/* Polygon completion confirmation - show "Are you finished?" instead of "Polygon Selected" */}
          {selectedShapeId && !editingGeometry && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-card border rounded-lg shadow-lg p-3 flex flex-col items-center gap-3">
              <span className="text-sm font-medium">Are you finished with your area?</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Switch to direct_select mode to allow point manipulation
                    // Keep selectedShapeId as the current feature ID for editing
                    if (mapRef.current && selectedShapeId) {
                      mapRef.current.editShape(selectedShapeId);
                      // Clear the dialog by setting selectedShapeId to empty string temporarily
                      // This hides the "Are you finished?" dialog while keeping the shape editable
                      setSelectedShapeId(null);
                    }
                  }}
                  data-testid="button-continue-editing"
                >
                  Continue Editing
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleStartOver}
                  data-testid="button-delete-shape"
                  className="gap-1"
                >
                  <Trash2 className="w-4 h-4" />
                  Start Over
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    // For primary areas, save now with the stored coordinates
                    // Use refs to avoid state reset issues during dialog flow
                    if (drawingPrimaryAreaRef.current && drawingChurchIdRef.current && newAreaCoordinates.length > 0) {
                      console.log("Saving primary ministry area from confirmation dialog");
                      savePrimaryAreaMutation.mutate({
                        churchId: drawingChurchIdRef.current,
                        geometry: {
                          type: "Polygon",
                          coordinates: newAreaCoordinates,
                        },
                      });
                    }
                    // Clear drawing state
                    setSelectedShapeId(null);
                    setDrawingArea(false);
                    setDrawingPrimaryArea(false);
                    setNewAreaCoordinates([]);
                  }}
                  data-testid="button-save-area"
                  className="gap-1"
                >
                  <Check className="w-4 h-4" />
                  Save Area
                </Button>
              </div>
            </div>
          )}
          
          {/* Loading indicator when fetching churches for a platform */}
          {hasPlatformContext && churchesLoading && churches.length === 0 && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 bg-background/90 backdrop-blur-sm border rounded-lg shadow-lg px-4 py-2 flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">Loading churches...</span>
            </div>
          )}
          
          <MapView
            ref={mapRef}
            churches={mapDisplayChurches}
            globalAreas={globalAreas}
            churchAreas={(!showAllAreas && activeTab === 'details' && churchDetailSubTab === 'areas') ? selectedChurchAreas : EMPTY_ARRAY}
            ministryAreas={(() => {
              if (mapOverlayMode === 'boundaries') {
                return filteredMinistryAreas;
              }
              if (highlightedAreaId && activeTab === 'details' && selectedChurch) {
                return filteredMinistryAreas.filter(a => a.id === highlightedAreaId);
              }
              if (activeTab === 'areas') {
                return filteredMinistryAreas;
              }
              if (showAllAreas && activeTab === 'details' && !selectedChurch) {
                return filteredMinistryAreas;
              }
              return EMPTY_ARRAY;
            })()}
            boundaries={selectedChurch?.boundaries || EMPTY_ARRAY}
            filterBoundaries={filterBoundaries}
            hoverBoundary={hoverBoundary}
            primaryMinistryArea={null}
            isPrimaryAreaVisible={memoizedIsPrimaryAreaVisible}
            visibleGlobalAreaIds={visibleGlobalAreaIds}
            visibleChurchAreaIds={memoizedVisibleChurchAreaIds}
            visibleBoundaryIds={memoizedVisibleBoundaryIds}
            selectedChurchId={selectedChurch?.id ?? null}
            onChurchClick={handleChurchClick}
            onMapClick={() => {
              setSelectedChurch(null);
              setHighlightedAreaId(null); // Clear highlighted area when clicking away
            }}
            onPolygonDrawn={handlePolygonDrawn}
            onShapeSelected={handleShapeSelected}
            onShapeDeselected={handleShapeDeselected}
            onMinistryAreaClick={handleMinistryAreaClick}
            onMapBoundsChange={setMapBounds}
            drawingAreaMode={drawingArea || editingGeometry}
            drawingPrimaryArea={drawingPrimaryArea}
            editingArea={editingGeometry ? editingArea : null}
            onCancelDrawing={() => {
              setDrawingArea(false);
              setNewAreaCoordinates([]);
              setNewAreaDialogOpen(false);
              setEditingGeometry(false);
              setEditAreaCoordinates([]);
            }}
            leftSidebarOpen={leftSidebarOpen}
            rightSidebarOpen={rightSidebarOpen}
            showAllAreas={showAllAreas}
            highlightedAreaId={highlightedAreaId}
            hoveredAreaId={hoveredAreaId}
            className="w-full h-full"
            internalTagStyles={internalTagStyles}
            pinAdjustMode={pinAdjustMode}
            pinAdjustChurchId={selectedChurch?.id ?? null}
            onPinDrag={handlePinDrag}
            healthMetricKey={selectedHealthMetric}
            healthOverlayVisible={healthOverlayVisible}
            onHealthDataLoadingChange={handleHealthDataLoadingChange}
            prayerCoverageVisible={prayerCoverageVisible}
            prayerCoverageMode={prayerCoverageMode}
            prayerCoverageData={prayerCoverageData ?? null}
            allocationModeActive={allocationModeActive}
            onTractClick={async (tractGeoid, tractLabel, population, point) => {
              if (!allocationModeChurchId) return;
              await queryClient.cancelQueries({ queryKey: ["/api/prayer-coverage/church", allocationModeChurchId] });
              const cachedData = queryClient.getQueryData<{
                budget?: { church_id: string; daily_intercessor_count: number; total_budget_pct: number };
                allocations: Array<{ tract_geoid: string; allocation_pct: number }>;
                total_allocation_pct: number;
                remaining_pct: number;
              }>(["/api/prayer-coverage/church", allocationModeChurchId]);
              const allAllocations = cachedData?.allocations ?? [];
              const existing = allAllocations.find(a => a.tract_geoid === tractGeoid)?.allocation_pct ?? 0;
              const totalAllocated = allAllocations.reduce((sum, a) => sum + a.allocation_pct, 0);
              const maxAvailable = Math.max(0, 100 - totalAllocated + existing);
              const newPct = Math.min(existing + allocationIncrement, maxAvailable);
              if (newPct <= existing) {
                toast({
                  title: "Budget limit reached",
                  description: `No remaining budget to allocate to ${tractLabel}`,
                  variant: "destructive",
                  duration: 2000,
                });
                return;
              }
              const mapInstance = mapRef.current?.getMap();
              if (mapInstance && mapInstance.getSource('allocation-tracts')) {
                const opacity = 0.1 + (Math.min(newPct, 100) / 100) * 0.5;
                let color: string;
                if (newPct <= 10) color = '#FDE68A';
                else if (newPct <= 25) color = '#FCD34D';
                else if (newPct <= 50) color = '#F59E0B';
                else if (newPct <= 75) color = '#D97706';
                else color = '#B45309';
                mapInstance.setFeatureState(
                  { source: 'allocation-tracts', id: tractGeoid },
                  { allocationOpacity: opacity, allocationColor: color }
                );
              }
              const updatedAllocations = allAllocations
                .filter(a => a.tract_geoid !== tractGeoid)
                .map(a => ({ tract_geoid: a.tract_geoid, allocation_pct: a.allocation_pct }));
              updatedAllocations.push({ tract_geoid: tractGeoid, allocation_pct: newPct });
              queryClient.setQueryData(
                ["/api/prayer-coverage/church", allocationModeChurchId],
                (old: any) => {
                  if (!old) return old;
                  const newAllocations = old.allocations
                    .filter((a: any) => a.tract_geoid !== tractGeoid)
                    .concat([{ tract_geoid: tractGeoid, allocation_pct: newPct }]);
                  const newTotal = newAllocations.reduce((s: number, a: any) => s + a.allocation_pct, 0);
                  return { ...old, allocations: newAllocations, total_allocation_pct: newTotal, remaining_pct: Math.max(0, 100 - newTotal) };
                }
              );
              try {
                await apiRequest("PUT", `/api/churches/${allocationModeChurchId}/prayer-allocations`, {
                  allocations: updatedAllocations,
                });
                queryClient.invalidateQueries({ queryKey: ["/api/churches", allocationModeChurchId, "prayer-allocations"] });
                queryClient.invalidateQueries({ queryKey: ["/api/prayer-coverage"] });
                queryClient.invalidateQueries({ queryKey: ["/api/prayer-coverage/church", allocationModeChurchId] });
                const added = newPct - existing;
                toast({
                  title: `${tractLabel} +${added}%`,
                  description: `Now ${newPct}% prayer focus`,
                  duration: 2000,
                });
              } catch {
                queryClient.invalidateQueries({ queryKey: ["/api/prayer-coverage"] });
                queryClient.invalidateQueries({ queryKey: ["/api/prayer-coverage/church", allocationModeChurchId] });
                toast({
                  title: "Error saving allocation",
                  description: "Please try again.",
                  variant: "destructive",
                });
              }
            }}
            onTractLongPress={(tractGeoid, tractLabel, population, point) => {
              setTractPopover({ tractGeoid, tractLabel, population, point });
            }}
            prayerOverlayVisible={prayerOverlayVisible}
            onChurchPrayerFocus={(churchId, churchName) => {
              setFocusedPrayerChurchId(churchId);
              setFocusedPrayerChurchName(churchName);
            }}
            onMapClickForPrayer={handleMapClickForPrayer}
            collaborationLines={collaborationLines}
            performanceMode={performanceMode}
            churchPinsVisible={churchPinsVisible}
            pinMode={pinMode}
            onPinModeChange={platformId ? setPinMode : undefined}
            onMapOverlayModeChange={platformId ? setMapOverlayMode : undefined}
            mapOverlayMode={platformId ? mapOverlayMode : 'off'}
            saturationTooltipVisible={platformId ? saturationTooltipVisible : false}
            onSaturationTooltipVisibilityChange={platformId ? setSaturationTooltipVisible : undefined}
            onPrayerCoverageVisibilityChange={platformId ? setPrayerCoverageVisible : undefined}
            clippedSaturationGeoJSON={platformId ? effectiveSaturationGeoJSON : undefined}
          />
          
          {allocationModeActive && allocationModeChurchId && (
            <Suspense fallback={null}>
              <AllocationModeOverlay
                churchId={allocationModeChurchId}
                churchName={churches?.find((c: any) => c.id === allocationModeChurchId)?.name}
                selectedIncrement={allocationIncrement}
                onIncrementChange={setAllocationIncrement}
                onExit={exitAllocationMode}
                coverageMode={prayerCoverageMode}
                onCoverageModeChange={setPrayerCoverageMode}
              />
            </Suspense>
          )}
        </div>

        {/* Right Sidebar with Tabs */}
        {rightSidebarOpen ? (
          <div className={`${isMobile ? 'absolute inset-0 z-50' : 'w-[420px]'} flex-shrink-0 border-l bg-background overflow-hidden flex flex-col z-10`}>
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold">
                {selectedChurch ? selectedChurch.name : "Explore"}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setRightSidebarOpen(false)}
                data-testid="button-close-right-sidebar"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {userChurchId && !selectedChurch && (
              <button
                className="w-full px-4 py-2.5 border-b text-left text-sm font-medium flex items-center gap-2 hover-elevate"
                onClick={() => {
                  const myChurch = churches.find(c => c.id === userChurchId);
                  if (myChurch) {
                    setSelectedChurch(myChurch);
                    setActiveTab('details');
                  }
                }}
                data-testid="button-my-church"
              >
                <Church className="w-4 h-4 text-primary" />
                {onboardingStatus?.church?.name || myChurches?.[0]?.name || 'My Church'}
              </button>
            )}
            
            <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as 'details' | 'areas')} className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="w-full rounded-none border-b">
                <TabsTrigger value="details" className="flex-1" data-testid="tab-details">
                  Churches
                </TabsTrigger>
                <TabsTrigger value="areas" className="flex-1" data-testid="tab-ministry-map">
                  Ministry Map
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="flex-1 overflow-hidden m-0 min-w-0">
                <ScrollArea className="h-full [&>div>div]:!block">
                  {churchesLoading ? (
                    <div className="p-4 space-y-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="space-y-3">
                          <Skeleton className="h-24 w-full" />
                        </div>
                      ))}
                    </div>
                  ) : selectedChurch ? (
                    <div className="flex flex-col h-full min-w-0">
                      <div className="px-4 pt-4 pb-3 border-b flex items-center justify-between gap-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedChurch(null);
                            setHighlightedAreaId(null);
                          }}
                          data-testid="button-back-to-list"
                        >
                          <ChevronLeft className="w-4 h-4 mr-1" />
                          Back to list
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                          data-testid="button-view-full-profile-desktop"
                        >
                          <Link href={`/church/${selectedChurch.id}`}>
                            View Full Profile
                          </Link>
                        </Button>
                      </div>
                      <ChurchDetail
                        church={selectedChurch}
                        onDrawAreaClick={handleDrawChurchArea}
                        onCancelDrawing={() => setDrawingArea(false)}
                        isDrawingArea={drawingArea && drawingChurchId === selectedChurch.id}
                        isDrawingPrimaryArea={drawingPrimaryArea}
                        churchAreas={selectedChurchAreas}
                        visibleChurchAreaIds={visibleChurchAreaIdsByChurch[selectedChurch.id] || EMPTY_SET}
                        toggleChurchAreaVisibility={toggleChurchAreaVisibility}
                        visibleBoundaryIds={visibleBoundaryIdsByChurch[selectedChurch.id] || EMPTY_SET}
                        toggleBoundaryVisibility={toggleBoundaryVisibility}
                        isPrimaryAreaVisible={primaryAreaVisibleByChurch[selectedChurch.id] ?? true}
                        togglePrimaryAreaVisibility={togglePrimaryAreaVisibility}
                        onHoverBoundary={setHoverBoundary}
                        highlightedAreaId={highlightedAreaId}
                        activeSubTab={churchDetailSubTab}
                        onSubTabChange={setChurchDetailSubTab}
                        onAreaClick={(areaId) => {
                          setChurchDetailSubTab('areas');
                          setHighlightedAreaId(areaId);
                        }}
                        onZoomToGeometry={handleZoomToGeometry}
                        drawingCallingId={drawingCallingId}
                        isPinAdjustMode={pinAdjustMode}
                        pendingPinPosition={pendingPinPosition}
                        onEnterPinAdjustMode={handleEnterPinAdjustMode}
                        onExitPinAdjustMode={handleExitPinAdjustMode}
                        onPinPositionSaved={handlePinPositionSaved}
                        onPinPositionReset={handlePinPositionReset}
                        onOpenBudgetWizard={() => setBudgetWizardOpen(true)}
                        onEnterAllocationMode={() => {
                          if (selectedChurch?.id) {
                            enterAllocationMode(selectedChurch.id);
                          }
                        }}
                        onViewPrayerCoverage={() => {
                          ensureChurchPlatform();
                          setPrayerCoverageVisible(true);
                          setPrayerCoverageMode("myChurch");
                          setLeftSidebarTab('views');
                          setLeftSidebarOpen(true);
                          const m = mapRef.current?.getMap();
                          const coords = selectedChurch?.location?.coordinates;
                          if (m && coords && isFinite(coords[0]) && isFinite(coords[1])) {
                            const currentZoom = m.getZoom();
                            if (currentZoom > 12) {
                              m.flyTo({
                                center: [coords[0], coords[1]],
                                zoom: 11.5,
                                duration: 1200,
                              });
                            }
                          }
                        }}
                        onAllocationPreview={setAllocationPreview}
                        onPrimaryAreaChanged={(churchId, churchName) => {
                          queryClient.invalidateQueries({ queryKey: ['/api/churches/area-intelligence', churchId] });
                          setAreaIntelligenceChurchId(churchId);
                          setAreaIntelligenceChurchName(churchName);
                          setShowAreaIntelligencePopup(true);
                          queryClient.invalidateQueries({ queryKey: ["/api/ministry-saturation/clipped"] });
                          fetch(`/api/churches/${churchId}`).then(r => r.ok ? r.json() : null).then(updatedChurch => {
                            if (updatedChurch) {
                              setSelectedChurch(cur => cur?.id === churchId ? updatedChurch : cur);
                            }
                          });
                          queryClient.invalidateQueries({ queryKey: ["/api/churches"] });
                        }}
                      />
                    </div>
                  ) : filteredChurches.length === 0 ? (
                    <EmptyState
                      type="no-results"
                      title="No churches found"
                      description="Try adjusting your filters or draw a larger area on the map."
                      action={{
                        label: "Clear Filters",
                        onClick: () => setFilters({}),
                      }}
                    />
                  ) : (
                    <div className="flex flex-col h-full">
                      <div className="px-4 py-2 border-b bg-muted/30">
                        <p className="text-sm text-muted-foreground" data-testid="text-church-count">
                          Showing <span className="font-medium text-foreground">{filteredChurches.length}</span> of {churches.length} churches
                          {hasPlatformContext && platform && (
                            <span className="ml-1">in {platform.name}</span>
                          )}
                        </p>
                      </div>
                      
                      {/* CTA for unauthenticated users */}
                      {!user && hasPlatformContext && (
                        <Card className="mx-4 mt-4 bg-primary/5 border-primary/20">
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <Building2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                              <div className="space-y-2">
                                <p className="text-sm font-medium">
                                  Join {platform?.name || 'this platform'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Sign in to claim your church, connect with others, and access all platform features.
                                </p>
                                <div className="flex gap-2 pt-1">
                                  <Button size="sm" asChild data-testid="button-cta-login">
                                    <Link href="/login">
                                      <LogIn className="w-3.5 h-3.5 mr-1.5" />
                                      Log In
                                    </Link>
                                  </Button>
                                  <Button size="sm" variant="outline" asChild data-testid="button-cta-signup">
                                    <Link href="/signup">
                                      <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                                      Sign Up
                                    </Link>
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                      
                      <ScrollArea className="flex-1">
                        <div className="p-4 space-y-4">
                          {filteredChurches.slice(0, 10).map((church) => (
                            <ChurchCard
                              key={church.id}
                              church={church}
                              variant="compact"
                              onViewOnMap={handleViewOnMap}
                              onSelect={handleChurchClick}
                            />
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="areas" className="flex-1 overflow-hidden m-0">
                <MinistryAreasPanel
                  areas={allMinistryAreas}
                  mapBounds={mapBounds}
                  onAreaHover={setHoveredAreaId}
                  onAreaClick={(areaId: string) => {
                    setHighlightedAreaId(prev => prev === areaId ? null : areaId);
                    setVisibleGlobalAreaIds(prev => new Set([...Array.from(prev), areaId]));
                    
                    // Find the area and fit the map to show the entire polygon
                    const area = allMinistryAreas.find(a => a.id === areaId);
                    if (area?.geometry?.coordinates) {
                      // Calculate bounding box of the area polygon
                      const areaPolygon = polygon(area.geometry.coordinates);
                      const [minLng, minLat, maxLng, maxLat] = bbox(areaPolygon);
                      
                      // Fit map to show the entire area with padding
                      if (mapRef.current) {
                        const map = mapRef.current.getMap();
                        if (map) {
                          map.fitBounds(
                            [[minLng, minLat], [maxLng, maxLat]],
                            {
                              padding: { top: 150, bottom: 150, left: 150, right: 400 },
                              duration: 1500,
                              maxZoom: 14
                            }
                          );
                        }
                      }
                      
                      // Select the church that owns this area
                      if (area.church_id) {
                        const church = churches.find(c => c.id === area.church_id);
                        if (church) {
                          setSelectedChurch(church);
                        }
                      }
                    }
                  }}
                  selectedCallingTypes={ministryCallingTypeFilters}
                  onCallingTypeToggle={(type) => {
                    setMinistryCallingTypeFilters(prev => {
                      const newSet = new Set(prev);
                      if (type === null) {
                        // "All" button - clear all selections
                        return EMPTY_SET;
                      }
                      if (newSet.has(type)) {
                        newSet.delete(type);
                      } else {
                        newSet.add(type);
                      }
                      return newSet;
                    });
                  }}
                  showAllAreas={showAllAreas}
                  onToggleShowAllAreas={() => setShowAllAreas(!showAllAreas)}
                  prayerCoverageVisible={prayerCoverageVisible}
                  onPrayerCoverageVisibilityChange={setPrayerCoverageVisible}
                  prayerChurches={churches.filter(c => prayerChurchIds.includes(c.id))}
                  onChurchClick={(churchId) => {
                    const church = churches.find(c => c.id === churchId);
                    if (church) {
                      setSelectedChurch(church);
                      setChurchDetailSubTab('pray');
                    }
                  }}
                />
              </TabsContent>

              <TabsContent value="collaboration" className="flex-1 overflow-hidden m-0">
                <ScrollArea className="h-full">
                  <div className="p-4">
                    <p className="text-sm text-muted-foreground">
                      Collaboration opportunities coming soon...
                    </p>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="relative z-50 w-0 h-full flex-shrink-0 pointer-events-none">
            <Button
              variant="secondary"
              size="icon"
              onClick={() => openRightSidebar()}
              data-testid="button-open-right-sidebar"
              className="absolute top-1/2 -translate-y-1/2 right-0 -translate-x-full shadow-xl pointer-events-auto"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Mobile Bottom Drawer */}
      <Drawer open={mobileDetailOpen} onOpenChange={setMobileDetailOpen}>
        <DrawerContent className="max-h-[85vh] min-h-[50vh]" data-testid="drawer-church-detail">
          {selectedChurch && (
            <>
              <div className="px-4 pt-4 pb-3 border-b flex items-center justify-between">
                <h3 className="font-semibold text-sm text-muted-foreground">Quick View</h3>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  data-testid="button-view-full-profile"
                >
                  <Link href={`/church/${selectedChurch.id}`}>
                    View Full Profile
                  </Link>
                </Button>
              </div>
              <ScrollArea className="flex-1 overflow-y-auto [&>div>div]:!block">
                <ChurchDetail
                  church={selectedChurch}
                  onDrawAreaClick={handleDrawChurchArea}
                  onCancelDrawing={() => setDrawingArea(false)}
                  isDrawingArea={drawingArea && drawingChurchId === selectedChurch.id}
                  isDrawingPrimaryArea={drawingPrimaryArea}
                  churchAreas={selectedChurchAreas}
                  visibleChurchAreaIds={visibleChurchAreaIdsByChurch[selectedChurch.id] || EMPTY_SET}
                  toggleChurchAreaVisibility={toggleChurchAreaVisibility}
                  visibleBoundaryIds={visibleBoundaryIdsByChurch[selectedChurch.id] || EMPTY_SET}
                  toggleBoundaryVisibility={toggleBoundaryVisibility}
                  isPrimaryAreaVisible={primaryAreaVisibleByChurch[selectedChurch.id] ?? true}
                  togglePrimaryAreaVisibility={togglePrimaryAreaVisibility}
                  onHoverBoundary={setHoverBoundary}
                  highlightedAreaId={highlightedAreaId}
                  activeSubTab={churchDetailSubTab}
                  onSubTabChange={setChurchDetailSubTab}
                  onAreaClick={(areaId) => {
                    setChurchDetailSubTab('areas');
                    setHighlightedAreaId(areaId);
                  }}
                  onZoomToGeometry={handleZoomToGeometry}
                  drawingCallingId={drawingCallingId}
                  isPinAdjustMode={pinAdjustMode}
                  pendingPinPosition={pendingPinPosition}
                  onEnterPinAdjustMode={handleEnterPinAdjustMode}
                  onExitPinAdjustMode={handleExitPinAdjustMode}
                  onPinPositionSaved={handlePinPositionSaved}
                  onPinPositionReset={handlePinPositionReset}
                  onOpenBudgetWizard={() => setBudgetWizardOpen(true)}
                  onEnterAllocationMode={() => {
                    if (selectedChurch?.id) {
                      enterAllocationMode(selectedChurch.id);
                    }
                  }}
                  onViewPrayerCoverage={() => {
                    ensureChurchPlatform();
                    setPrayerCoverageVisible(true);
                    setPrayerCoverageMode("myChurch");
                    setLeftSidebarTab('views');
                    setLeftSidebarOpen(true);
                    const m = mapRef.current?.getMap();
                    const coords2 = selectedChurch?.location?.coordinates;
                    if (m && coords2 && isFinite(coords2[0]) && isFinite(coords2[1])) {
                      const currentZoom = m.getZoom();
                      if (currentZoom > 12) {
                        m.flyTo({
                          center: [coords2[0], coords2[1]],
                          zoom: 11.5,
                          duration: 1200,
                        });
                      }
                    }
                  }}
                  onAllocationPreview={setAllocationPreview}
                  onPrimaryAreaChanged={(churchId, churchName) => {
                    queryClient.invalidateQueries({ queryKey: ['/api/churches/area-intelligence', churchId] });
                    setAreaIntelligenceChurchId(churchId);
                    setAreaIntelligenceChurchName(churchName);
                    setShowAreaIntelligencePopup(true);
                    queryClient.invalidateQueries({ queryKey: ["/api/ministry-saturation/clipped"] });
                    fetch(`/api/churches/${churchId}`).then(r => r.ok ? r.json() : null).then(updatedChurch => {
                      if (updatedChurch) {
                        setSelectedChurch(cur => cur?.id === churchId ? updatedChurch : cur);
                      }
                    });
                    queryClient.invalidateQueries({ queryKey: ["/api/churches"] });
                  }}
                />
              </ScrollArea>
            </>
          )}
        </DrawerContent>
      </Drawer>

      <Suspense fallback={null}>
        <ChurchOnboardingModal
          open={addChurchOpen}
          onOpenChange={setAddChurchOpen}
          callings={callings}
          onCreateChurch={async (data, platformId) => {
            const payload = platformId ? { ...data, city_platform_id: platformId } : data;
            const result = await createChurchMutation.mutateAsync(payload as any);
            toast({
              title: "Church submitted",
              description: "Your church submission is pending approval.",
            });
            return result;
          }}
          onClaimSubmit={async (churchId, claimPlatformId, wizardData) => {
            const roleMap: Record<string, string> = {
              owner: "Lead Pastor / Church Owner",
              administrator: "Administrator", 
              member: "Team Member"
            };
            
            const verificationParts: string[] = [];
            verificationParts.push(`Role: ${roleMap[wizardData.roleSelection]}`);
            if (wizardData.roleNotes) {
              verificationParts.push(`Notes: ${wizardData.roleNotes}`);
            }
            if (wizardData.callingCategories.length > 0) {
              verificationParts.push(`Calling Focus: ${wizardData.callingCategories.join(', ')}`);
            }
            if (wizardData.specificCallings.length > 0) {
              verificationParts.push(`Specific Callings: ${wizardData.specificCallings.join(', ')}`);
            }
            verificationParts.push(`Facility: ${wizardData.facilityOwnership} - ${wizardData.facilityAdequacy}`);
            if (wizardData.unmetFacilityNeeds) {
              verificationParts.push(`Unmet Needs: ${wizardData.unmetFacilityNeeds}`);
            }
            const collabParts = [];
            if (wizardData.collaborationWillingness.shareSpace) collabParts.push('Share Space (OFFER)');
            if (wizardData.collaborationWillingness.hostPartners) collabParts.push('Host Partners (OFFER)');
            if (wizardData.collaborationWillingness.participateInPartners) collabParts.push('Participate in Partners (NEED)');
            if (wizardData.collaborationWillingness.seekSpace) collabParts.push('Seeking Space (NEED)');
            if (wizardData.collaborationWillingness.openToCoLocation) collabParts.push('Open to Co-location');
            if (collabParts.length > 0) {
              verificationParts.push(`Collaboration: ${collabParts.join(', ')}`);
            }
            if (wizardData.collaborationHave && wizardData.collaborationHave.length > 0) {
              verificationParts.push(`We Offer Tags: ${wizardData.collaborationHave.join(', ')}`);
            }
            if (wizardData.collaborationNeed && wizardData.collaborationNeed.length > 0) {
              verificationParts.push(`We Need Tags: ${wizardData.collaborationNeed.join(', ')}`);
            }

            await apiRequest("POST", `/api/churches/${churchId}/claim`, {
              city_platform_id: claimPlatformId,
              role_at_church: roleMap[wizardData.roleSelection],
              verification_notes: verificationParts.join('\n'),
              wizard_data: JSON.stringify(wizardData),
            });
            
            queryClient.invalidateQueries({ queryKey: ["/api/churches", churchId, "claim"] });
            toast({
              title: "Claim Submitted",
              description: "Your claim has been submitted for review. A platform administrator will review your request.",
            });
          }}
          isCreating={createChurchMutation.isPending}
        />
      </Suspense>

      <Dialog 
        open={newAreaDialogOpen} 
        onOpenChange={(open) => {
          setNewAreaDialogOpen(open);
          // Reset area drawing state when dialog is closed
          if (!open) {
            setDrawingArea(false);
            setDrawingPrimaryArea(false);
            setDrawingCallingId(null); // Reset calling ID when dialog closes
            setNewAreaName("");
            setNewAreaCoordinates([]);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Name this Ministry Area</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Give a descriptive name to this ministry area (e.g., 'Downtown Outreach', 'South Side Focus')
            </p>
          </DialogHeader>
          <div className="space-y-4">
            {drawingArea && !drawingPrimaryArea && (
              <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                Draw a polygon on the map to define a ministry area for this church.
              </div>
            )}
            <div>
              <Label htmlFor="area-name">Area Name</Label>
              <Input
                id="area-name"
                value={newAreaName}
                onChange={(e) => setNewAreaName(e.target.value)}
                placeholder="e.g., Downtown Outreach"
                data-testid="input-area-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setNewAreaDialogOpen(false);
                setDrawingArea(false);
                setDrawingPrimaryArea(false);
                setDrawingCallingId(null); // Reset calling ID when cancelled
                setNewAreaName("");
                setNewAreaCoordinates([]);
              }}
              data-testid="button-cancel-area"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!newAreaName.trim()) {
                  toast({
                    title: "Name required",
                    description: "Please enter a name for the area",
                    variant: "destructive",
                  });
                  return;
                }
                const areaData: any = {
                  name: newAreaName,
                  type: newAreaType,
                  geometry: {
                    type: "Polygon",
                    coordinates: newAreaCoordinates,
                  },
                };
                
                if (drawingChurchId) {
                  areaData.church_id = drawingChurchId;
                }
                
                console.log("Saving area with data:", { areaData });
                createAreaMutation.mutate(areaData);
              }}
              disabled={createAreaMutation.isPending}
              data-testid="button-save-area"
            >
              {createAreaMutation.isPending ? "Saving..." : "Save Area"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog 
        open={!!editingArea && !editingGeometry} 
        onOpenChange={(open) => {
          if (!open) {
            setEditingArea(null);
            setEditAreaName("");
            setEditAreaCoordinates([]);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Ministry Area</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-area-name">Area Name</Label>
              <Input
                id="edit-area-name"
                value={editAreaName}
                onChange={(e) => setEditAreaName(e.target.value)}
                placeholder="e.g., Downtown District"
                data-testid="input-edit-area-name"
              />
            </div>
            <div>
              <Button
                variant="outline"
                onClick={() => {
                  if (editingArea && editingArea.geometry) {
                    setEditAreaCoordinates(editingArea.geometry.coordinates);
                    setEditingGeometry(true);
                  }
                }}
                data-testid="button-edit-shape"
                className="w-full"
              >
                Edit Shape
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Click to modify the area boundaries on the map
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingArea(null);
                setEditAreaName("");
                setEditAreaCoordinates([]);
              }}
              data-testid="button-cancel-edit-area"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!editAreaName.trim() && editAreaCoordinates.length === 0) {
                  toast({
                    title: "No changes",
                    description: "Please edit the name or shape",
                    variant: "destructive",
                  });
                  return;
                }
                if (editingArea) {
                  const payload: any = { id: editingArea.id };
                  if (editAreaName.trim() && editAreaName !== editingArea.name) {
                    payload.name = editAreaName;
                  }
                  if (editAreaCoordinates.length > 0) {
                    payload.geometry = {
                      type: "Polygon",
                      coordinates: editAreaCoordinates,
                    };
                  }
                  editAreaMutation.mutate(payload);
                }
              }}
              disabled={editAreaMutation.isPending}
              data-testid="button-save-edit-area"
            >
              {editAreaMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prayer Mode Overlay - rendered at root level for proper z-index stacking */}
      <PrayerModeOverlay
        visible={prayerOverlayVisible}
        onClose={() => setPrayerOverlayVisible(false)}
        prayers={filteredVisiblePrayers}
        onPrayerUpdate={() => {
          setLastPrayerUpdate(Date.now());
          refetchPrayers();
        }}
        onChurchSelect={(churchId) => {
          const church = churches.find(c => c.id === churchId);
          if (church) {
            handleChurchClick(church);
          }
        }}
        leftSidebarOpen={leftSidebarOpen}
        rightSidebarOpen={rightSidebarOpen}
        mapBbox={prayerMapBbox}
        cityPlatformId={platform?.id}
        mapClickLocation={mapClickPrayerLocation}
        onClearMapClick={() => setMapClickPrayerLocation(null)}
      />
      
      {/* Church Prayer Dialog - focused prayer experience in Prayer Mode */}
      {prayerOverlayVisible && focusedPrayerChurchId && (
        <ChurchPrayerDialog
          churchId={focusedPrayerChurchId}
          churchName={focusedPrayerChurchName}
          onClose={() => {
            setFocusedPrayerChurchId(null);
            setFocusedPrayerChurchName("");
          }}
          onPrayerUpdate={() => {
            setLastPrayerUpdate(Date.now());
            refetchPrayers();
          }}
        />
      )}

      {/* Area Intelligence Popup - shown after saving primary ministry area */}
      {areaIntelligenceChurchId && (
        <AreaIntelligencePopup
          churchId={areaIntelligenceChurchId}
          churchName={areaIntelligenceChurchName}
          open={showAreaIntelligencePopup}
          onOpenChange={(open) => {
            setShowAreaIntelligencePopup(open);
            if (!open) {
              setAreaIntelligenceChurchId(null);
              setAreaIntelligenceChurchName("");
            }
          }}
          onViewHotspot={(metricKey) => {
            // Set the health metric overlay
            setSelectedHealthMetric(metricKey);
            setHealthOverlayVisible(true);
            setLeftSidebarTab('views');
            setLeftSidebarOpen(true);
            
            // Stay on Churches tab with Ministry Areas sub-tab
            setActiveTab('details');
            setChurchDetailSubTab('areas');
            
            // Disable global Ministry Map filters
            setShowAllAreas(false);
            setMinistryCallingTypeFilters(new Set());
            
            // Ensure right sidebar is visible
            openRightSidebar();
            if (isMobile) {
              setMobileDetailOpen(true);
            }
            
            // Ensure primary ministry area is visible
            setPrimaryAreaVisibleByChurch(prev => ({
              ...prev,
              [areaIntelligenceChurchId]: true,
            }));
            
            // Turn OFF all place boundaries
            setVisibleBoundaryIdsByChurch(prev => ({
              ...prev,
              [areaIntelligenceChurchId]: new Set<string>(),
            }));
            
            // Fly to church's ministry area
            if (mapRef.current && selectedChurch?.primary_ministry_area) {
              const map = mapRef.current.getMap();
              if (map) {
                try {
                  const primaryBbox = bbox(selectedChurch.primary_ministry_area);
                  if (primaryBbox && primaryBbox.every((v: number) => isFinite(v))) {
                    map.fitBounds(
                      [[primaryBbox[0], primaryBbox[1]], [primaryBbox[2], primaryBbox[3]]],
                      { padding: 50, duration: 1500 }
                    );
                  }
                } catch {
                  // Fallback to church location
                  if (selectedChurch.location) {
                    map.flyTo({
                      center: selectedChurch.location.coordinates as [number, number],
                      zoom: 13,
                      duration: 1500
                    });
                  }
                }
              }
            }
            
            toast({
              title: "Viewing Community Hotspot",
              description: `Showing ${metricKey.replace(/_/g, ' ')} data for the area`,
            });
          }}
        />
      )}
      
      {/* Prayer Budget Wizard */}
      {userChurchId && (
        <Suspense fallback={null}>
          <PrayerBudgetWizard
            open={budgetWizardOpen}
            onOpenChange={setBudgetWizardOpen}
            churchId={userChurchId}
            onComplete={() => {
              setBudgetWizardOpen(false);
              queryClient.invalidateQueries({ queryKey: ["/api/prayer-coverage/church", userChurchId] });
              queryClient.invalidateQueries({ queryKey: ["/api/churches", userChurchId, "prayer-budget"] });
              if (userChurchId) {
                enterAllocationMode(userChurchId);
              }
            }}
          />
        </Suspense>
      )}

      {/* Tract Allocation Popover */}
      {tractPopover && allocationModeChurchId && (
        <Suspense fallback={null}>
          <TractAllocationPopover
            tractGeoid={tractPopover.tractGeoid}
            tractLabel={tractPopover.tractLabel}
            population={tractPopover.population}
            churchId={allocationModeChurchId}
            position={tractPopover.point}
            onClose={() => setTractPopover(null)}
            onSaved={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/prayer-coverage"] });
              queryClient.invalidateQueries({ queryKey: ["/api/prayer-coverage/church", allocationModeChurchId] });
            }}
          />
        </Suspense>
      )}

      {/* Welcome tour for new users */}
      {user && shouldShowTour && <WelcomeTour />}
    </div>
  );
}
