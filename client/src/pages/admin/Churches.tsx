import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import bbox from "@turf/bbox";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Link, useLocation } from "wouter";
import { Search, MapPin, Pencil, MoreHorizontal, Trash2, ExternalLink, ChevronLeft, ChevronRight, Check, X, Clock, AlertCircle, Download, Loader2, ShieldCheck, ShieldQuestion, AlertTriangle, CircleDashed, CheckSquare, FileSpreadsheet, UserCheck, History, ChevronDown, Play, RefreshCw, Info, Settings2, EyeOff, Eye, Sparkles, Zap, SkipForward, CheckCircle2, BarChart3, ChevronUp, Archive, RotateCcw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DeleteChurchDialog } from "@/components/DeleteChurchDialog";
import { ImportProgressDialog } from "@/components/ImportProgressDialog";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import { usePlatformContext } from "@/contexts/PlatformContext";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { supabase } from "../../../../lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Church, ChurchPlatformStatus } from "@shared/schema";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const FALLBACK_CENTER: [number, number] = [-98.5795, 39.8283];
const FALLBACK_ZOOM = 4;
const DEFAULT_ZOOM = 10;

interface ChurchInfo {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  denomination: string | null;
  profile_photo_url: string | null;
  location: { type: string; coordinates: [number, number] } | null;
  source: string | null;
  verification_status: string | null;
  data_quality_score: number | null;
  google_match_confidence: number | null;
  google_place_id: string | null;
}

interface DuplicateMatch {
  id: string;
  name: string;
  address: string | null;
}

interface PlatformChurch {
  id: string;
  status: ChurchPlatformStatus;
  is_claimed: boolean;
  claimed_at: string | null;
  added_at: string;
  updated_at: string;
  church: ChurchInfo;
  is_potential_duplicate?: boolean;
  duplicate_of?: DuplicateMatch[];
}

interface PlatformChurchesResponse {
  platform: { id: string; name: string; default_center_lat?: number; default_center_lng?: number };
  churches: PlatformChurch[];
}

interface ChurchClaim {
  id: string;
  church_id: string;
  user_id: string;
  status: string;
  role_at_church: string | null;
  verification_notes: string | null;
  created_at: string;
  church?: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
  };
  user?: {
    id: string;
    email: string | null;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
  };
}

type ImportPhase = 'searching' | 'boundary_check' | 'deduplication' | 'inserting' | 'completed' | 'failed' | null;

interface ImportJob {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'interrupted';
  current_phase?: ImportPhase;
  grid_points_total: number;
  grid_points_completed: number;
  churches_found_raw: number;
  churches_in_boundaries: number;
  churches_outside_boundaries: number;
  duplicates_skipped: number;
  churches_inserted: number;
  churches_linked: number;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  user_id: string;
}

interface ImportHistoryResponse {
  success: boolean;
  importJobs: ImportJob[];
  incompleteJob: {
    id: string;
    status: 'running' | 'interrupted';
    current_phase?: ImportPhase;
    grid_points_completed: number;
    grid_points_total: number;
    churches_found_raw?: number;
    started_at: string;
  } | null;
}

type CleanupConfidenceTier = 'auto' | 'review' | 'manual';

interface CleanupChurchRecord {
  id: string;
  name: string;
  address: string;
  source: string;
  status: string;
  platformChurchId: string;
  verificationStatus: string | null;
  dataQualityScore: number;
  googleMatchConfidence: number;
  survivorScore: number;
}

interface CleanupDuplicateCluster {
  clusterId: string;
  signature: string;
  churches: CleanupChurchRecord[];
  survivor: CleanupChurchRecord;
  duplicates: CleanupChurchRecord[];
  confidenceTier: CleanupConfidenceTier;
  tierReason: string;
  maxNameSimilarity: number;
  maxAddressSimilarity: number;
}

interface CleanupClustersResponse {
  clusters: CleanupDuplicateCluster[];
  summary: {
    totalClusters: number;
    autoResolvable: number;
    needsReview: number;
    needsManual: number;
    totalDuplicatesToHide: number;
  };
  churchIdsInClusters?: string[];
}

interface WizardActionResult {
  autoResolved: number;
  autoHidden: number;
  reviewResolved: number;
  reviewHidden: number;
  skipped: number;
  needsManualReview?: number;
}

interface VerificationSummary {
  total: number;
  verified: number;
  google_verified: number;
  user_verified: number;
  unverified: number;
  not_verified_yet: number;
  flagged_for_review: number;
  average_quality_score: number;
  needs_attention: number;
}

interface VerificationSummaryResponse {
  platform: { id: string; name: string };
  summary: VerificationSummary;
  breakdown?: {
    by_platform_status?: { visible: number; pending: number; hidden: number; featured: number };
    needs_attention_by_platform_status?: { visible: number; pending: number; hidden: number; featured: number };
    last_verification?: { all: string | null; needs_review: string | null };
  };
}

const STATUS_COLORS: Record<ChurchPlatformStatus, { bg: string; text: string; label: string }> = {
  visible: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-800 dark:text-green-300", label: "Visible" },
  hidden: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-800 dark:text-gray-300", label: "Hidden" },
  pending: { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-800 dark:text-yellow-300", label: "Pending" },
  featured: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-800 dark:text-blue-300", label: "Featured" },
};

const STATUS_PIN_COLORS: Record<ChurchPlatformStatus, string> = {
  visible: "#22C55E",
  hidden: "#6B7280",
  pending: "#EAB308",
  featured: "#3B82F6",
};

// Raw verification status from database
type VerificationStatus = 'pending' | 'verified' | 'user_verified' | 'flagged' | 'flagged_for_review' | 'unverified';

// Simplified user-facing categories (5 main categories)
type VerificationCategory = 'google_verified' | 'user_verified' | 'needs_review' | 'google_not_found' | 'not_verified_yet';

// Map raw status to simplified category
function getVerificationCategory(rawStatus: VerificationStatus | string | null): VerificationCategory {
  switch (rawStatus) {
    case 'verified':
      return 'google_verified';
    case 'user_verified':
      return 'user_verified';
    case 'flagged':
    case 'flagged_for_review':
    case 'pending':
      return 'needs_review';
    case 'unverified':
      return 'google_not_found';
    case null:
    case undefined:
    default:
      return 'not_verified_yet';
  }
}

// Config for simplified categories (user-facing)
const VERIFICATION_CATEGORY_CONFIG: Record<VerificationCategory, { 
  label: string; 
  bg: string; 
  text: string;
  tooltip: string;
}> = {
  google_verified: { 
    label: 'Google Verified', 
    bg: 'bg-green-100 dark:bg-green-900/30', 
    text: 'text-green-700 dark:text-green-400',
    tooltip: 'Verified via Google Places with high confidence'
  },
  user_verified: { 
    label: 'Auto/User Verified', 
    bg: 'bg-blue-100 dark:bg-blue-900/30', 
    text: 'text-blue-700 dark:text-blue-400',
    tooltip: 'Manually verified by admin or auto-verified based on data quality'
  },
  needs_review: { 
    label: 'Needs Review', 
    bg: 'bg-amber-100 dark:bg-amber-900/30', 
    text: 'text-amber-700 dark:text-amber-400',
    tooltip: 'Data requires manual review to confirm accuracy'
  },
  google_not_found: { 
    label: 'Google Not Found', 
    bg: 'bg-gray-100 dark:bg-gray-800', 
    text: 'text-gray-600 dark:text-gray-400',
    tooltip: 'Google could not find this church - needs manual verification'
  },
  not_verified_yet: { 
    label: 'Not Verified', 
    bg: 'bg-purple-100 dark:bg-purple-900/30', 
    text: 'text-purple-700 dark:text-purple-400',
    tooltip: 'Google verification has not been run yet - click Verify with Google to check'
  },
};

// Legacy config for backwards compatibility (internal use)
const VERIFICATION_STATUS_CONFIG: Record<VerificationStatus, { label: string; bg: string; text: string }> = {
  pending: { label: 'Needs Review', bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400' },
  verified: { label: 'Google Verified', bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' },
  user_verified: { label: 'Auto/User Verified', bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
  flagged: { label: 'Needs Review', bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400' },
  flagged_for_review: { label: 'Needs Review', bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400' },
  unverified: { label: 'Google Not Found', bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400' },
};

const PAGE_SIZE = 50;

export default function AdminChurches() {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [churchToDelete, setChurchToDelete] = useState<{ id: string; name: string } | null>(null);
  const [selectedChurchIds, setSelectedChurchIds] = useState<Set<string>>(new Set());
  const [importHistoryOpen, setImportHistoryOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [showImportConfirmation, setShowImportConfirmation] = useState(false);
  const [, navigate] = useLocation();
  const { getChurchUrl } = usePlatformNavigation();
  const { platformId, platform } = usePlatformContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isPlatformOwner, isSuperAdmin } = useAdminAccess();
  
  // Only platform owners and super admins can use Google import (due to API costs)
  const canUseGoogleImport = isSuperAdmin || (platformId ? isPlatformOwner(platformId) : false);

  // Map-related state
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const hasInitialFitRef = useRef(false);
  const [statusFilters, setStatusFilters] = useState<Record<ChurchPlatformStatus, boolean>>({
    visible: true,
    pending: true,
    hidden: false,
    featured: true,
  });
  const [verificationFilters, setVerificationFilters] = useState<Record<VerificationCategory, boolean>>({
    google_verified: true,
    user_verified: true,
    needs_review: true,
    google_not_found: true,
    not_verified_yet: true,
  });
  const [showOnlySelected, setShowOnlySelected] = useState(false);

  // Wizard state
  const [showCleanupWizard, setShowCleanupWizard] = useState(false);
  const [wizardPhase, setWizardPhase] = useState<1 | 2 | 3>(1);
  const [wizardClusters, setWizardClusters] = useState<CleanupClustersResponse | null>(null);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);
  const [wizardResults, setWizardResults] = useState<WizardActionResult>({
    autoResolved: 0,
    autoHidden: 0,
    reviewResolved: 0,
    reviewHidden: 0,
    skipped: 0,
  });
  const [expandedSampleClusters, setExpandedSampleClusters] = useState<Set<string>>(new Set());
  const [clusterOverrides, setClusterOverrides] = useState<Record<string, Record<string, 'keep' | 'hide'>>>({});
  const [selectingChurchId, setSelectingChurchId] = useState<string | null>(null);
  
  // Summary panel state
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  
  // Dedupe map state
  const dedupeMapContainer = useRef<HTMLDivElement>(null);
  const dedupeMap = useRef<mapboxgl.Map | null>(null);
  const dedupeMarkers = useRef<mapboxgl.Marker[]>([]);
  const [dedupeMapLoaded, setDedupeMapLoaded] = useState(false);
  
  // Reviewed clusters state
  const [showReviewedClusters, setShowReviewedClusters] = useState(false);
  
  // Verification results dialog state
  const [verificationResults, setVerificationResults] = useState<{
    total: number;
    verified: number;
    flagged_for_review: number;
    unverified: number;
    enriched: number;
    errors: number;
  } | null>(null);
  
  // Archived churches state
  const [showArchivedChurches, setShowArchivedChurches] = useState(false);
  
  // Tab state with URL param support
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') || 'platform';
  });

  // Review Wizard state
  const [showReviewWizard, setShowReviewWizard] = useState(false);
  const [reviewWizardIndex, setReviewWizardIndex] = useState(0);
  const [reviewWizardResults, setReviewWizardResults] = useState({
    verified: 0,
    rejected: 0,
    skipped: 0,
  });
  
  // Wizard edit mode state
  const [wizardEditMode, setWizardEditMode] = useState(false);
  const [wizardEditData, setWizardEditData] = useState<{
    name: string;
    address: string;
    city: string;
    state: string;
    phone: string;
    website: string;
    email: string;
  } | null>(null);

  const { data, isLoading } = useQuery<PlatformChurchesResponse>({
    queryKey: [`/api/admin/city-platforms/${platformId}/churches`],
    queryFn: async () => {
      if (!platformId) {
        throw new Error("No platform selected");
      }
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      
      const response = await fetch(`/api/admin/city-platforms/${platformId}/churches`, {
        headers,
        credentials: "include",
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to fetch churches: ${response.status} - ${text}`);
      }
      return response.json();
    },
    enabled: !!platformId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const churches = data?.churches;

  // Query for boundaries
  const { data: boundariesData } = useQuery<{ boundaries: Array<{ boundary: { geometry: any } | null }> }>({
    queryKey: [`/api/admin/city-platforms/${platformId}/boundaries`],
    enabled: !!platformId,
  });

  // Query for pending church claims
  const { data: pendingClaims = [] } = useQuery<ChurchClaim[]>({
    queryKey: [`/api/admin/city-platforms/${platformId}/church-claims?status=pending`],
    queryFn: async () => {
      if (!platformId) return [];
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      
      const response = await fetch(`/api/admin/city-platforms/${platformId}/church-claims?status=pending`, {
        headers,
        credentials: "include",
      });
      if (!response.ok) {
        return [];
      }
      const result = await response.json();
      return result.claims || [];
    },
    enabled: !!platformId,
    staleTime: 5 * 60 * 1000,
  });

  const pendingClaimsCount = pendingClaims.length;

  // Query for import history
  const { data: importHistoryData, refetch: refetchImportHistory } = useQuery<ImportHistoryResponse>({
    queryKey: [`/api/admin/city-platforms/${platformId}/import-churches`],
    queryFn: async () => {
      if (!platformId) return { success: false, importJobs: [], incompleteJob: null };
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      
      const response = await fetch(`/api/admin/city-platforms/${platformId}/import-churches`, {
        headers,
        credentials: "include",
      });
      if (!response.ok) {
        return { success: false, importJobs: [], incompleteJob: null };
      }
      return response.json();
    },
    enabled: !!platformId,
    staleTime: 5 * 1000,
    refetchInterval: importDialogOpen ? 3000 : false,
  });

  const importJobs = importHistoryData?.importJobs || [];
  const incompleteJob = importHistoryData?.incompleteJob;

  // Auto-open wizard from URL param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openWizard = params.get('openWizard');
    if (openWizard === 'import') {
      if (incompleteJob) {
        // Show the import progress dialog if there's an existing job running
        setImportDialogOpen(true);
      } else {
        setShowImportConfirmation(true);
      }
    } else if (openWizard === 'dedupe') {
      handleOpenCleanupWizard();
    } else if (openWizard === 'review') {
      setShowReviewWizard(true);
    }
    if (openWizard) {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('openWizard');
      window.history.replaceState({}, '', newUrl.toString());
    }
  }, [incompleteJob]);
  
  // Query for verification summary (Data Quality metrics)
  const { data: summaryData, isLoading: summaryLoading } = useQuery<VerificationSummaryResponse>({
    queryKey: [`/api/admin/city-platforms/${platformId}/verification-summary`],
    enabled: !!platformId,
    staleTime: 2 * 60 * 1000,
  });
  
  // Query for duplicate cluster data (to identify pending churches in clusters)
  const { data: duplicateClusterData } = useQuery<CleanupClustersResponse>({
    queryKey: [`/api/admin/city-platforms/${platformId}/cleanup-duplicates`],
    enabled: !!platformId,
    staleTime: 2 * 60 * 1000,
  });
  
  // Query for reviewed clusters (only when expanded)
  const { data: reviewedClustersData, isLoading: reviewedClustersLoading } = useQuery<{
    success: boolean;
    reviewed: Array<{
      id: string;
      cluster_signature: string;
      church_ids: string[];
      decision: string;
      notes: string | null;
      reviewed_at: string;
      reviewed_by: string;
    }>;
    count: number;
  }>({
    queryKey: [`/api/admin/city-platforms/${platformId}/cleanup-duplicates`, 'reviewed'],
    queryFn: async () => {
      return apiRequest("POST", `/api/admin/city-platforms/${platformId}/cleanup-duplicates`, { action: 'get-reviewed' });
    },
    enabled: showReviewedClusters && !!platformId,
    staleTime: 30 * 1000,
  });
  
  // Query for archived churches (only when expanded)
  const { data: archivedChurchesData, isLoading: archivedChurchesLoading } = useQuery<{
    success: boolean;
    archived: Array<{
      id: string;
      original_church_id: string;
      name: string;
      address: string | null;
      source: string | null;
      archived_at: string;
      archived_reason: string;
      survivor_church_id: string | null;
    }>;
    count: number;
  }>({
    queryKey: [`/api/admin/city-platforms/${platformId}/cleanup-duplicates`, 'archived'],
    queryFn: async () => {
      return apiRequest("POST", `/api/admin/city-platforms/${platformId}/cleanup-duplicates`, { action: 'get-archived' });
    },
    enabled: showArchivedChurches && !!platformId,
    staleTime: 30 * 1000,
  });

  const currentDialogJob = useMemo(() => {
    if (activeJobId) {
      const activeJob = importJobs.find(j => j.id === activeJobId);
      if (activeJob) return activeJob;
      
      if (incompleteJob && incompleteJob.id === activeJobId) {
        return {
          ...incompleteJob,
          churches_found_raw: incompleteJob.churches_found_raw || 0,
          churches_in_boundaries: 0,
          churches_outside_boundaries: 0,
          duplicates_skipped: 0,
          churches_inserted: 0,
          churches_linked: 0,
          completed_at: null,
          error_message: null,
          user_id: '',
        };
      }
      
      return {
        id: activeJobId,
        status: 'running' as const,
        current_phase: 'searching' as ImportPhase,
        grid_points_total: 0,
        grid_points_completed: 0,
        churches_found_raw: 0,
        churches_in_boundaries: 0,
        churches_outside_boundaries: 0,
        duplicates_skipped: 0,
        churches_inserted: 0,
        churches_linked: 0,
        started_at: new Date().toISOString(),
        completed_at: null,
        error_message: null,
        user_id: '',
      };
    }
    if (incompleteJob) {
      const fullJob = importJobs.find(j => j.id === incompleteJob.id);
      if (fullJob) return fullJob;
      return {
        ...incompleteJob,
        churches_found_raw: incompleteJob.churches_found_raw || 0,
        churches_in_boundaries: 0,
        churches_outside_boundaries: 0,
        duplicates_skipped: 0,
        churches_inserted: 0,
        churches_linked: 0,
        completed_at: null,
        error_message: null,
        user_id: '',
      };
    }
    return importJobs[0] || null;
  }, [activeJobId, incompleteJob, importJobs]);

  useEffect(() => {
    const isRunning = currentDialogJob?.status === 'running' || incompleteJob?.status === 'running';
    
    if (!isRunning || !importDialogOpen) {
      return;
    }
    
    const interval = setInterval(() => {
      refetchImportHistory();
    }, 2000);
    
    return () => clearInterval(interval);
  }, [currentDialogJob?.status, incompleteJob?.status, importDialogOpen, refetchImportHistory]);

  // Status counts and filtered churches for Platform Churches tab
  const { filteredChurches, statusCounts, verificationCounts } = useMemo(() => {
    if (!churches) return { 
      filteredChurches: [], 
      statusCounts: { visible: 0, pending: 0, hidden: 0, featured: 0 },
      verificationCounts: { google_verified: 0, user_verified: 0, needs_review: 0, google_not_found: 0, not_verified_yet: 0 } 
    };
    
    const counts = { visible: 0, pending: 0, hidden: 0, featured: 0 };
    
    // Count status for all churches
    churches.forEach(c => {
      counts[c.status] = (counts[c.status] || 0) + 1;
    });
    
    // Filter by status first
    let statusFiltered = churches.filter(c => statusFilters[c.status]);
    
    // Count verification categories (simplified) ONLY from churches that pass the status filter
    const verCounts: Record<VerificationCategory, number> = { google_verified: 0, user_verified: 0, needs_review: 0, google_not_found: 0, not_verified_yet: 0 };
    statusFiltered.forEach(c => {
      const rawStatus = c.church?.verification_status;
      const category = getVerificationCategory(rawStatus);
      verCounts[category] = (verCounts[category] || 0) + 1;
    });
    
    // Apply verification category filter
    let filtered = statusFiltered.filter(c => {
      const rawStatus = c.church?.verification_status;
      const category = getVerificationCategory(rawStatus);
      return verificationFilters[category] ?? true;
    });
    
    if (showOnlySelected && selectedChurchIds.size > 0) {
      filtered = filtered.filter(c => c.church && selectedChurchIds.has(c.church.id));
    }
    
    // Apply search term filter
    if (searchTerm.trim()) {
      const lowerSearch = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(c => {
        const name = c.church?.name?.toLowerCase() || '';
        const address = c.church?.address?.toLowerCase() || '';
        const city = c.church?.city?.toLowerCase() || '';
        return name.includes(lowerSearch) || address.includes(lowerSearch) || city.includes(lowerSearch);
      });
    }
    
    return { filteredChurches: filtered, statusCounts: counts, verificationCounts: verCounts };
  }, [churches, statusFilters, verificationFilters, showOnlySelected, selectedChurchIds, searchTerm]);

  const pendingCount = statusCounts.pending;

  // Computed list of churches needing review (for Review Wizard)
  const churchesNeedingReview = useMemo(() => {
    if (!churches) return [];
    return churches.filter(c => {
      const rawStatus = c.church?.verification_status;
      const category = getVerificationCategory(rawStatus);
      return category === 'needs_review';
    });
  }, [churches]);

  // Approve/reject mutations
  const approveMutation = useMutation({
    mutationFn: async (churchId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      
      const response = await fetch(`/api/admin/city-platforms/${platformId}/churches/${churchId}/approve`, {
        method: 'POST',
        headers,
        credentials: 'include',
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to approve church');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/churches`] });
      toast({ title: "Church approved", description: "The church is now visible on the platform." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to approve", description: err.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (churchId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      
      const response = await fetch(`/api/admin/city-platforms/${platformId}/churches/${churchId}/reject`, {
        method: 'POST',
        headers,
        credentials: 'include',
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to reject church');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/churches`] });
      toast({ title: "Church rejected", description: "The church has been hidden from this platform." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to reject", description: err.message, variant: "destructive" });
    },
  });

  // Update verification status mutation (for Review Wizard)
  const updateVerificationStatusMutation = useMutation({
    mutationFn: async ({ churchId, status }: { churchId: string; status: 'verified' | 'unverified' }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      
      const response = await fetch(`/api/admin/churches/${churchId}/verification`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ verification_status: status }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to update verification status');
      }
      return response.json();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  // Update church details mutation (for inline editing in Review Wizard)
  const updateChurchDetailsMutation = useMutation({
    mutationFn: async ({ churchId, data }: { 
      churchId: string; 
      data: { name?: string; address?: string; city?: string; state?: string; phone?: string; website?: string; email?: string } 
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      
      const response = await fetch(`/api/admin/churches/${churchId}`, {
        method: 'PATCH',
        headers,
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to update church details');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/churches`] });
      toast({ title: "Church updated", description: "Church details have been saved." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
  });

  // Review Wizard handlers
  const handleOpenReviewWizard = () => {
    setReviewWizardIndex(0);
    setReviewWizardResults({ verified: 0, rejected: 0, skipped: 0 });
    setWizardEditMode(false);
    setWizardEditData(null);
    setShowReviewWizard(true);
  };

  const handleReviewWizardAction = async (action: 'verify' | 'reject' | 'skip') => {
    const currentChurch = churchesNeedingReview[reviewWizardIndex];
    if (!currentChurch) return;

    // Reset edit mode when moving to next church
    setWizardEditMode(false);
    setWizardEditData(null);

    if (action === 'verify') {
      await updateVerificationStatusMutation.mutateAsync({ 
        churchId: currentChurch.church.id, 
        status: 'verified' 
      });
      setReviewWizardResults(prev => ({ ...prev, verified: prev.verified + 1 }));
    } else if (action === 'reject') {
      await updateVerificationStatusMutation.mutateAsync({ 
        churchId: currentChurch.church.id, 
        status: 'unverified' 
      });
      setReviewWizardResults(prev => ({ ...prev, rejected: prev.rejected + 1 }));
    } else {
      setReviewWizardResults(prev => ({ ...prev, skipped: prev.skipped + 1 }));
    }

    // Move to next church or close wizard
    if (reviewWizardIndex < churchesNeedingReview.length - 1) {
      setReviewWizardIndex(prev => prev + 1);
    } else {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/churches`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/verification-summary`] });
    }
  };

  const handleCloseReviewWizard = () => {
    setShowReviewWizard(false);
    setWizardEditMode(false);
    setWizardEditData(null);
    queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/churches`] });
    queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/verification-summary`] });
  };

  const handleStartWizardEdit = (church: ChurchInfo) => {
    setWizardEditData({
      name: church.name || '',
      address: church.address || '',
      city: church.city || '',
      state: church.state || '',
      phone: '',
      website: '',
      email: '',
    });
    setWizardEditMode(true);
  };

  const handleCancelWizardEdit = () => {
    setWizardEditMode(false);
    setWizardEditData(null);
  };

  const handleSaveWizardEdit = async () => {
    const currentChurch = churchesNeedingReview[reviewWizardIndex];
    if (!currentChurch || !wizardEditData) return;

    await updateChurchDetailsMutation.mutateAsync({
      churchId: currentChurch.church.id,
      data: wizardEditData,
    });
    setWizardEditMode(false);
    setWizardEditData(null);
  };

  const importMutation = useMutation({
    mutationFn: async ({ resume, startFresh }: { resume?: boolean; startFresh?: boolean } = {}) => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      
      const response = await fetch(`/api/admin/city-platforms/${platformId}/import-churches`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ resume, startFresh }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Import failed' }));
        if (response.status === 409) {
          throw new Error(errorData.message || 'An incomplete import exists. Please resume or start fresh.');
        }
        throw new Error(errorData.error || 'Failed to import churches');
      }
      return response.json();
    },
    onMutate: (variables) => {
      const { startFresh } = variables || {};
      setImportDialogOpen(true);
      setActiveJobId(null);
      
      if (startFresh) {
        queryClient.setQueryData(
          [`/api/admin/city-platforms/${platformId}/import-churches`],
          (old: ImportHistoryResponse | undefined) => {
            if (!old) return old;
            return { ...old, incompleteJob: null };
          }
        );
      }
      
      setTimeout(() => refetchImportHistory(), 500);
    },
    onSuccess: (data) => {
      if (data.importJobId) {
        setActiveJobId(data.importJobId);
      }
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/churches`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/import-churches`] });
    },
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/import-churches`] });
      if (!importDialogOpen) {
        const isResumeFailure = err.message.includes('Start Fresh') || err.message.includes('start fresh');
        toast({ 
          title: isResumeFailure ? "Cannot resume this import" : "Import failed", 
          description: err.message, 
          variant: "destructive" 
        });
      }
    },
  });

  const clearImportsMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      
      const response = await fetch(`/api/admin/city-platforms/${platformId}/import-churches`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Clear failed' }));
        throw new Error(errorData.error || 'Failed to clear imports');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/churches`] });
      toast({ 
        title: "Imports cleared", 
        description: `Removed ${data.deleted || 0} Google Places imported churches.`
      });
    },
    onError: (err: Error) => {
      toast({ title: "Clear failed", description: err.message, variant: "destructive" });
    },
  });

  const cancelJobMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      
      const response = await fetch(`/api/admin/city-platforms/${platformId}/import-churches`, {
        method: 'PATCH',
        headers,
        credentials: 'include',
        body: JSON.stringify({ action: 'dismiss' }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Dismiss failed' }));
        throw new Error(errorData.error || 'Failed to dismiss import job');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/import-churches`] });
      toast({ 
        title: "Import job dismissed", 
        description: "The interrupted import job has been cleared."
      });
    },
    onError: (err: Error) => {
      toast({ title: "Dismiss failed", description: err.message, variant: "destructive" });
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (churchIds: string[]) => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      
      const BATCH_SIZE = 100;
      let totalApproved = 0;
      
      for (let i = 0; i < churchIds.length; i += BATCH_SIZE) {
        const batch = churchIds.slice(i, i + BATCH_SIZE);
        const response = await fetch(`/api/admin/city-platforms/${platformId}/churches/bulk-approve`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ churchIds: batch }),
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Bulk approval failed' }));
          throw new Error(errorData.error || 'Failed to approve churches');
        }
        const result = await response.json();
        totalApproved += result.approved || 0;
      }
      
      return { approved: totalApproved };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/churches`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/cleanup-duplicates`] });
      setSelectedChurchIds(new Set());
      toast({ 
        title: "Churches approved", 
        description: `${data.approved || 0} churches are now visible on the platform.`
      });
    },
    onError: (err: Error) => {
      setSelectedChurchIds(new Set());
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/churches`] });
      toast({ title: "Bulk approval failed", description: err.message, variant: "destructive" });
    },
  });

  // Update church status mutation for Platform Churches tab
  const updateChurchMutation = useMutation({
    mutationFn: async ({ church_id, status, remove }: { church_id: string; status?: ChurchPlatformStatus; remove?: boolean }) => {
      return apiRequest("PATCH", `/api/admin/city-platforms/${platformId}/churches`, {
        church_id,
        status,
        remove,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/churches`] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/city-platforms'] });
      
      if (variables.remove) {
        setSelectedChurchIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(variables.church_id);
          return newSet;
        });
      }
      
      toast({
        title: variables.remove ? "Church Removed" : "Status Updated",
        description: variables.remove 
          ? "The church has been removed from the platform."
          : "The church status has been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update church",
        variant: "destructive",
      });
    },
  });

  // Bulk update mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ church_ids, status }: { church_ids: string[]; status: ChurchPlatformStatus }) => {
      const promises = church_ids.map(church_id => 
        apiRequest("PATCH", `/api/admin/city-platforms/${platformId}/churches`, {
          church_id,
          status,
        })
      );
      return Promise.all(promises);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/churches`] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/city-platforms'] });
      setSelectedChurchIds(new Set());
      toast({
        title: "Bulk Update Complete",
        description: `${variables.church_ids.length} churches updated to ${variables.status}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update some churches",
        variant: "destructive",
      });
    },
  });

  // Boundary cleanup mutation
  const boundaryCleanupMutation = useMutation({
    mutationFn: async (action: 'hide-out-of-bounds' | 'unhide-all' | 'review-hidden-in-bounds') => {
      return apiRequest("POST", `/api/admin/city-platforms/${platformId}/boundary-cleanup`, { action });
    },
    onSuccess: (response: any, action) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/churches`] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/city-platforms'] });
      let description = response?.message || 'Cleanup completed';
      toast({
        title: action === 'hide-out-of-bounds' ? "Out-of-Bounds Churches Hidden" 
             : action === 'unhide-all' ? "Churches Unhidden"
             : "Hidden Churches Reviewed",
        description,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Cleanup Error",
        description: error.message || "Failed to complete cleanup",
        variant: "destructive",
      });
    },
  });

  // Cleanup wizard mutations
  const handleOpenCleanupWizard = async () => {
    setShowCleanupWizard(true);
    setWizardPhase(1);
    setWizardLoading(true);
    setCurrentReviewIndex(0);
    setWizardResults({ autoResolved: 0, autoHidden: 0, reviewResolved: 0, reviewHidden: 0, skipped: 0 });
    setClusterOverrides({});
    try {
      const response = await apiRequest("GET", `/api/admin/city-platforms/${platformId}/cleanup-duplicates`);
      setWizardClusters(response as CleanupClustersResponse);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load cleanup data", variant: "destructive" });
      setShowCleanupWizard(false);
    } finally {
      setWizardLoading(false);
    }
  };

  const autoResolveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/admin/city-platforms/${platformId}/cleanup-duplicates`, { 
        action: 'auto-resolve',
        clusterOverrides,
      });
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/churches`] });
      const reviewClusters = wizardClusters?.clusters.filter(c => c.confidenceTier === 'review' || c.confidenceTier === 'manual') || [];
      setWizardResults(prev => ({
        ...prev,
        autoResolved: response.processedClusters || 0,
        autoHidden: response.hiddenCount || response.archivedCount || 0,
        needsManualReview: reviewClusters.length,
      }));
      setWizardPhase(3);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to auto-resolve", variant: "destructive" });
    },
  });

  const resolveClusterMutation = useMutation({
    mutationFn: async ({ survivorId, hideIds, churchId }: { survivorId: string; hideIds: string[]; churchId: string }) => {
      console.log('[resolveClusterMutation] mutationFn called with:', { survivorId, hideIds, churchId });
      setSelectingChurchId(churchId);
      const result = await apiRequest("POST", `/api/admin/city-platforms/${platformId}/cleanup-duplicates`, {
        action: 'resolve-cluster',
        survivorId,
        hideIds,
      });
      console.log('[resolveClusterMutation] API response:', result);
      return result;
    },
    onSuccess: (response: any) => {
      console.log('[resolveClusterMutation] onSuccess:', response);
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/churches`] });
      setWizardResults(prev => ({
        ...prev,
        reviewResolved: prev.reviewResolved + 1,
        reviewHidden: prev.reviewHidden + (response.hiddenCount || response.archivedCount || 0),
      }));
      setSelectingChurchId(null);
      moveToNextCluster();
    },
    onError: (error: Error) => {
      console.error('[resolveClusterMutation] onError:', error);
      setSelectingChurchId(null);
      toast({ title: "Error", description: error.message || "Failed to resolve cluster", variant: "destructive" });
    },
  });

  const hideClusterMutation = useMutation({
    mutationFn: async ({ hideIds }: { hideIds: string[] }) => {
      return apiRequest("POST", `/api/admin/city-platforms/${platformId}/cleanup-duplicates`, {
        action: 'hide-cluster',
        hideIds,
      });
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/churches`] });
      setWizardResults(prev => ({
        ...prev,
        reviewResolved: prev.reviewResolved + 1,
        reviewHidden: prev.reviewHidden + (response.hiddenCount || 0),
      }));
      moveToNextCluster();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to hide cluster", variant: "destructive" });
    },
  });

  const moveToNextCluster = () => {
    const reviewClusters = wizardClusters?.clusters.filter(c => c.confidenceTier === 'review' || c.confidenceTier === 'manual') || [];
    if (currentReviewIndex + 1 < reviewClusters.length) {
      setCurrentReviewIndex(prev => prev + 1);
    } else {
      setWizardPhase(3);
    }
  };

  const handleSkipCluster = async () => {
    // Get current review cluster and mark it as reviewed
    const reviewClusters = wizardClusters?.clusters.filter(c => c.confidenceTier === 'review' || c.confidenceTier === 'manual') || [];
    const currentCluster = reviewClusters[currentReviewIndex];
    
    if (currentCluster) {
      const churchIds = currentCluster.churches.map(c => c.id);
      try {
        await apiRequest("POST", `/api/admin/city-platforms/${platformId}/cleanup-duplicates`, {
          action: 'mark-reviewed',
          churchIds,
          decision: 'keep_all',
        });
        toast({ title: "Cluster marked as reviewed", description: "This cluster won't appear in future cleanup scans." });
      } catch (error: any) {
        console.error('[handleSkipCluster] Failed to mark cluster as reviewed:', error);
        toast({ 
          title: "Warning", 
          description: "Couldn't save review decision. This cluster may reappear.", 
          variant: "destructive" 
        });
      }
    }
    
    setWizardResults(prev => ({ ...prev, skipped: prev.skipped + 1 }));
    moveToNextCluster();
  };
  
  // Unreview cluster mutation
  const unreviewClusterMutation = useMutation({
    mutationFn: async (reviewedClusterId: string) => {
      return apiRequest("POST", `/api/admin/city-platforms/${platformId}/cleanup-duplicates`, {
        action: 'unreview-cluster',
        reviewedClusterId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/cleanup-duplicates`, 'reviewed'] });
      toast({ title: "Cluster re-enabled", description: "This cluster will appear in the next duplicate scan." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to unreview cluster", variant: "destructive" });
    },
  });

  const restoreArchivedMutation = useMutation({
    mutationFn: async (archivedId: string) => {
      return apiRequest("POST", `/api/admin/city-platforms/${platformId}/cleanup-duplicates`, { 
        action: 'restore-archived',
        archivedId 
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/cleanup-duplicates`, 'archived'] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/churches`] });
      toast({ 
        title: "Church restored", 
        description: `${data.churchName || 'Church'} has been restored to the platform.` 
      });
    },
    onError: (err: Error) => {
      toast({ title: "Restore failed", description: err.message, variant: "destructive" });
    },
  });

  // Verify churches with Google Places mutation
  const verifyWithGoogleMutation = useMutation({
    mutationFn: async ({ churchIds, skipGoogleMatch }: { churchIds?: string[]; skipGoogleMatch?: boolean } = {}) => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`/api/admin/city-platforms/${platformId}/verify-churches`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ churchIds, skipGoogleMatch }),
      });
      
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to verify churches');
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/churches`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/verification-summary`] });
      setVerificationResults(data.summary || null);
    },
    onError: (err: Error) => {
      toast({ title: "Verification failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSkipToReview = () => {
    const reviewClusters = wizardClusters?.clusters.filter(c => c.confidenceTier === 'review' || c.confidenceTier === 'manual') || [];
    if (reviewClusters.length > 0) {
      setWizardPhase(2);
    } else {
      setWizardPhase(3);
    }
  };

  const handleCloseWizard = () => {
    setShowCleanupWizard(false);
    setWizardClusters(null);
    setWizardPhase(1);
    setCurrentReviewIndex(0);
    setClusterOverrides({});
    // Clean up dedupe map
    dedupeMarkers.current.forEach(m => m.remove());
    dedupeMarkers.current = [];
    if (dedupeMap.current) {
      dedupeMap.current.remove();
      dedupeMap.current = null;
      setDedupeMapLoaded(false);
    }
  };

  // Dedupe map initialization for wizard phase 2
  useEffect(() => {
    if (!showCleanupWizard || wizardPhase !== 2 || !dedupeMapContainer.current || dedupeMap.current) return;
    
    mapboxgl.accessToken = MAPBOX_TOKEN;
    
    const center: [number, number] = data?.platform?.default_center_lng && data?.platform?.default_center_lat
      ? [data.platform.default_center_lng, data.platform.default_center_lat]
      : FALLBACK_CENTER;
    
    dedupeMap.current = new mapboxgl.Map({
      container: dedupeMapContainer.current,
      style: "mapbox://styles/mapbox/light-v11",
      center,
      zoom: 14,
    });
    
    dedupeMap.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    
    dedupeMap.current.on("load", () => {
      setDedupeMapLoaded(true);
    });
    
    return () => {
      dedupeMarkers.current.forEach(m => m.remove());
      dedupeMarkers.current = [];
      if (dedupeMap.current) {
        dedupeMap.current.remove();
        dedupeMap.current = null;
        setDedupeMapLoaded(false);
      }
    };
  }, [showCleanupWizard, wizardPhase, data?.platform?.default_center_lat, data?.platform?.default_center_lng]);

  // Update dedupe map markers when current review cluster changes
  useEffect(() => {
    if (!dedupeMap.current || !dedupeMapLoaded || wizardPhase !== 2) return;
    
    const reviewClusters = wizardClusters?.clusters.filter(c => c.confidenceTier === 'review' || c.confidenceTier === 'manual') || [];
    const currentCluster = reviewClusters[currentReviewIndex];
    if (!currentCluster) return;
    
    // Clear existing markers
    dedupeMarkers.current.forEach(m => m.remove());
    dedupeMarkers.current = [];
    
    const churchPoints: [number, number][] = [];
    
    // Get current overrides for this cluster
    const currentOverrides = clusterOverrides[currentCluster.clusterId] || {};
    
    // Find church coordinates from the main churches data
    currentCluster.churches.forEach((clusterChurch, index) => {
      const platformChurch = churches?.find(c => c.church?.id === clusterChurch.id);
      if (platformChurch?.church?.location?.coordinates) {
        const [lng, lat] = platformChurch.church.location.coordinates;
        churchPoints.push([lng, lat]);
        
        // Check if user has overridden this church's status
        const override = currentOverrides[clusterChurch.platformChurchId];
        const isSurvivorMarker = clusterChurch.platformChurchId === currentCluster.survivor.platformChurchId;
        const isKeep = override === 'keep' || (override === undefined && isSurvivorMarker);
        const el = document.createElement('div');
        el.className = 'dedupe-marker';
        el.style.width = '32px';
        el.style.height = '32px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = isKeep ? '#22C55E' : '#EF4444';
        el.style.border = '3px solid white';
        el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.color = 'white';
        el.style.fontWeight = 'bold';
        el.style.fontSize = '14px';
        el.textContent = String(index + 1);
        
        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(
          `<div class="p-2">
            <div class="font-medium text-sm">${clusterChurch.name}</div>
            <div class="text-xs text-gray-600">${clusterChurch.address}</div>
            <div class="text-xs mt-1">
              <span class="text-blue-600">Quality: ${clusterChurch.dataQualityScore}%</span> | 
              <span class="text-purple-600">${clusterChurch.source === 'google' ? 'Google' : 'OSM'}</span>
            </div>
          </div>`
        );
        
        const marker = new mapboxgl.Marker(el)
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(dedupeMap.current!);
        
        dedupeMarkers.current.push(marker);
      }
    });
    
    // Fit bounds to show all markers
    if (churchPoints.length > 0 && dedupeMap.current) {
      if (churchPoints.length === 1) {
        dedupeMap.current.setCenter(churchPoints[0]);
        dedupeMap.current.setZoom(15);
      } else {
        const allPoints: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: churchPoints.map(coords => ({
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: coords },
          })),
        };
        try {
          const bounds = bbox(allPoints);
          dedupeMap.current.fitBounds(
            [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
            { padding: 60, maxZoom: 16, duration: 500 }
          );
        } catch (e) {
          console.warn('Error fitting bounds:', e);
        }
      }
    }
  }, [dedupeMapLoaded, wizardPhase, currentReviewIndex, wizardClusters, churches, clusterOverrides]);

  // Map initialization
  const initializeMap = useCallback(() => {
    if (!mapContainer.current || map.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const center: [number, number] = data?.platform?.default_center_lng && data?.platform?.default_center_lat
      ? [data.platform.default_center_lng, data.platform.default_center_lat]
      : FALLBACK_CENTER;
    const zoom = DEFAULT_ZOOM;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/light-v11",
      center,
      zoom,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.current.on("load", () => {
      setMapLoaded(true);
    });
  }, [data?.platform?.default_center_lat, data?.platform?.default_center_lng]);

  useEffect(() => {
    if (data?.platform) {
      initializeMap();
    }

    return () => {
      markers.current.forEach(m => m.remove());
      markers.current = [];
      if (map.current) {
        map.current.remove();
        map.current = null;
        setMapLoaded(false);
      }
    };
  }, [initializeMap, data?.platform]);

  // Boundary layer effect
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    if (!map.current.isStyleLoaded()) return;

    const layers = ['platform-boundaries-fill', 'platform-boundaries-outline'];
    const sources = ['platform-boundaries'];

    try {
      layers.forEach(layer => {
        if (map.current?.getLayer(layer)) {
          map.current.removeLayer(layer);
        }
      });

      sources.forEach(source => {
        if (map.current?.getSource(source)) {
          map.current.removeSource(source);
        }
      });

      const features: GeoJSON.Feature[] = [];
      boundariesData?.boundaries?.forEach((b) => {
        if (b.boundary?.geometry) {
          features.push({
            type: "Feature",
            properties: {},
            geometry: b.boundary.geometry,
          });
        }
      });

      if (features.length > 0) {
        map.current.addSource('platform-boundaries', {
          type: 'geojson',
          data: { type: "FeatureCollection", features },
        });

        map.current.addLayer({
          id: 'platform-boundaries-fill',
          type: 'fill',
          source: 'platform-boundaries',
          paint: {
            'fill-color': '#3B82F6',
            'fill-opacity': 0.1,
          },
        });

        map.current.addLayer({
          id: 'platform-boundaries-outline',
          type: 'line',
          source: 'platform-boundaries',
          paint: {
            'line-color': '#2563EB',
            'line-width': 2,
          },
        });
      }
    } catch (error) {
      console.warn('Error adding boundary layers:', error);
    }
  }, [boundariesData?.boundaries, mapLoaded]);

  // Marker update effect
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    markers.current.forEach(m => m.remove());
    markers.current = [];

    let churchesToShow = (churches || []).filter(item => statusFilters[item.status]);
    
    // Apply verification category filter
    churchesToShow = churchesToShow.filter(item => {
      const rawStatus = item.church?.verification_status;
      const category = getVerificationCategory(rawStatus);
      return verificationFilters[category] ?? true;
    });
    
    if (showOnlySelected && selectedChurchIds.size > 0) {
      churchesToShow = churchesToShow.filter(item => item.church && selectedChurchIds.has(item.church.id));
    }

    const churchPoints: [number, number][] = [];

    churchesToShow.forEach(item => {
      if (item.church?.location?.coordinates) {
        const churchId = item.church.id;
        const [lng, lat] = item.church.location.coordinates;
        churchPoints.push([lng, lat]);

        const isSelected = selectedChurchIds.has(churchId);
        const el = document.createElement('div');
        el.className = 'church-marker';
        el.style.width = isSelected ? '28px' : '24px';
        el.style.height = isSelected ? '28px' : '24px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = STATUS_PIN_COLORS[item.status];
        el.style.border = isSelected ? '3px solid #2563EB' : '2px solid white';
        el.style.boxShadow = isSelected ? '0 0 0 2px white, 0 2px 8px rgba(0,0,0,0.4)' : '0 2px 4px rgba(0,0,0,0.3)';
        el.style.cursor = 'pointer';
        el.style.transition = 'all 0.15s ease';
        el.setAttribute('data-testid', `marker-church-${churchId}`);

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          setSelectedChurchIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(churchId)) {
              newSet.delete(churchId);
            } else {
              newSet.add(churchId);
            }
            return newSet;
          });
        });

        const marker = new mapboxgl.Marker(el)
          .setLngLat([lng, lat])
          .addTo(map.current!);

        markers.current.push(marker);
      }
    });

    const shouldFitBounds = churchPoints.length > 0 && (
      !hasInitialFitRef.current || 
      (showOnlySelected && selectedChurchIds.size > 0)
    );
    
    if (shouldFitBounds) {
      hasInitialFitRef.current = true;
      const allPoints: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: churchPoints.map(coords => ({
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: coords },
        })),
      };
      try {
        const bounds = bbox(allPoints);
        map.current.fitBounds(
          [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
          { padding: 50, maxZoom: 14, duration: 500 }
        );
      } catch (e) {
        console.warn("Could not fit bounds:", e);
      }
    }
  }, [churches, mapLoaded, selectedChurchIds, showOnlySelected, statusFilters, verificationFilters]);

  const handleDeleteClick = (platformChurch: PlatformChurch) => {
    setChurchToDelete({ id: platformChurch.church.id, name: platformChurch.church.name });
    setDeleteDialogOpen(true);
  };

  // Pagination for User Submissions tab
  const pendingChurches = useMemo(() => {
    return churches?.filter(pc => pc.status === 'pending' && pc.church) || [];
  }, [churches]);

  // Create set of church IDs (actual church UUIDs) in duplicate clusters
  const churchIdsInClustersSet = useMemo(() => {
    return new Set(duplicateClusterData?.churchIdsInClusters || []);
  }, [duplicateClusterData?.churchIdsInClusters]);

  // Filter pending churches into "clean" (not in any cluster) and "in clusters"
  const cleanPendingChurches = useMemo(() => {
    return pendingChurches.filter(pc => pc.church && !churchIdsInClustersSet.has(pc.church.id));
  }, [pendingChurches, churchIdsInClustersSet]);

  const pendingInClustersCount = useMemo(() => {
    return pendingChurches.filter(pc => pc.church && churchIdsInClustersSet.has(pc.church.id)).length;
  }, [pendingChurches, churchIdsInClustersSet]);

  const totalPages = Math.ceil(pendingChurches.length / PAGE_SIZE);
  const paginatedPendingChurches = pendingChurches.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
    setSelectedChurchIds(new Set());
  };

  // Selection for bulk approve in User Submissions
  const pendingOnCurrentPage = useMemo(() => {
    return paginatedPendingChurches;
  }, [paginatedPendingChurches]);

  const allPageSelected = useMemo(() => {
    if (pendingOnCurrentPage.length === 0) return false;
    return pendingOnCurrentPage.every(pc => selectedChurchIds.has(pc.church.id));
  }, [pendingOnCurrentPage, selectedChurchIds]);

  const somePageSelected = useMemo(() => {
    if (pendingOnCurrentPage.length === 0) return false;
    return pendingOnCurrentPage.some(pc => selectedChurchIds.has(pc.church.id));
  }, [pendingOnCurrentPage, selectedChurchIds]);

  const selectedCount = selectedChurchIds.size;

  const handleSelectAll = (checked: boolean) => {
    if (pendingOnCurrentPage.length === 0) return;
    if (checked) {
      const newSelected = new Set(selectedChurchIds);
      pendingOnCurrentPage.forEach(pc => newSelected.add(pc.church.id));
      setSelectedChurchIds(newSelected);
    } else {
      const newSelected = new Set(selectedChurchIds);
      pendingOnCurrentPage.forEach(pc => newSelected.delete(pc.church.id));
      setSelectedChurchIds(newSelected);
    }
  };

  const handleSelectOne = (churchId: string, checked: boolean) => {
    const newSelected = new Set(selectedChurchIds);
    if (checked) {
      newSelected.add(churchId);
    } else {
      newSelected.delete(churchId);
    }
    setSelectedChurchIds(newSelected);
  };

  const handleBulkApprove = () => {
    const idsToApprove = Array.from(selectedChurchIds);
    if (idsToApprove.length > 0) {
      bulkApproveMutation.mutate(idsToApprove);
    }
  };

  const handleStatusChange = (churchId: string, newStatus: ChurchPlatformStatus) => {
    updateChurchMutation.mutate({ church_id: churchId, status: newStatus });
  };

  const handleRemoveChurch = (churchId: string) => {
    updateChurchMutation.mutate({ church_id: churchId, remove: true });
  };

  const handleBulkStatusChange = (status: ChurchPlatformStatus) => {
    const ids = Array.from(selectedChurchIds);
    if (ids.length > 0) {
      bulkUpdateMutation.mutate({ church_ids: ids, status });
    }
  };

  if (!platformId) {
    return (
      <AdminLayout>
        <div className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold" data-testid="text-page-title">Church Management</h1>
            <p className="text-muted-foreground mt-2">
              Select a platform to manage churches
            </p>
          </div>
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Please select a platform from the platform switcher to view and manage churches.
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-4 md:p-8">
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-page-title">Church Management</h1>
          <p className="text-muted-foreground mt-1 md:mt-2 text-sm md:text-base">
            View and manage churches in {platform?.name || 'your platform'}
          </p>
        </div>

        {/* Data Quality Summary Panel */}
        <Collapsible open={summaryExpanded} onOpenChange={setSummaryExpanded} className="mb-6">
          <Card className="border-dashed">
            <CollapsibleTrigger asChild>
              <CardHeader className="py-3 cursor-pointer hover-elevate">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-medium">Data Quality Overview</CardTitle>
                  </div>
                  {summaryExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 pb-3">
                {summaryLoading ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <Skeleton key={i} className="h-16" />
                    ))}
                  </div>
                ) : summaryData?.summary ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="bg-muted/50 rounded-md p-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                        <MapPin className="h-3 w-3" />
                        <span>Total Churches</span>
                      </div>
                      <div className="text-xl font-bold" data-testid="text-total-churches">
                        {summaryData.summary.total.toLocaleString()}
                      </div>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-md p-3">
                      <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400 mb-1">
                        <CheckCircle2 className="h-3 w-3" />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help border-b border-dashed border-green-400" title="Matched with Google Places data">Google Verified</span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Churches verified by matching with Google Places API data.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="text-xl font-bold text-green-700 dark:text-green-400" data-testid="text-google-verified-count">
                        {(summaryData.summary.google_verified ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-md p-3">
                      <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-400 mb-1">
                        <UserCheck className="h-3 w-3" />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help border-b border-dashed border-blue-400">Auto/User Verified</span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Churches manually verified by admin or auto-verified based on high data quality scores.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="text-xl font-bold text-blue-700 dark:text-blue-400" data-testid="text-user-verified-count">
                        {(summaryData.summary.user_verified ?? 0).toLocaleString()}
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <div 
                          className={`rounded-md p-3 ${(summaryData.summary.not_verified_yet ?? 0) > 0 ? 'bg-purple-50 dark:bg-purple-900/20 cursor-pointer hover-elevate' : 'bg-muted/50'}`}
                          data-testid="card-not-verified"
                        >
                          <div className={`flex items-center gap-2 text-xs mb-1 ${(summaryData.summary.not_verified_yet ?? 0) > 0 ? 'text-purple-700 dark:text-purple-400' : 'text-muted-foreground'}`}>
                            <ShieldQuestion className="h-3 w-3" />
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`cursor-help border-b border-dashed ${(summaryData.summary.not_verified_yet ?? 0) > 0 ? 'border-purple-400' : 'border-muted-foreground'}`}>Not Verified</span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p>Churches that haven't been verified with Google yet. This includes uploaded churches that need to be cross-referenced with Google Places.</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className={`text-xl font-bold ${(summaryData.summary.not_verified_yet ?? 0) > 0 ? 'text-purple-700 dark:text-purple-400' : 'text-muted-foreground'}`} data-testid="text-not-verified-count">
                              {(summaryData.summary.not_verified_yet ?? 0).toLocaleString()}
                            </div>
                            {(summaryData.summary.not_verified_yet ?? 0) > 0 ? (
                              <Play className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                            )}
                          </div>
                        </div>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="max-w-lg">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Google Places Verification</AlertDialogTitle>
                          <AlertDialogDescription asChild>
                            <div className="space-y-2">
                              <p className="text-sm">Cross-references churches with Google Places to verify addresses, update contact info, and calculate data quality scores.</p>
                              <p className="text-xs text-muted-foreground">Cost: ~$0.03-0.05 per church (Google Places API)</p>
                            </div>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        
                        {/* Primary Action Section */}
                        <div className="space-y-3 py-2">
                          <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3">
                            <p className="text-sm text-green-800 dark:text-green-300 mb-3">
                              <strong>Recommended:</strong> Run this after importing new churches to verify them with Google Places.
                            </p>
                            <AlertDialogAction
                              onClick={() => {
                                const notVerifiedIds = churches
                                  ?.filter(c => !c.church?.verification_status)
                                  .map(c => c.church?.id)
                                  .filter(Boolean) as string[];
                                verifyWithGoogleMutation.mutate({ churchIds: notVerifiedIds });
                              }}
                              disabled={(summaryData.summary.not_verified_yet ?? 0) === 0}
                              className="w-full justify-between"
                              data-testid="button-verify-not-verified"
                            >
                              <span>Run on Not Verified ({summaryData.summary.not_verified_yet ?? 0})</span>
                              <span className="text-xs opacity-80">~${((summaryData.summary.not_verified_yet ?? 0) * 0.04).toFixed(2)}</span>
                            </AlertDialogAction>
                          </div>
                        </div>

                        {/* Separator */}
                        <div className="relative py-2">
                          <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                          </div>
                          <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">Re-run Options</span>
                          </div>
                        </div>

                        {/* Re-run Section */}
                        <div className="space-y-3">
                          <p className="text-xs text-muted-foreground">
                            Use these options to re-verify churches that have already been processed. Helpful for resolving flagged entries or refreshing outdated contact data.
                          </p>
                          {/* Manual Review Recommendation */}
                          {(summaryData?.breakdown?.last_verification?.needs_review || summaryData?.breakdown?.last_verification?.all) && (
                            <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3">
                              <p className="text-sm text-blue-800 dark:text-blue-300">
                                <strong>Tip:</strong> If verification was run recently, flagged churches are better resolved through{' '}
                                <AlertDialogCancel 
                                  className="inline p-0 h-auto font-semibold text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-800 dark:hover:text-blue-300 bg-transparent border-0"
                                  onClick={() => setTimeout(handleOpenReviewWizard, 100)}
                                >
                                  Manual Review
                                </AlertDialogCancel>
                                {' '}rather than re-running verification.
                              </p>
                            </div>
                          )}
                          <div className="grid gap-2">
                            <AlertDialogAction
                              onClick={() => {
                                const needsAttentionIds = churches
                                  ?.filter(c => {
                                    const verStatus = c.church?.verification_status;
                                    const qualityScore = c.church?.data_quality_score;
                                    return verStatus === 'flagged' || (qualityScore !== null && qualityScore < 30);
                                  })
                                  .map(c => c.church?.id)
                                  .filter(Boolean) as string[];
                                verifyWithGoogleMutation.mutate({ churchIds: needsAttentionIds });
                              }}
                              className="w-full justify-between bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 hover:bg-amber-200 dark:hover:bg-amber-800/50"
                              data-testid="button-verify-review-required-from-card"
                            >
                              <div className="flex flex-col items-start">
                                <span>Re-run on Needs Review ({summaryData?.summary?.needs_attention || 0})</span>
                                {summaryData?.breakdown?.last_verification?.needs_review && (
                                  <span className="text-xs opacity-70">Last run {formatDistanceToNow(new Date(summaryData.breakdown.last_verification.needs_review), { addSuffix: true })}</span>
                                )}
                              </div>
                              <span className="text-xs opacity-80">~${((summaryData?.summary?.needs_attention || 0) * 0.04).toFixed(2)}</span>
                            </AlertDialogAction>
                            <AlertDialogAction
                              onClick={() => verifyWithGoogleMutation.mutate({})}
                              className="w-full justify-between bg-secondary text-secondary-foreground hover:bg-secondary/80"
                              data-testid="button-verify-all-from-card"
                            >
                              <div className="flex flex-col items-start">
                                <span>Re-run Verify on All ({summaryData?.summary?.total || 0})</span>
                                {summaryData?.breakdown?.last_verification?.all && (
                                  <span className="text-xs opacity-70">Last run {formatDistanceToNow(new Date(summaryData.breakdown.last_verification.all), { addSuffix: true })}</span>
                                )}
                              </div>
                              <span className="text-xs opacity-80">~${((summaryData?.summary?.total || 0) * 0.04).toFixed(2)}</span>
                            </AlertDialogAction>
                          </div>
                        </div>

                        <AlertDialogFooter className="mt-4">
                          <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <div 
                      className="bg-amber-50 dark:bg-amber-900/20 rounded-md p-3 cursor-pointer hover-elevate"
                      onClick={handleOpenReviewWizard}
                      data-testid="card-review-required"
                    >
                      <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 mb-1">
                        <AlertTriangle className="h-3 w-3" />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help border-b border-dashed border-amber-400">Needs Review (All)</span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="mb-2">Total churches platform-wide that are flagged or have quality scores below 30%. Click to start reviewing.</p>
                            {summaryData?.breakdown?.needs_attention_by_platform_status && (
                              <div className="text-xs border-t pt-2 mt-1">
                                <p className="font-medium mb-1">Breakdown by status:</p>
                                <div className="space-y-0.5">
                                  <p>Visible: {summaryData.breakdown.needs_attention_by_platform_status.visible}</p>
                                  <p>Pending: {summaryData.breakdown.needs_attention_by_platform_status.pending}</p>
                                  <p>Hidden: {summaryData.breakdown.needs_attention_by_platform_status.hidden}</p>
                                  <p>Featured: {summaryData.breakdown.needs_attention_by_platform_status.featured}</p>
                                </div>
                              </div>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-xl font-bold text-amber-700 dark:text-amber-400" data-testid="text-review-required">
                          {summaryData.summary.needs_attention.toLocaleString()}
                        </div>
                        <Play className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      </div>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-md p-3">
                      <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-400 mb-1">
                        <BarChart3 className="h-3 w-3" />
                        <span>Avg Quality Score</span>
                      </div>
                      <div className="text-xl font-bold text-blue-700 dark:text-blue-400" data-testid="text-avg-quality">
                        {summaryData.summary.average_quality_score?.toFixed(1) || 'N/A'}%
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-2">
                    No quality data available
                  </div>
                )}
                {/* Verify with Google Action */}
                <div className="mt-4 pt-3 border-t">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={verifyWithGoogleMutation.isPending}
                        data-testid="button-verify-with-google"
                      >
                        {verifyWithGoogleMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Verifying...
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="h-4 w-4 mr-2" />
                            Verify with Google
                          </>
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="max-w-lg">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Google Places Verification</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div className="space-y-2">
                            <p className="text-sm">Cross-references churches with Google Places to verify addresses, update contact info, and calculate data quality scores.</p>
                            <p className="text-xs text-muted-foreground">Cost: ~$0.03-0.05 per church (Google Places API)</p>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      
                      {/* Primary Action Section */}
                      <div className="space-y-3 py-2">
                        <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3">
                          <p className="text-sm text-green-800 dark:text-green-300 mb-3">
                            <strong>Recommended:</strong> Run this after importing new churches to verify them with Google Places.
                          </p>
                          <AlertDialogAction
                            onClick={() => {
                              const notVerifiedIds = churches
                                ?.filter(c => !c.church?.verification_status)
                                .map(c => c.church?.id)
                                .filter(Boolean) as string[];
                              verifyWithGoogleMutation.mutate({ churchIds: notVerifiedIds });
                            }}
                            disabled={(summaryData?.summary?.not_verified_yet ?? 0) === 0}
                            className="w-full justify-between"
                            data-testid="button-verify-not-verified-main"
                          >
                            <span>Run on Not Verified ({summaryData?.summary?.not_verified_yet ?? 0})</span>
                            <span className="text-xs opacity-80">~${((summaryData?.summary?.not_verified_yet ?? 0) * 0.04).toFixed(2)}</span>
                          </AlertDialogAction>
                        </div>
                      </div>

                      {/* Separator */}
                      <div className="relative py-2">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-background px-2 text-muted-foreground">Re-run Options</span>
                        </div>
                      </div>

                      {/* Re-run Section */}
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Use these options to re-verify churches that have already been processed. Helpful for resolving flagged entries or refreshing outdated contact data.
                        </p>
                        {/* Manual Review Recommendation */}
                        {(summaryData?.breakdown?.last_verification?.needs_review || summaryData?.breakdown?.last_verification?.all) && (
                          <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3">
                            <p className="text-sm text-blue-800 dark:text-blue-300">
                              <strong>Tip:</strong> If verification was run recently, flagged churches are better resolved through{' '}
                              <AlertDialogCancel 
                                className="inline p-0 h-auto font-semibold text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-800 dark:hover:text-blue-300 bg-transparent border-0"
                                onClick={() => setTimeout(handleOpenReviewWizard, 100)}
                              >
                                Manual Review
                              </AlertDialogCancel>
                              {' '}rather than re-running verification.
                            </p>
                          </div>
                        )}
                        <div className="grid gap-2">
                          <AlertDialogAction
                            onClick={() => {
                              const needsAttentionIds = churches
                                ?.filter(c => {
                                  const verStatus = c.church?.verification_status;
                                  const qualityScore = c.church?.data_quality_score;
                                  return verStatus === 'flagged' || (qualityScore !== null && qualityScore < 30);
                                })
                                .map(c => c.church?.id)
                                .filter(Boolean) as string[];
                              verifyWithGoogleMutation.mutate({ churchIds: needsAttentionIds });
                            }}
                            className="w-full justify-between bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 hover:bg-amber-200 dark:hover:bg-amber-800/50"
                            data-testid="button-verify-review-required"
                          >
                            <div className="flex flex-col items-start">
                              <span>Re-run on Needs Review ({summaryData?.summary?.needs_attention || 0})</span>
                              {summaryData?.breakdown?.last_verification?.needs_review && (
                                <span className="text-xs opacity-70">Last run {formatDistanceToNow(new Date(summaryData.breakdown.last_verification.needs_review), { addSuffix: true })}</span>
                              )}
                            </div>
                            <span className="text-xs opacity-80">~${((summaryData?.summary?.needs_attention || 0) * 0.04).toFixed(2)}</span>
                          </AlertDialogAction>
                          <AlertDialogAction
                            onClick={() => verifyWithGoogleMutation.mutate({})}
                            className="w-full justify-between bg-secondary text-secondary-foreground hover:bg-secondary/80"
                            data-testid="button-verify-all"
                          >
                            <div className="flex flex-col items-start">
                              <span>Re-run Verify on All ({summaryData?.summary?.total || 0})</span>
                              {summaryData?.breakdown?.last_verification?.all && (
                                <span className="text-xs opacity-70">Last run {formatDistanceToNow(new Date(summaryData.breakdown.last_verification.all), { addSuffix: true })}</span>
                              )}
                            </div>
                            <span className="text-xs opacity-80">~${((summaryData?.summary?.total || 0) * 0.04).toFixed(2)}</span>
                          </AlertDialogAction>
                        </div>
                      </div>

                      <AlertDialogFooter className="mt-4">
                        <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="platform" data-testid="tab-platform-churches">Platform Churches</TabsTrigger>
            <TabsTrigger value="submissions" data-testid="tab-user-submissions">
              User Submissions
              {pendingClaimsCount > 0 && (
                <Badge variant="secondary" className="ml-2 bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200">
                  {pendingClaimsCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="ingestion" data-testid="tab-data-ingestion">
              Data Ingestion
              {pendingCount > 0 && (
                <Badge variant="secondary" className="ml-2 bg-yellow-200 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200">
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* TAB 3: Data Ingestion */}
          <TabsContent value="ingestion">
            <Card>
              <CardHeader>
                <CardTitle>Google Places Import & Cleanup</CardTitle>
                <CardDescription>
                  Import churches from Google Places and manage duplicate cleanup
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Import Controls */}
                <div className="flex items-center gap-2 flex-wrap mb-6">
                  {canUseGoogleImport && (
                    incompleteJob ? (
                      <>
                        <Button
                          variant={incompleteJob.status === 'running' ? 'outline' : 'default'}
                          size="sm"
                          onClick={() => {
                            if (incompleteJob.status === 'running') {
                              setShowImportProgress(true);
                            } else {
                              importMutation.mutate({ resume: true });
                            }
                          }}
                          disabled={importMutation.isPending || clearImportsMutation.isPending}
                          data-testid="button-resume-import"
                        >
                          {importMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Resuming...
                            </>
                          ) : incompleteJob.status === 'running' ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              View Progress
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-2" />
                              Resume Import
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => importMutation.mutate({ startFresh: true })}
                          disabled={importMutation.isPending || clearImportsMutation.isPending}
                          data-testid="button-start-fresh"
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Start Fresh
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowImportConfirmation(true)}
                        disabled={importMutation.isPending || clearImportsMutation.isPending}
                        data-testid="button-import-churches"
                      >
                        {importMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Importing...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4 mr-2" />
                            Import from Google
                          </>
                        )}
                      </Button>
                    )
                  )}
                  
                  {/* Import Confirmation Dialog */}
                  <AlertDialog open={showImportConfirmation} onOpenChange={setShowImportConfirmation}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <Download className="h-5 w-5 text-primary" />
                          Start Google Places Import?
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div className="space-y-3">
                            <p>
                              This will search Google Places for churches within your platform boundaries.
                            </p>
                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-amber-800 dark:text-amber-200 text-sm">
                              <strong>Cost Warning:</strong> Google Places API charges ~$0.04 per church found. 
                              A typical import may cost $5-50 depending on your area size.
                            </div>
                            <div className="text-sm space-y-1">
                              <p className="font-medium">The import process:</p>
                              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                                <li>Search Google Places for churches in your boundaries</li>
                                <li>Filter out churches outside platform boundaries</li>
                                <li>Remove duplicates of existing churches</li>
                                <li>Insert new churches into your platform</li>
                              </ol>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              The import may take 4-5 minutes. Import runs in the background — you can navigate away.
                            </p>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel data-testid="button-cancel-import">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            setShowImportConfirmation(false);
                            importMutation.mutate({});
                          }}
                          data-testid="button-confirm-import"
                        >
                          Start Import
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    data-testid="button-spreadsheet-import"
                  >
                    <Link href="/admin/spreadsheet-compare">
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Spreadsheet Import
                    </Link>
                  </Button>
                </div>

                {/* Verification Results Dialog */}
                <Dialog open={!!verificationResults} onOpenChange={() => setVerificationResults(null)}>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        Verification Complete
                      </DialogTitle>
                      <DialogDescription>
                        Here's a summary of the verification results:
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-3 py-4">
                      <div className="bg-muted/50 rounded-md p-3 text-center">
                        <div className="text-2xl font-bold">{verificationResults?.total || 0}</div>
                        <div className="text-xs text-muted-foreground">Churches Processed</div>
                      </div>
                      <div className="bg-green-50 dark:bg-green-900/20 rounded-md p-3 text-center">
                        <div className="text-2xl font-bold text-green-700 dark:text-green-400">{verificationResults?.verified || 0}</div>
                        <div className="text-xs text-green-600 dark:text-green-500">Verified</div>
                      </div>
                      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-md p-3 text-center">
                        <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{verificationResults?.flagged_for_review || 0}</div>
                        <div className="text-xs text-amber-600 dark:text-amber-500">Flagged for Review</div>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-3 text-center">
                        <div className="text-2xl font-bold text-gray-700 dark:text-gray-400">{verificationResults?.unverified || 0}</div>
                        <div className="text-xs text-gray-600 dark:text-gray-500">Unverified</div>
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-md p-3 text-center">
                        <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{verificationResults?.enriched || 0}</div>
                        <div className="text-xs text-blue-600 dark:text-blue-500">Data Enriched</div>
                      </div>
                      {(verificationResults?.errors || 0) > 0 && (
                        <div className="bg-red-50 dark:bg-red-900/20 rounded-md p-3 text-center">
                          <div className="text-2xl font-bold text-red-700 dark:text-red-400">{verificationResults?.errors || 0}</div>
                          <div className="text-xs text-red-600 dark:text-red-500">Errors</div>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button onClick={() => setVerificationResults(null)} data-testid="button-close-verification-results">
                        Close
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Warning banner for import */}
                <Alert className="mb-4 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30" data-testid="alert-import-warning">
                  <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <AlertDescription className="text-blue-700 dark:text-blue-300">
                    Google Places import may take 4-5 minutes. Import runs in the background — you can navigate away until the import completes.
                  </AlertDescription>
                </Alert>

                {/* Import History Section */}
                <Collapsible
                  open={importHistoryOpen}
                  onOpenChange={setImportHistoryOpen}
                  className="mb-6"
                >
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex items-center gap-2 w-full justify-start p-2 mb-2"
                      data-testid="button-toggle-import-history"
                    >
                      <History className="h-4 w-4" />
                      <span className="font-medium">Google Import History</span>
                      {importJobs.length > 0 && (
                        <Badge variant="secondary" className="ml-2">
                          {importJobs.length}
                        </Badge>
                      )}
                      <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${importHistoryOpen ? 'rotate-180' : ''}`} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="rounded-lg border p-4 space-y-3" data-testid="import-history-list">
                      {incompleteJob && (
                        <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" data-testid="incomplete-job-banner">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge 
                                variant="outline" 
                                className={
                                  incompleteJob.status === 'running' 
                                    ? 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700'
                                    : 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700'
                                }
                              >
                                {incompleteJob.status === 'running' ? (
                                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Running</>
                                ) : (
                                  <><AlertTriangle className="h-3 w-3 mr-1" /> Interrupted</>
                                )}
                              </Badge>
                              <span className="text-sm text-muted-foreground">
                                Started {new Date(incompleteJob.started_at).toLocaleString()}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                onClick={() => importMutation.mutate({ resume: true })}
                                disabled={importMutation.isPending}
                                data-testid="button-resume-incomplete"
                              >
                                <Play className="h-3 w-3 mr-1" />
                                Resume
                              </Button>
                              {incompleteJob.status === 'interrupted' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => cancelJobMutation.mutate()}
                                  disabled={cancelJobMutation.isPending || importMutation.isPending}
                                  className="text-destructive hover:text-destructive"
                                  data-testid="button-dismiss-job"
                                >
                                  {cancelJobMutation.isPending ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <X className="h-3 w-3" />
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span>Progress</span>
                              <span>{incompleteJob.grid_points_completed}/{incompleteJob.grid_points_total} grid points</span>
                            </div>
                            <Progress 
                              value={(incompleteJob.grid_points_completed / incompleteJob.grid_points_total) * 100} 
                              className="h-2"
                              data-testid="progress-incomplete-job"
                            />
                          </div>
                        </div>
                      )}
                      
                      {importJobs.slice(0, 5).map((job) => (
                        <div key={job.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30" data-testid={`import-job-${job.id}`}>
                          <div className="flex items-center gap-3">
                            <Badge 
                              variant="outline"
                              className={
                                job.status === 'completed' 
                                  ? 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700'
                                  : job.status === 'failed'
                                  ? 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700'
                                  : job.status === 'running'
                                  ? 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700'
                                  : 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700'
                              }
                            >
                              {job.status === 'completed' && <Check className="h-3 w-3 mr-1" />}
                              {job.status === 'failed' && <X className="h-3 w-3 mr-1" />}
                              {job.status === 'running' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                              {job.status === 'interrupted' && <AlertTriangle className="h-3 w-3 mr-1" />}
                              {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                            </Badge>
                            <div className="text-sm">
                              <span className="text-muted-foreground">
                                {new Date(job.started_at).toLocaleString()}
                              </span>
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {job.status === 'completed' ? (
                              <span>
                                {job.churches_inserted} new, {job.duplicates_skipped} duplicates, {job.churches_outside_boundaries} outside boundaries
                              </span>
                            ) : job.status === 'failed' ? (
                              <span className="text-red-600 dark:text-red-400">{job.error_message || 'Unknown error'}</span>
                            ) : (
                              <span>{job.grid_points_completed}/{job.grid_points_total} grid points</span>
                            )}
                          </div>
                        </div>
                      ))}
                      
                      {importJobs.length === 0 && !incompleteJob && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No import history yet
                        </p>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Duplicates & Cleanup Section */}
                <div className="mt-6 mb-4">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-muted-foreground" />
                      <h3 className="font-semibold">Duplicates & Cleanup</h3>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleOpenCleanupWizard}
                      data-testid="button-clean-duplicates"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Clean Duplicates
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Find and resolve duplicate church records, manage archived and hidden churches
                  </p>
                </div>

                {/* Reviewed Clusters Section */}
                <Collapsible
                  open={showReviewedClusters}
                  onOpenChange={setShowReviewedClusters}
                  className="mb-6"
                >
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex items-center gap-2 w-full justify-start p-2 mb-2"
                      data-testid="button-toggle-reviewed-clusters"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="font-medium">Reviewed Clusters</span>
                      {reviewedClustersData?.count ? (
                        <Badge variant="secondary" className="ml-2">
                          {reviewedClustersData.count}
                        </Badge>
                      ) : null}
                      <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${showReviewedClusters ? 'rotate-180' : ''}`} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="rounded-lg border p-4 space-y-3" data-testid="reviewed-clusters-list">
                      {reviewedClustersLoading && (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      
                      {!reviewedClustersLoading && reviewedClustersData?.reviewed?.map((cluster) => {
                        const clusterChurchNames = cluster.church_ids.map(id => {
                          const church = churches?.find(c => c.church?.id === id);
                          return church?.church?.name || id.slice(0, 8) + '...';
                        });
                        
                        return (
                          <div 
                            key={cluster.id} 
                            className="flex items-start justify-between p-3 rounded-lg border bg-muted/30"
                            data-testid={`reviewed-cluster-${cluster.id}`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700">
                                  {cluster.decision === 'keep_all' ? 'Keep All' : cluster.decision}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  Reviewed {new Date(cluster.reviewed_at).toLocaleDateString()}
                                </span>
                              </div>
                              <div className="mt-2 text-sm">
                                <span className="font-medium">Churches:</span>{' '}
                                <span className="text-muted-foreground">
                                  {clusterChurchNames.slice(0, 3).join(', ')}
                                  {clusterChurchNames.length > 3 && ` +${clusterChurchNames.length - 3} more`}
                                </span>
                              </div>
                              {cluster.notes && (
                                <p className="mt-1 text-xs text-muted-foreground">{cluster.notes}</p>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => unreviewClusterMutation.mutate(cluster.id)}
                              disabled={unreviewClusterMutation.isPending}
                              className="ml-2 shrink-0"
                              data-testid={`button-unreview-${cluster.id}`}
                            >
                              {unreviewClusterMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                              <span className="ml-1">Re-check</span>
                            </Button>
                          </div>
                        );
                      })}
                      
                      {!reviewedClustersLoading && (!reviewedClustersData?.reviewed || reviewedClustersData.reviewed.length === 0) && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No reviewed clusters yet. Skip clusters in the Cleanup Wizard to mark them as reviewed.
                        </p>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Archived Churches Section */}
                <Collapsible
                  open={showArchivedChurches}
                  onOpenChange={setShowArchivedChurches}
                  className="mb-6"
                >
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex items-center gap-2 w-full justify-start p-2 mb-2"
                      data-testid="button-toggle-archived-churches"
                    >
                      <Archive className="h-4 w-4" />
                      <span className="font-medium">Archived Churches</span>
                      {archivedChurchesData?.count ? (
                        <Badge variant="secondary" className="ml-2">
                          {archivedChurchesData.count}
                        </Badge>
                      ) : null}
                      <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${showArchivedChurches ? 'rotate-180' : ''}`} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="rounded-lg border p-4 space-y-3" data-testid="archived-churches-list">
                      {archivedChurchesLoading && (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      
                      {!archivedChurchesLoading && archivedChurchesData?.archived?.map((church) => (
                        <div 
                          key={church.id} 
                          className="flex items-start justify-between p-3 rounded-lg border bg-muted/30"
                          data-testid={`archived-church-${church.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{church.name}</span>
                              <Badge variant="outline" className="text-[10px]">
                                {church.source === 'google' ? 'Google' : church.source || 'Unknown'}
                              </Badge>
                            </div>
                            {church.address && (
                              <p className="text-sm text-muted-foreground mt-1">{church.address}</p>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                              <span>Archived: {new Date(church.archived_at).toLocaleDateString()}</span>
                              <span>Reason: {church.archived_reason || 'duplicate_resolution'}</span>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => restoreArchivedMutation.mutate(church.id)}
                            disabled={restoreArchivedMutation.isPending}
                            className="ml-2 shrink-0"
                            data-testid={`button-restore-${church.id}`}
                          >
                            {restoreArchivedMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                            <span className="ml-1">Restore</span>
                          </Button>
                        </div>
                      ))}
                      
                      {!archivedChurchesLoading && (!archivedChurchesData?.archived || archivedChurchesData.archived.length === 0) && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No archived churches. Churches hidden during duplicate cleanup will appear here.
                        </p>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {/* Pending Imported Churches */}
                {pendingCount > 0 && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                        <h3 className="font-semibold">Pending Imported Churches</h3>
                        <Badge variant="secondary" className="ml-2 bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200">
                          {pendingCount}
                        </Badge>
                        {pendingInClustersCount > 0 && (
                          <span className="text-sm text-muted-foreground">
                            ({cleanPendingChurches.length} clean, {pendingInClustersCount} in duplicate clusters)
                          </span>
                        )}
                      </div>
                      {cleanPendingChurches.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const cleanIds = cleanPendingChurches.map(pc => pc.church.id);
                            bulkApproveMutation.mutate(cleanIds);
                          }}
                          disabled={bulkApproveMutation.isPending}
                          data-testid="button-approve-all-clean"
                          className="text-green-600 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-900/30"
                        >
                          {bulkApproveMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                          )}
                          Approve All Clean ({cleanPendingChurches.length})
                        </Button>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Imported churches waiting for approval
                      {pendingInClustersCount > 0 && (
                        <span className="ml-1">
                          • Churches in duplicate clusters should be reviewed via the Duplicate Cleanup Wizard first
                        </span>
                      )}
                    </p>
                    
                    {selectedCount > 0 && (
                      <div className="flex items-center justify-between p-3 mb-4 rounded-lg bg-primary/10 border border-primary/20">
                        <div className="flex items-center gap-2">
                          <CheckSquare className="h-5 w-5 text-primary" />
                          <span className="font-medium text-sm">
                            {selectedCount} church{selectedCount !== 1 ? 'es' : ''} selected
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={handleBulkApprove}
                            disabled={bulkApproveMutation.isPending}
                            data-testid="button-bulk-approve"
                          >
                            {bulkApproveMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4 mr-2" />
                            )}
                            Approve Selected
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedChurchIds(new Set())}
                            data-testid="button-clear-selection"
                          >
                            Clear Selection
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="rounded-md border overflow-x-auto">
                      <Table className="min-w-[600px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">
                              <Checkbox
                                checked={allPageSelected}
                                onCheckedChange={(checked) => handleSelectAll(!!checked)}
                                disabled={pendingOnCurrentPage.length === 0}
                                aria-label="Select all pending churches on page"
                                data-testid="checkbox-select-all"
                                className={somePageSelected && !allPageSelected ? "data-[state=unchecked]:bg-primary/30" : ""}
                              />
                            </TableHead>
                            <TableHead>Church Name</TableHead>
                            <TableHead className="hidden sm:table-cell">Location</TableHead>
                            <TableHead className="hidden md:table-cell">Source</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedPendingChurches.map((pc) => (
                            <TableRow 
                              key={pc.id} 
                              data-testid={`row-pending-${pc.church.id}`}
                              className={selectedChurchIds.has(pc.church.id) ? "bg-primary/5" : ""}
                            >
                              <TableCell>
                                <Checkbox
                                  checked={selectedChurchIds.has(pc.church.id)}
                                  onCheckedChange={(checked) => handleSelectOne(pc.church.id, !!checked)}
                                  aria-label={`Select ${pc.church.name}`}
                                  data-testid={`checkbox-pending-${pc.church.id}`}
                                />
                              </TableCell>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  {pc.church.name}
                                  {churchIdsInClustersSet.has(pc.id) && (
                                    <Badge 
                                      variant="outline" 
                                      className="text-[10px] px-1.5 py-0 h-5 bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700"
                                      data-testid={`badge-in-cluster-${pc.church.id}`}
                                    >
                                      <AlertTriangle className="h-3 w-3 mr-1" />
                                      In Cluster
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="hidden sm:table-cell">
                                <div className="flex items-start gap-1 text-sm text-muted-foreground">
                                  <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                                  <span>
                                    {pc.church.city && pc.church.state 
                                      ? `${pc.church.city}, ${pc.church.state}`
                                      : pc.church.address || "-"}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                <span className="text-sm text-muted-foreground capitalize">
                                  {pc.church.source?.replace(/_/g, ' ') || 'manual'}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-green-600 border-green-300 hover:bg-green-50"
                                    onClick={() => approveMutation.mutate(pc.church.id)}
                                    disabled={approveMutation.isPending || rejectMutation.isPending}
                                    data-testid={`button-approve-${pc.church.id}`}
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-600 border-red-300 hover:bg-red-50"
                                    onClick={() => rejectMutation.mutate(pc.church.id)}
                                    disabled={approveMutation.isPending || rejectMutation.isPending}
                                    data-testid={`button-reject-${pc.church.id}`}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem asChild>
                                        <Link href={getChurchUrl(pc.church.id)}>
                                          <Pencil className="h-4 w-4 mr-2" />
                                          View/Edit Profile
                                        </Link>
                                      </DropdownMenuItem>
                                      <DropdownMenuItem asChild>
                                        <a href={getChurchUrl(pc.church.id)} target="_blank" rel="noopener noreferrer">
                                          <ExternalLink className="h-4 w-4 mr-2" />
                                          Open in New Tab
                                        </a>
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t">
                        <div className="text-sm text-muted-foreground">
                          Showing {((currentPage - 1) * PAGE_SIZE) + 1} - {Math.min(currentPage * PAGE_SIZE, pendingChurches.length)} of {pendingChurches.length}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            data-testid="button-prev-page"
                          >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Previous
                          </Button>
                          <span className="text-sm px-2">
                            Page {currentPage} of {totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            data-testid="button-next-page"
                          >
                            Next
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 1: Platform Churches */}
          <TabsContent value="platform">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Map Section */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-lg">Church Map</CardTitle>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" data-testid="button-boundary-tools">
                          <Settings2 className="h-4 w-4 mr-2" />
                          Boundary Tools
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => boundaryCleanupMutation.mutate('hide-out-of-bounds')}
                          disabled={boundaryCleanupMutation.isPending}
                          data-testid="button-hide-out-of-bounds"
                        >
                          <EyeOff className="h-4 w-4 mr-2" />
                          Hide Out-of-Bounds
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => boundaryCleanupMutation.mutate('unhide-all')}
                          disabled={boundaryCleanupMutation.isPending}
                          data-testid="button-unhide-all"
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Unhide All Hidden
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => boundaryCleanupMutation.mutate('review-hidden-in-bounds')}
                          disabled={boundaryCleanupMutation.isPending}
                          data-testid="button-review-hidden"
                        >
                          <MapPin className="h-4 w-4 mr-2" />
                          Review Hidden In Bounds
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  <div 
                    ref={mapContainer} 
                    className="h-[400px] rounded-lg overflow-hidden border"
                    data-testid="map-container"
                  />
                </CardContent>
              </Card>

              {/* Church List Section */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-lg">Churches ({filteredChurches.length}{searchTerm ? ` of ${churches?.length || 0}` : ''})</CardTitle>
                    {selectedChurchIds.size > 0 && (
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{selectedChurchIds.size} selected</Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" data-testid="button-bulk-actions">
                              Bulk Actions
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleBulkStatusChange('visible')}>
                              <Check className="h-4 w-4 mr-2" />
                              Set Visible
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleBulkStatusChange('pending')}>
                              <Clock className="h-4 w-4 mr-2" />
                              Set Pending
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleBulkStatusChange('hidden')}>
                              <EyeOff className="h-4 w-4 mr-2" />
                              Set Hidden
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setSelectedChurchIds(new Set())}>
                              Clear Selection
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                  {/* Status Filters */}
                  <div className="flex items-center gap-2 flex-wrap mt-3">
                    <span className="text-xs text-muted-foreground font-medium">Status:</span>
                    {(Object.keys(STATUS_COLORS) as ChurchPlatformStatus[]).map((status) => (
                      <Badge
                        key={status}
                        variant="outline"
                        className={`cursor-pointer transition-opacity ${
                          statusFilters[status] 
                            ? `${STATUS_COLORS[status].bg} ${STATUS_COLORS[status].text}` 
                            : 'opacity-50'
                        }`}
                        onClick={() => setStatusFilters(prev => ({ ...prev, [status]: !prev[status] }))}
                        data-testid={`filter-${status}`}
                      >
                        {STATUS_COLORS[status].label}
                        <span className="ml-1">({statusCounts[status]})</span>
                      </Badge>
                    ))}
                  </div>
                  {/* Verification Status Filters */}
                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    <span className="text-xs text-muted-foreground font-medium">Quality:</span>
                    {(['google_verified', 'user_verified', 'needs_review', 'google_not_found'] as VerificationCategory[]).map((category) => {
                      const config = VERIFICATION_CATEGORY_CONFIG[category];
                      const count = verificationCounts[category] || 0;
                      const isActive = verificationFilters[category];
                      return (
                        <Tooltip key={category}>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="outline"
                              className={`cursor-pointer transition-opacity ${
                                isActive 
                                  ? `${config.bg} ${config.text}` 
                                  : 'opacity-50'
                              }`}
                              onClick={() => {
                                setVerificationFilters(prev => ({ ...prev, [category]: !prev[category] }));
                              }}
                              data-testid={`filter-verification-${category}`}
                            >
                              {config.label}
                              <span className="ml-1">({count})</span>
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <p className="text-xs">{config.tooltip}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                  {/* Search Input */}
                  <div className="relative mt-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search churches by name, address, or city..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                      data-testid="input-search-churches"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-[350px] overflow-y-auto space-y-2">
                    {isLoading ? (
                      [...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))
                    ) : filteredChurches.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No churches match the current filters
                      </p>
                    ) : (
                      filteredChurches.map((item) => (
                        <div
                          key={item.id}
                          className={`p-3 rounded-lg border flex items-center gap-2 cursor-pointer transition-colors hover:bg-muted/50 ${
                            selectedChurchIds.has(item.church.id) ? 'ring-2 ring-primary bg-primary/5' : ''
                          }`}
                          onClick={() => {
                            setSelectedChurchIds(prev => {
                              const newSet = new Set(prev);
                              if (newSet.has(item.church.id)) {
                                newSet.delete(item.church.id);
                              } else {
                                newSet.add(item.church.id);
                              }
                              return newSet;
                            });
                          }}
                          data-testid={`church-item-${item.church.id}`}
                        >
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: STATUS_PIN_COLORS[item.status] }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{item.church.name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {item.church.address || `${item.church.city}, ${item.church.state}`}
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleStatusChange(item.church.id, 'visible')}>
                                <Check className="h-4 w-4 mr-2" />
                                Set Visible
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusChange(item.church.id, 'pending')}>
                                <Clock className="h-4 w-4 mr-2" />
                                Set Pending
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusChange(item.church.id, 'hidden')}>
                                <EyeOff className="h-4 w-4 mr-2" />
                                Set Hidden
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusChange(item.church.id, 'featured')}>
                                <Sparkles className="h-4 w-4 mr-2" />
                                Set Featured
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild>
                                <Link href={getChurchUrl(item.church.id)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit Profile
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                className="text-destructive"
                                onClick={() => handleRemoveChurch(item.church.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Remove from Platform
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* TAB 2: User Submissions */}
          <TabsContent value="submissions">
            <div className="space-y-6">
              {/* Pending Church Claims */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <CardTitle>Pending Church Claims</CardTitle>
                    {pendingClaimsCount > 0 && (
                      <Badge variant="secondary" className="ml-2 bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-200">
                        {pendingClaimsCount}
                      </Badge>
                    )}
                  </div>
                  <CardDescription>
                    Users requesting to claim churches in your platform
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {pendingClaimsCount === 0 || !Array.isArray(pendingClaims) ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No pending church claims
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {pendingClaims.map((claim) => (
                        <div key={claim.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{claim.church?.name || 'Unknown Church'}</p>
                            <p className="text-sm text-muted-foreground truncate">
                              {claim.user?.full_name || claim.user?.email || 'Unknown User'}{claim.role_at_church ? ` • ${claim.role_at_church}` : ''}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/admin/city-platforms/${platformId}/church-claims`)}
                            data-testid={`button-review-claim-${claim.id}`}
                          >
                            Review
                          </Button>
                        </div>
                      ))}
                      {pendingClaimsCount > 5 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          onClick={() => navigate(`/admin/city-platforms/${platformId}/church-claims`)}
                          data-testid="button-view-all-claims"
                        >
                          View all {pendingClaimsCount} claims
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {churchToDelete && (
          <DeleteChurchDialog
            churchId={churchToDelete.id}
            churchName={churchToDelete.name}
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            onDeleted={() => setChurchToDelete(null)}
          />
        )}

        <ImportProgressDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          importJob={importMutation.isPending && !activeJobId ? null : currentDialogJob}
          isLoading={importMutation.isPending}
          onResume={() => importMutation.mutate({ resume: true })}
          onStartFresh={() => importMutation.mutate({ startFresh: true })}
          onClose={() => {
            setImportDialogOpen(false);
            setActiveJobId(null);
            queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/churches`] });
          }}
        />

        {/* Duplicate Cleanup Wizard Dialog */}
        <Dialog open={showCleanupWizard} onOpenChange={(open) => !open && handleCloseWizard()}>
          <DialogContent className="w-[90vw] max-w-xl sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                {wizardPhase === 1 && "Duplicate Cleanup Wizard"}
                {wizardPhase === 2 && "Review Duplicates"}
                {wizardPhase === 3 && "Cleanup Complete"}
              </DialogTitle>
              <DialogDescription>
                {wizardPhase === 1 && "Automatically clean up duplicate church records"}
                {wizardPhase === 2 && "Choose which record to keep for each cluster"}
                {wizardPhase === 3 && "Summary of cleanup actions taken"}
              </DialogDescription>
            </DialogHeader>
            
            <ScrollArea className="flex-1 min-h-0 pr-4">
              {wizardLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-purple-500 mb-4" />
                  <p className="text-sm text-muted-foreground">Analyzing duplicate clusters...</p>
                </div>
              ) : wizardPhase === 1 && wizardClusters ? (
                <div className="space-y-4">
                  <Card className="bg-muted/30">
                    <CardContent className="py-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-foreground">
                          {wizardClusters.summary.totalClusters} duplicate clusters
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {wizardClusters.summary.totalDuplicatesToHide} records can be hidden
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 mt-4">
                        <div className="text-center">
                          <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                            {wizardClusters.summary.autoResolvable}
                          </div>
                          <div className="text-xs text-muted-foreground">High Confidence</div>
                          <div className="text-[10px] text-muted-foreground/70">Auto-selected best</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-semibold text-yellow-600 dark:text-yellow-400">
                            {wizardClusters.summary.needsReview}
                          </div>
                          <div className="text-xs text-muted-foreground">Likely Duplicates</div>
                          <div className="text-[10px] text-muted-foreground/70">50-80% match</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-semibold text-orange-600 dark:text-orange-400">
                            {wizardClusters.summary.needsManual}
                          </div>
                          <div className="text-xs text-muted-foreground">Possible Dup.</div>
                          <div className="text-[10px] text-muted-foreground/70">May be different</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {wizardClusters.summary.autoResolvable > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">High Confidence clusters (click to adjust):</h4>
                      <p className="text-xs text-muted-foreground">Toggle individual records to Keep or Hide. Green = Keep, Red = Hide.</p>
                      <ScrollArea className="h-[500px]">
                        <div className="space-y-2 pr-4">
                          {wizardClusters.clusters
                            .filter(c => c.confidenceTier === 'auto')
                            .map((cluster) => {
                              const isExpanded = expandedSampleClusters.has(cluster.clusterId);
                              const overrides = clusterOverrides[cluster.clusterId] || {};
                              
                              const getRecordState = (church: CleanupChurchRecord): 'keep' | 'hide' => {
                                if (overrides[church.platformChurchId]) {
                                  return overrides[church.platformChurchId];
                                }
                                return church.platformChurchId === cluster.survivor.platformChurchId ? 'keep' : 'hide';
                              };
                              
                              const keepCount = cluster.churches.filter(c => getRecordState(c) === 'keep').length;
                              const hideCount = cluster.churches.filter(c => getRecordState(c) === 'hide').length;
                              
                              return (
                                <Collapsible 
                                  key={cluster.clusterId}
                                  open={isExpanded}
                                  onOpenChange={(open) => {
                                    setExpandedSampleClusters(prev => {
                                      const next = new Set(prev);
                                      if (open) next.add(cluster.clusterId);
                                      else next.delete(cluster.clusterId);
                                      return next;
                                    });
                                  }}
                                >
                                  <Card className="p-3">
                                    <CollapsibleTrigger className="w-full text-left">
                                      <div className="flex items-center gap-3">
                                        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                                        <div className="flex-1 min-w-0">
                                          <span className="font-medium text-sm truncate">{cluster.survivor.name}</span>
                                          <div className="text-xs text-muted-foreground truncate mt-0.5">
                                            {cluster.survivor.address} • {cluster.churches.length} records
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                          <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-[10px]">
                                            Keep {keepCount}
                                          </Badge>
                                          <Badge variant="secondary" className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-[10px]">
                                            Hide {hideCount}
                                          </Badge>
                                        </div>
                                      </div>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                      <div className="mt-3 space-y-2 border-t pt-3">
                                        {cluster.churches.map((church) => {
                                          const state = getRecordState(church);
                                          const isKeep = state === 'keep';
                                          const isSurvivor = church.platformChurchId === cluster.survivor.platformChurchId;
                                          return (
                                            <div key={church.id} className="flex items-center gap-2">
                                              <Button
                                                size="sm"
                                                variant={isKeep ? "default" : "outline"}
                                                className={`h-7 text-xs shrink-0 ${isKeep 
                                                  ? 'bg-green-600 hover:bg-green-700' 
                                                  : 'border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950'}`}
                                                onClick={() => {
                                                  setClusterOverrides(prev => ({
                                                    ...prev,
                                                    [cluster.clusterId]: {
                                                      ...prev[cluster.clusterId],
                                                      [church.platformChurchId]: isKeep ? 'hide' : 'keep',
                                                    },
                                                  }));
                                                }}
                                                data-testid={`button-toggle-${church.id}`}
                                              >
                                                {isKeep ? 'Keep' : 'Hide'}
                                              </Button>
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  <span className={`text-sm truncate ${!isKeep ? 'text-muted-foreground line-through' : ''}`}>
                                                    {church.name}
                                                  </span>
                                                  <Badge variant="outline" className="text-[10px]">
                                                    {church.source === 'google' ? 'Google' : 'OSM'}
                                                  </Badge>
                                                  {isSurvivor && !overrides[church.platformChurchId] && (
                                                    <Badge variant="secondary" className="text-[10px]">Recommended</Badge>
                                                  )}
                                                </div>
                                                <div className="text-xs text-muted-foreground truncate">
                                                  {church.address}
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </CollapsibleContent>
                                  </Card>
                                </Collapsible>
                              );
                            })}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              ) : wizardPhase === 2 && wizardClusters ? (
                <div className="flex flex-col flex-1 min-h-0">
                  {(() => {
                    const reviewClusters = wizardClusters.clusters.filter(c => c.confidenceTier === 'review' || c.confidenceTier === 'manual');
                    const currentCluster = reviewClusters[currentReviewIndex];
                    if (!currentCluster) {
                      setWizardPhase(3);
                      return null;
                    }
                    return (
                      <>
                        <div className="space-y-2 mb-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                              Cluster {currentReviewIndex + 1} of {reviewClusters.length}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {currentCluster.tierReason}
                            </span>
                          </div>
                          <Progress value={((currentReviewIndex + 1) / reviewClusters.length) * 100} className="h-2" />
                        </div>
                        
                        {/* Compare on Map */}
                        <div className="rounded-md border overflow-hidden mb-4">
                          <div className="bg-muted/50 px-3 py-2 flex items-center gap-2 border-b">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs font-medium">Compare on Map</span>
                            <div className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-green-500"></span> Recommended
                              </span>
                              <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-red-500"></span> Other
                              </span>
                            </div>
                          </div>
                          <div 
                            ref={dedupeMapContainer} 
                            className="h-40 w-full"
                            data-testid="map-dedupe-compare"
                          />
                        </div>
                        
                        <div className="flex-1 min-h-0 flex flex-col">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <h4 className="text-sm font-medium">Mark each record as Keep or Hide:</h4>
                              <p className="text-xs text-muted-foreground">Toggle each church individually, then click "Apply Decisions" below.</p>
                            </div>
                            {(() => {
                              const overrides = clusterOverrides[currentCluster.clusterId] || {};
                              const keepCount = currentCluster.churches.filter(c => {
                                const override = overrides[c.platformChurchId];
                                return override === 'keep' || (override === undefined && c.platformChurchId === currentCluster.survivor.platformChurchId);
                              }).length;
                              const hideCount = currentCluster.churches.length - keepCount;
                              return (
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-[10px]">
                                    Keep {keepCount}
                                  </Badge>
                                  <Badge variant="secondary" className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-[10px]">
                                    Hide {hideCount}
                                  </Badge>
                                </div>
                              );
                            })()}
                          </div>
                          <ScrollArea className="flex-1 min-h-0">
                          <div className="space-y-2 pr-2">
                          {currentCluster.churches.map((church) => {
                            const overrides = clusterOverrides[currentCluster.clusterId] || {};
                            const override = overrides[church.platformChurchId];
                            const isSurvivor = church.platformChurchId === currentCluster.survivor.platformChurchId;
                            // Tri-state: explicit override or fall back to survivor recommendation
                            const isKeep = override === 'keep' || (override === undefined && isSurvivor);
                            
                            return (
                              <div 
                                key={church.id} 
                                className="flex items-center gap-2"
                                data-testid={`wizard-church-${church.id}`}
                              >
                                <Button
                                  size="sm"
                                  variant={isKeep ? "default" : "outline"}
                                  className={`h-7 text-xs shrink-0 ${isKeep 
                                    ? 'bg-green-600 hover:bg-green-700' 
                                    : 'border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950'}`}
                                  onClick={() => {
                                    // Simple toggle: keep ↔ hide
                                    // isKeep = true means currently "keep", click to toggle to "hide"
                                    // isKeep = false means currently "hide", click to toggle to "keep"
                                    const newValue = isKeep ? 'hide' : 'keep';
                                    console.log('[Toggle Button] Clicked:', { 
                                      churchName: church.name, 
                                      currentIsKeep: isKeep,
                                      newValue,
                                      platformChurchId: church.platformChurchId 
                                    });
                                    setClusterOverrides(prev => ({
                                      ...prev,
                                      [currentCluster.clusterId]: {
                                        ...(prev[currentCluster.clusterId] || {}),
                                        [church.platformChurchId]: newValue,
                                      },
                                    }));
                                  }}
                                  data-testid={`button-toggle-${church.id}`}
                                >
                                  {isKeep ? 'Keep' : 'Hide'}
                                </Button>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`text-sm truncate ${!isKeep ? 'text-muted-foreground line-through' : ''}`}>
                                      {church.name}
                                    </span>
                                    <Badge 
                                      variant="outline" 
                                      className={church.source === 'google' 
                                        ? 'border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400 text-[10px]' 
                                        : 'border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-400 text-[10px]'
                                      }
                                    >
                                      {church.source === 'google' ? 'Google' : 'OSM'}
                                    </Badge>
                                    {isSurvivor && !override && (
                                      <Badge variant="secondary" className="text-[10px]">Recommended</Badge>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {church.address}
                                  </div>
                                  <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                                    <span>Quality: {church.dataQualityScore}%</span>
                                    <span>Google Match: {church.googleMatchConfidence}%</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          </div>
                          </ScrollArea>
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : wizardPhase === 3 ? (
                <div className="space-y-4 py-4">
                  <div className="text-center">
                    <Check className="h-12 w-12 mx-auto text-green-500 mb-3" />
                    <h3 className="text-lg font-semibold">Cleanup Complete!</h3>
                  </div>
                  
                  <Card className="bg-muted/30">
                    <CardContent className="py-4">
                      <div className="grid grid-cols-2 gap-4 text-center">
                        {wizardResults.autoResolved > 0 && (
                          <div>
                            <div className="text-lg font-bold text-green-600 dark:text-green-400">
                              {wizardResults.autoResolved}
                            </div>
                            <div className="text-xs text-muted-foreground">Auto-resolved clusters</div>
                          </div>
                        )}
                        {wizardResults.autoHidden > 0 && (
                          <div>
                            <div className="text-lg font-bold text-green-600 dark:text-green-400">
                              {wizardResults.autoHidden}
                            </div>
                            <div className="text-xs text-muted-foreground">Auto-hidden records</div>
                          </div>
                        )}
                        {wizardResults.reviewResolved > 0 && (
                          <div>
                            <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                              {wizardResults.reviewResolved}
                            </div>
                            <div className="text-xs text-muted-foreground">Reviewed clusters</div>
                          </div>
                        )}
                        {wizardResults.reviewHidden > 0 && (
                          <div>
                            <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                              {wizardResults.reviewHidden}
                            </div>
                            <div className="text-xs text-muted-foreground">Review-hidden records</div>
                          </div>
                        )}
                        {wizardResults.skipped > 0 && (
                          <div>
                            <div className="text-lg font-bold text-yellow-600 dark:text-yellow-400">
                              {wizardResults.skipped}
                            </div>
                            <div className="text-xs text-muted-foreground">Skipped clusters</div>
                          </div>
                        )}
                      </div>
                      {(wizardResults.needsManualReview || 0) > 0 && (
                        <div className="mt-4 pt-4 border-t text-center space-y-3">
                          <div className="text-sm text-muted-foreground">
                            {wizardResults.needsManualReview} potential duplicates need manual review
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Use the Platform Churches tab to review remaining duplicates with the map
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ) : null}
            </ScrollArea>
            
            <DialogFooter className="mt-4">
              {wizardPhase === 1 && wizardClusters && (
                <div className="flex gap-2 w-full justify-end">
                  <Button variant="outline" onClick={handleCloseWizard}>
                    Cancel
                  </Button>
                  {wizardClusters.summary.needsReview > 0 && (
                    <Button variant="outline" onClick={handleSkipToReview}>
                      <ChevronRight className="h-4 w-4 mr-1" />
                      Skip to Review ({wizardClusters.summary.needsReview})
                    </Button>
                  )}
                  {wizardClusters.summary.autoResolvable > 0 && (
                    <div className="flex flex-col items-end gap-1">
                      <p className="text-xs text-muted-foreground">Processing may take 1-2 minutes for large numbers of clusters.</p>
                      <Button 
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                        onClick={() => autoResolveMutation.mutate()}
                        disabled={autoResolveMutation.isPending}
                      >
                        {autoResolveMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Processing clusters...
                          </>
                        ) : (
                          <>
                            <Zap className="h-4 w-4 mr-2" />
                            Apply Changes to {wizardClusters.summary.autoResolvable} Clusters
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {wizardPhase === 2 && wizardClusters && (
                (() => {
                  const reviewClusters = wizardClusters.clusters.filter(c => c.confidenceTier === 'review' || c.confidenceTier === 'manual');
                  const currentCluster = reviewClusters[currentReviewIndex];
                  if (!currentCluster) return null;
                  
                  const overrides = clusterOverrides[currentCluster.clusterId] || {};
                  const keepChurches = currentCluster.churches.filter(c => {
                    const override = overrides[c.platformChurchId];
                    const isSurvivor = c.platformChurchId === currentCluster.survivor.platformChurchId;
                    return override === 'keep' || (override === undefined && isSurvivor);
                  });
                  const hideChurches = currentCluster.churches.filter(c => {
                    const override = overrides[c.platformChurchId];
                    const isSurvivor = c.platformChurchId === currentCluster.survivor.platformChurchId;
                    return override === 'hide' || (override === undefined && !isSurvivor);
                  });
                  const hideCount = hideChurches.length;
                  const keepCount = keepChurches.length;
                  const allKeep = hideCount === 0;
                  const noneKeep = keepCount === 0;
                  
                  return (
                    <div className="flex gap-2 w-full justify-between flex-wrap">
                      <Button variant="outline" onClick={() => setWizardPhase(3)}>
                        Finish Early
                      </Button>
                      <div className="flex gap-2 flex-wrap">
                        <Button 
                          variant="outline" 
                          className="border-yellow-300 text-yellow-700 hover:bg-yellow-50 dark:border-yellow-700 dark:text-yellow-400 dark:hover:bg-yellow-950"
                          onClick={() => {
                            setWizardResults(prev => ({ ...prev, needsManualReview: (prev.needsManualReview || 0) + 1 }));
                            moveToNextCluster();
                          }} 
                          disabled={resolveClusterMutation.isPending}
                          data-testid="button-skip-for-now"
                        >
                          <SkipForward className="h-4 w-4 mr-1" />
                          Skip for Now
                        </Button>
                        <Button 
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => {
                            console.log('[Apply Button] Clicked!', { keepCount, hideCount, noneKeep });
                            console.log('[Apply Button] keepChurches:', keepChurches);
                            console.log('[Apply Button] hideChurches:', hideChurches);
                            
                            if (noneKeep) {
                              console.log('[Apply Button] Branch: noneKeep - hiding all');
                              const hideIds = hideChurches.map(c => c.platformChurchId);
                              hideClusterMutation.mutate({ hideIds });
                            } else if (keepCount > 1) {
                              console.log('[Apply Button] Branch: keepCount > 1 - skipping cluster');
                              handleSkipCluster();
                            } else if (keepCount === 1 && hideCount >= 1) {
                              const survivorId = keepChurches[0].platformChurchId;
                              const hideIds = hideChurches.map(c => c.platformChurchId);
                              console.log('[Apply Button] Branch: resolving cluster', { survivorId, hideIds });
                              resolveClusterMutation.mutate({
                                survivorId,
                                hideIds,
                                churchId: keepChurches[0].id,
                              });
                            } else {
                              console.log('[Apply Button] Branch: fallback - skipping');
                              handleSkipCluster();
                            }
                          }} 
                          disabled={resolveClusterMutation.isPending || hideClusterMutation.isPending}
                          data-testid="button-apply-decisions"
                        >
                          {(resolveClusterMutation.isPending || hideClusterMutation.isPending) ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4 mr-1" />
                          )}
                          {noneKeep ? `Hide All (${hideCount})` : keepCount > 1 ? `Keep ${keepCount} & Next` : `Apply (Keep ${keepCount}, Hide ${hideCount})`}
                        </Button>
                      </div>
                    </div>
                  );
                })()
              )}
              {wizardPhase === 3 && (
                <Button onClick={handleCloseWizard}>
                  Done
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Review Wizard Dialog */}
        <Dialog open={showReviewWizard} onOpenChange={(open) => !open && handleCloseReviewWizard()}>
          <DialogContent className="w-[90vw] max-w-lg sm:max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-amber-500" />
                Review Wizard
              </DialogTitle>
              <DialogDescription>
                Review churches that need attention and verify or reject them
              </DialogDescription>
            </DialogHeader>
            
            <ScrollArea className="flex-1 min-h-0 pr-4">
              {churchesNeedingReview.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                  <p className="text-lg font-medium">All caught up!</p>
                  <p className="text-sm text-muted-foreground">No churches need review at this time.</p>
                </div>
              ) : reviewWizardIndex >= churchesNeedingReview.length ? (
                <div className="space-y-4">
                  <div className="flex flex-col items-center justify-center py-8">
                    <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                    <p className="text-lg font-medium">Review Complete!</p>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center bg-green-50 dark:bg-green-900/20 rounded-md p-3">
                      <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                        {reviewWizardResults.verified}
                      </div>
                      <div className="text-xs text-green-600 dark:text-green-500">Verified</div>
                    </div>
                    <div className="text-center bg-gray-50 dark:bg-gray-800 rounded-md p-3">
                      <div className="text-2xl font-bold text-gray-700 dark:text-gray-400">
                        {reviewWizardResults.rejected}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-500">Unverified</div>
                    </div>
                    <div className="text-center bg-gray-50 dark:bg-gray-800 rounded-md p-3">
                      <div className="text-2xl font-bold text-gray-700 dark:text-gray-400">
                        {reviewWizardResults.skipped}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-500">Skipped</div>
                    </div>
                  </div>
                </div>
              ) : (() => {
                const currentChurch = churchesNeedingReview[reviewWizardIndex];
                const qualityScore = currentChurch.church.data_quality_score;
                const googleConfidence = currentChurch.church.google_match_confidence;
                const rawStatus = currentChurch.church.verification_status;
                
                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        Church {reviewWizardIndex + 1} of {churchesNeedingReview.length}
                      </span>
                      <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                        {rawStatus === 'flagged' || rawStatus === 'flagged_for_review' ? 'Flagged' : rawStatus === 'pending' ? 'Pending' : 'Needs Review'}
                      </Badge>
                    </div>
                    <Progress value={((reviewWizardIndex + 1) / churchesNeedingReview.length) * 100} className="h-2" />
                    
                    <Card>
                      <CardContent className="py-4 space-y-3">
                        {wizardEditMode && wizardEditData ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Edit Church Details</span>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={handleCancelWizardEdit}
                                  disabled={updateChurchDetailsMutation.isPending}
                                  data-testid="button-wizard-edit-cancel"
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={handleSaveWizardEdit}
                                  disabled={updateChurchDetailsMutation.isPending}
                                  data-testid="button-wizard-edit-save"
                                >
                                  {updateChurchDetailsMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                  ) : null}
                                  Save
                                </Button>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div>
                                <label className="text-xs text-muted-foreground">Name</label>
                                <Input
                                  value={wizardEditData.name}
                                  onChange={(e) => setWizardEditData(prev => prev ? { ...prev, name: e.target.value } : null)}
                                  placeholder="Church name"
                                  data-testid="input-wizard-edit-name"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground">Address</label>
                                <Input
                                  value={wizardEditData.address}
                                  onChange={(e) => setWizardEditData(prev => prev ? { ...prev, address: e.target.value } : null)}
                                  placeholder="Street address"
                                  data-testid="input-wizard-edit-address"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs text-muted-foreground">City</label>
                                  <Input
                                    value={wizardEditData.city}
                                    onChange={(e) => setWizardEditData(prev => prev ? { ...prev, city: e.target.value } : null)}
                                    placeholder="City"
                                    data-testid="input-wizard-edit-city"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-muted-foreground">State</label>
                                  <Input
                                    value={wizardEditData.state}
                                    onChange={(e) => setWizardEditData(prev => prev ? { ...prev, state: e.target.value } : null)}
                                    placeholder="State"
                                    data-testid="input-wizard-edit-state"
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs text-muted-foreground">Phone</label>
                                  <Input
                                    value={wizardEditData.phone}
                                    onChange={(e) => setWizardEditData(prev => prev ? { ...prev, phone: e.target.value } : null)}
                                    placeholder="Phone number"
                                    data-testid="input-wizard-edit-phone"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-muted-foreground">Email</label>
                                  <Input
                                    value={wizardEditData.email}
                                    onChange={(e) => setWizardEditData(prev => prev ? { ...prev, email: e.target.value } : null)}
                                    placeholder="Email"
                                    data-testid="input-wizard-edit-email"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="text-xs text-muted-foreground">Website</label>
                                <Input
                                  value={wizardEditData.website}
                                  onChange={(e) => setWizardEditData(prev => prev ? { ...prev, website: e.target.value } : null)}
                                  placeholder="https://..."
                                  data-testid="input-wizard-edit-website"
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h3 className="font-semibold text-lg">{currentChurch.church.name}</h3>
                                <p className="text-sm text-muted-foreground">
                                  {currentChurch.church.address || `${currentChurch.church.city}, ${currentChurch.church.state}`}
                                </p>
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleStartWizardEdit(currentChurch.church)}
                                data-testid="button-wizard-edit-start"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div className="bg-muted/50 rounded-md p-2">
                                <div className="text-xs text-muted-foreground mb-1">Quality Score</div>
                                <div className={`font-semibold ${
                                  qualityScore && qualityScore >= 70 ? 'text-green-600' :
                                  qualityScore && qualityScore >= 40 ? 'text-amber-600' : 'text-red-600'
                                }`}>
                                  {qualityScore !== null ? `${qualityScore}%` : 'N/A'}
                                </div>
                              </div>
                              <div className="bg-muted/50 rounded-md p-2">
                                <div className="text-xs text-muted-foreground mb-1">Google Match</div>
                                <div className={`font-semibold ${
                                  googleConfidence && googleConfidence >= 85 ? 'text-green-600' :
                                  googleConfidence && googleConfidence >= 50 ? 'text-amber-600' : 'text-gray-600'
                                }`}>
                                  {googleConfidence !== null ? `${googleConfidence}%` : 'No match'}
                                </div>
                              </div>
                            </div>
                            
                            {currentChurch.church.denomination && (
                              <div className="text-sm">
                                <span className="text-muted-foreground">Denomination:</span>{' '}
                                <span>{currentChurch.church.denomination}</span>
                              </div>
                            )}
                            
                            {currentChurch.church.source && (
                              <div className="text-sm">
                                <span className="text-muted-foreground">Source:</span>{' '}
                                <Badge variant="outline" className="text-xs">
                                  {currentChurch.church.source === 'google' ? 'Google Places' : 
                                   currentChurch.church.source === 'osm' ? 'OpenStreetMap' : 
                                   currentChurch.church.source}
                                </Badge>
                              </div>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                    
                    {!wizardEditMode && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-md p-3 text-sm">
                        <div className="flex items-start gap-2">
                          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="font-medium text-blue-800 dark:text-blue-300">Review Guidelines</p>
                            <ul className="text-blue-700 dark:text-blue-400 text-xs mt-1 space-y-0.5">
                              <li>• Verify the church name and address are accurate</li>
                              <li>• Check if this is a real, active church</li>
                              <li>• Mark duplicates or non-church entries as unverified</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </ScrollArea>
            
            <DialogFooter className="border-t pt-4 mt-4">
              {reviewWizardIndex >= churchesNeedingReview.length || churchesNeedingReview.length === 0 ? (
                <Button onClick={handleCloseReviewWizard} data-testid="button-review-wizard-done">
                  Done
                </Button>
              ) : (
                <div className="flex items-center gap-2 w-full">
                  <Button
                    variant="outline"
                    onClick={() => handleReviewWizardAction('skip')}
                    disabled={updateVerificationStatusMutation.isPending}
                    data-testid="button-review-skip"
                  >
                    <SkipForward className="h-4 w-4 mr-1" />
                    Skip
                  </Button>
                  <div className="flex-1" />
                  <Button
                    variant="outline"
                    className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
                    onClick={() => handleReviewWizardAction('reject')}
                    disabled={updateVerificationStatusMutation.isPending}
                    data-testid="button-review-reject"
                  >
                    {updateVerificationStatusMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <X className="h-4 w-4 mr-1" />
                    )}
                    Reject
                  </Button>
                  <Button
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => handleReviewWizardAction('verify')}
                    disabled={updateVerificationStatusMutation.isPending}
                    data-testid="button-review-verify"
                  >
                    {updateVerificationStatusMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-1" />
                    )}
                    Verify
                  </Button>
                </div>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
