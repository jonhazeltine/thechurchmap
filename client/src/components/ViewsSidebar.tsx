import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { 
  Activity,
  Heart,
  Brain,
  TreePine,
  Users,
  Layers,
  Eye,
  EyeOff,
  Info,
  AlertCircle,
  Accessibility,
  HandHeart,
  Shield,
  Zap,
  MapPin,
  Sparkles,
  TrendingUp,
  Sprout,
  Sun,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  type HealthMetricCategory, 
  type HealthMetric,
  HEALTH_METRIC_KEYS,
  HEALTH_METRIC_COLOR_SCALES 
} from "@shared/schema";

const DATA_SOURCE_INFO: Record<string, { source: string; icon: string; url: string }> = {
  'CDC PLACES': { source: 'CDC PLACES', icon: 'CDC', url: 'https://www.cdc.gov/places/' },
  'Census ACS': { source: 'Census Bureau ACS', icon: 'ACS', url: 'https://www.census.gov/programs-surveys/acs' },
  'Local Police': { source: 'Local Police Departments', icon: 'PD', url: '#' },
};

const METRIC_PRIMARY_SOURCE: Record<string, string> = {
  // ==================== CDC PLACES - Clinical Care ====================
  'dental_visit': 'CDC PLACES',
  'health_insurance': 'CDC PLACES',
  'routine_checkup': 'CDC PLACES',
  'cholesterol_screening': 'CDC PLACES',
  'colorectal_cancer_screening': 'CDC PLACES',
  'mammography': 'CDC PLACES',
  'taking_bp_medication': 'CDC PLACES',
  
  // ==================== CDC PLACES - Health Behaviors ====================
  'binge_drinking': 'CDC PLACES',
  'current_smoking': 'CDC PLACES',
  'physical_inactivity': 'CDC PLACES',
  'sleep': 'CDC PLACES',
  
  // ==================== CDC PLACES - Health Outcomes ====================
  'arthritis': 'CDC PLACES',
  'asthma': 'CDC PLACES',
  'cancer': 'CDC PLACES',
  'cardiovascular_disease': 'CDC PLACES',
  'copd': 'CDC PLACES',
  'depression': 'CDC PLACES',
  'diabetes': 'CDC PLACES',
  'frequent_mental_distress': 'CDC PLACES',
  'frequent_physical_distress': 'CDC PLACES',
  'general_health': 'CDC PLACES',
  'high_blood_pressure': 'CDC PLACES',
  'high_cholesterol': 'CDC PLACES',
  'kidney_disease': 'CDC PLACES',
  'obesity': 'CDC PLACES',
  'stroke': 'CDC PLACES',
  'teeth_lost': 'CDC PLACES',
  
  // ==================== CDC PLACES - Disabilities ====================
  'any_disability': 'CDC PLACES',
  'cognitive_disability': 'CDC PLACES',
  'hearing_disability': 'CDC PLACES',
  'mobility_disability': 'CDC PLACES',
  'vision_disability': 'CDC PLACES',
  'self_care_disability': 'CDC PLACES',
  'independent_living_disability': 'CDC PLACES',
  
  // ==================== CDC PLACES - Community Wellbeing ====================
  'food_insecurity': 'CDC PLACES',
  'food_stamps': 'CDC PLACES',
  'housing_insecurity': 'CDC PLACES',
  'social_isolation': 'CDC PLACES',
  'lack_social_support': 'CDC PLACES',
  'transportation_barriers': 'CDC PLACES',
  'utility_shutoff_threat': 'CDC PLACES',
  
  // ==================== Census ACS - Economic Indicators ====================
  'poverty': 'Census ACS',
  'child_poverty': 'Census ACS',
  'unemployment': 'Census ACS',
  'income_inequality': 'Census ACS',
  'children_in_single_parent_households': 'Census ACS',
  'high_school_completion': 'Census ACS',
  'racial_ethnic_diversity': 'Census ACS',
  'racial_ethnic_isolation': 'Census ACS',
  'uninsured': 'Census ACS',
  
  // ==================== Census ACS - Physical Environment ====================
  'broadband_connection': 'Census ACS',
  'housing_cost_burden': 'Census ACS',
  
  // ==================== Local Police Departments - Public Safety ====================
  'assault_rate': 'Local Police',
  'sex_offense_rate': 'Local Police',
  'robbery_rate': 'Local Police',
  'theft_rate': 'Local Police',
  'burglary_rate': 'Local Police',
  'vehicle_theft_rate': 'Local Police',
  'vandalism_rate': 'Local Police',
  'fraud_rate': 'Local Police',
  'drug_offense_rate': 'Local Police',
  'weapons_offense_rate': 'Local Police',
};

interface ViewsSidebarProps {
  selectedMetric: string | null;
  onMetricChange: (metricKey: string | null) => void;
  overlayVisible: boolean;
  onOverlayVisibilityChange: (visible: boolean) => void;
  performanceMode?: boolean;
  onPerformanceModeChange?: (enabled: boolean) => void;
  prayerCoverageVisible?: boolean;
  onPrayerCoverageVisibilityChange?: (visible: boolean) => void;
  prayerCoverageMode?: "citywide" | "myChurch";
  onPrayerCoverageModeChange?: (mode: "citywide" | "myChurch") => void;
  userChurchId?: string | null;
  allocationModeActive?: boolean;
  onAllocationModeChange?: (active: boolean) => void;
  onOpenBudgetWizard?: () => void;
  churchPinsVisible?: boolean;
  onChurchPinsVisibilityChange?: (visible: boolean) => void;
  ministryAreasVisible?: boolean;
  onMinistryAreasVisibilityChange?: (visible: boolean) => void;
  ministrySaturationVisible?: boolean;
  onMinistrySaturationVisibilityChange?: (visible: boolean) => void;
}

const CATEGORY_ICONS: Record<string, typeof Activity> = {
  clinical_care: Heart,
  health_behavior: Activity,
  health_outcomes: Brain,
  disabilities: Accessibility,
  social_needs: HandHeart,
  physical_environment: TreePine,
  social_economic: Users,
  public_safety: Shield,
};

const CATEGORY_COLORS: Record<string, string> = {
  clinical_care: '#3B82F6',
  health_behavior: '#10B981',
  health_outcomes: '#EF4444',
  disabilities: '#6366F1',
  social_needs: '#EC4899',
  physical_environment: '#8B5CF6',
  social_economic: '#F59E0B',
  public_safety: '#DC2626',
};

export function ViewsSidebar({
  selectedMetric,
  onMetricChange,
  overlayVisible,
  onOverlayVisibilityChange,
  performanceMode = false,
  onPerformanceModeChange,
  prayerCoverageVisible = false,
  onPrayerCoverageVisibilityChange,
  prayerCoverageMode = "citywide",
  onPrayerCoverageModeChange,
  userChurchId,
  allocationModeActive = false,
  onAllocationModeChange,
  onOpenBudgetWizard,
  churchPinsVisible = true,
  onChurchPinsVisibilityChange,
  ministryAreasVisible = true,
  onMinistryAreasVisibilityChange,
  ministrySaturationVisible = false,
  onMinistrySaturationVisibilityChange,
}: ViewsSidebarProps) {
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);

  const { data: churchCoverage } = useQuery<{
    budget: { church_id: string; daily_intercessor_count: number; total_budget_pct: number };
    allocations: Array<{ tract_geoid: string; allocation_pct: number }>;
    total_allocation_pct: number;
    remaining_pct: number;
  }>({
    queryKey: ["/api/prayer-coverage/church", userChurchId],
    queryFn: async () => {
      const res = await fetch(`/api/prayer-coverage/church/${userChurchId}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: prayerCoverageVisible && prayerCoverageMode === "myChurch" && !!userChurchId,
    staleTime: 30 * 1000,
  });

  const { data: engagementData } = useQuery<{
    church_id: string;
    base_score: number;
    effective_score: number;
    activity_count: number;
    last_activity_at: string;
  }>({
    queryKey: ["/api/churches", userChurchId, "engagement"],
    queryFn: async () => {
      const res = await fetch(`/api/churches/${userChurchId}/engagement`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: prayerCoverageVisible && prayerCoverageMode === "myChurch" && !!userChurchId,
    staleTime: 60 * 1000,
  });

  const engagementLevel = useMemo(() => {
    const score = engagementData?.effective_score ?? 1.0;
    if (score >= 0.8) return { label: "Active", color: "text-emerald-600 dark:text-emerald-400", bgColor: "bg-emerald-500/10", icon: Sparkles, message: "Your church is actively engaged in prayer for your community." };
    if (score >= 0.5) return { label: "Growing", color: "text-amber-600 dark:text-amber-400", bgColor: "bg-amber-500/10", icon: TrendingUp, message: "Your prayer engagement is building momentum. Keep it up!" };
    if (score >= 0.2) return { label: "Getting Started", color: "text-blue-600 dark:text-blue-400", bgColor: "bg-blue-500/10", icon: Sprout, message: "Every prayer makes a difference. Your community is waiting for you." };
    return { label: "Welcome Back", color: "text-violet-600 dark:text-violet-400", bgColor: "bg-violet-500/10", icon: Sun, message: "It's a great day to reconnect with your community through prayer." };
  }, [engagementData]);

  const hasBudget = (churchCoverage?.budget?.daily_intercessor_count ?? 0) > 0;

  const { data: categories = [], isLoading: categoriesLoading, isError: categoriesError } = useQuery<HealthMetricCategory[]>({
    queryKey: ["/api/health-data/categories"],
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const { data: metrics = [], isLoading: metricsLoading, isError: metricsError } = useQuery<HealthMetric[]>({
    queryKey: ["/api/health-data/metrics"],
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
  
  const hasApiError = categoriesError || metricsError;

  const metricsByCategory = useMemo(() => {
    const grouped: Record<string, typeof metrics> = {};
    metrics.forEach((metric) => {
      const categoryName = metric.category?.name || 'other';
      if (!grouped[categoryName]) {
        grouped[categoryName] = [];
      }
      grouped[categoryName].push(metric);
    });
    return grouped;
  }, [metrics]);

  const selectedMetricData = useMemo(() => {
    return metrics.find(m => m.metric_key === selectedMetric);
  }, [metrics, selectedMetric]);

  const staticMetrics = useMemo(() => {
    const byCategory: Record<string, { key: string; display: string }[]> = {};
    Object.entries(HEALTH_METRIC_KEYS).forEach(([key, { display, category }]) => {
      if (!byCategory[category]) {
        byCategory[category] = [];
      }
      byCategory[category].push({ key, display });
    });
    return byCategory;
  }, []);

  const handleMetricSelect = (metricKey: string) => {
    if (selectedMetric === metricKey) {
      onMetricChange(null);
    } else {
      onMetricChange(metricKey);
      if (!overlayVisible) {
        onOverlayVisibilityChange(true);
      }
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Fully scrollable content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-muted-foreground" />
              <h3 className="font-semibold">Data Overlays</h3>
            </div>
            <Badge variant="secondary" className="text-xs">Beta</Badge>
          </div>

        {onPrayerCoverageVisibilityChange && (
          <div className="space-y-3 pb-3 border-b">
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-amber-500" />
              <span className="font-medium text-sm">Prayer Coverage</span>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="prayer-coverage-toggle" className="text-sm">Show on map</Label>
              <Switch
                id="prayer-coverage-toggle"
                checked={prayerCoverageVisible}
                onCheckedChange={onPrayerCoverageVisibilityChange}
                data-testid="switch-prayer-coverage"
              />
            </div>

            {prayerCoverageVisible && onPrayerCoverageModeChange && (
              <div className="space-y-3">
                <div className="flex rounded-lg border overflow-hidden">
                  <button
                    className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                      prayerCoverageMode === "citywide"
                        ? "bg-amber-500 text-white"
                        : "hover-elevate"
                    }`}
                    onClick={() => onPrayerCoverageModeChange("citywide")}
                    data-testid="button-coverage-citywide"
                  >
                    Citywide
                  </button>
                  <button
                    className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors border-l ${
                      prayerCoverageMode === "myChurch"
                        ? "bg-amber-500 text-white"
                        : "hover-elevate"
                    }`}
                    onClick={() => onPrayerCoverageModeChange("myChurch")}
                    data-testid="button-coverage-mychurch"
                  >
                    My Church
                  </button>
                </div>

                {prayerCoverageMode === "myChurch" && userChurchId && (
                  <div className="space-y-2">
                    {!hasBudget ? (
                      <div className="p-3 bg-amber-500/10 rounded-lg space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Set up your prayer budget to start allocating prayer focus across your community.
                        </p>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={onOpenBudgetWizard}
                          data-testid="button-setup-budget"
                          className="w-full"
                        >
                          <Heart className="w-4 h-4 mr-1" />
                          Set Up Prayer Budget
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Budget used</span>
                            <span className="font-medium">
                              {Math.round(churchCoverage?.total_allocation_pct ?? 0)}%
                            </span>
                          </div>
                          <Progress
                            value={Math.round(churchCoverage?.total_allocation_pct ?? 0)}
                            className="h-2"
                            data-testid="progress-church-budget"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            {Math.round(churchCoverage?.remaining_pct ?? 100)}% remaining
                          </p>
                        </div>

                        {onAllocationModeChange && (
                          <Button
                            variant={allocationModeActive ? "default" : "outline"}
                            size="sm"
                            onClick={() => onAllocationModeChange(!allocationModeActive)}
                            data-testid="button-toggle-allocation-mode"
                            className="w-full"
                          >
                            <MapPin className="w-4 h-4 mr-1" />
                            {allocationModeActive ? "Exit Allocation Mode" : "Allocate Prayer Focus"}
                          </Button>
                        )}

                        {(churchCoverage?.allocations?.length ?? 0) > 0 && (
                          <div className="space-y-1 pt-1">
                            <span className="text-xs text-muted-foreground">Allocated areas</span>
                            {churchCoverage?.allocations.map((alloc, i) => (
                              <div key={alloc.tract_geoid} className="flex items-center gap-2">
                                <span className="text-xs min-w-0 truncate flex-1" data-testid={`text-alloc-area-${i}`}>
                                  Area {i + 1}
                                </span>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div
                                      className="h-full bg-amber-500 rounded-full"
                                      style={{ width: `${alloc.allocation_pct}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] text-muted-foreground w-8 text-right">
                                    {Math.round(alloc.allocation_pct)}%
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {engagementData && (
                          <div className={`p-3 rounded-lg space-y-2 ${engagementLevel.bgColor}`} data-testid="engagement-indicator">
                            <div className="flex items-center gap-2">
                              <engagementLevel.icon className={`w-4 h-4 ${engagementLevel.color}`} />
                              <span className={`text-xs font-medium ${engagementLevel.color}`}>
                                {engagementLevel.label}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              {engagementLevel.message}
                            </p>
                            {(engagementData.effective_score ?? 1) < 0.8 && (
                              <div className="pt-1 space-y-1">
                                <span className="text-[10px] font-medium text-muted-foreground">Ways to grow engagement:</span>
                                <ul className="text-[10px] text-muted-foreground space-y-0.5 pl-3">
                                  <li className="list-disc">Submit prayer requests for your community</li>
                                  <li className="list-disc">Pray for requests in your allocated areas</li>
                                  <li className="list-disc">Update your prayer budget regularly</li>
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {prayerCoverageMode === "myChurch" && !userChurchId && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">
                      Claim a church to set up prayer allocations for your community.
                    </p>
                  </div>
                )}

                {prayerCoverageVisible && (
                  <div className="flex items-center gap-2 pt-1">
                    <div className="flex items-center gap-1">
                      <div className="w-4 h-3 rounded-sm bg-amber-400/30 border border-amber-500/40" />
                      <span className="text-[10px] text-muted-foreground">Low</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-4 h-3 rounded-sm bg-amber-500/60 border border-amber-500/50" />
                      <span className="text-[10px] text-muted-foreground">Med</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-4 h-3 rounded-sm bg-amber-600/80 border border-amber-600/60" />
                      <span className="text-[10px] text-muted-foreground">High</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}


        {!selectedMetric && (
          <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>
                Select a health metric below to overlay data on the map.
              </p>
            </div>
          </div>
        )}

        {hasApiError && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" />
              <p className="text-amber-700 dark:text-amber-400">
                Using cached metric data. Live health data may be unavailable.
              </p>
            </div>
          </div>
        )}

        {selectedMetric && (
          <div className="p-3 bg-accent/30 border border-accent-border rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: CATEGORY_COLORS[selectedMetricData?.category?.name || HEALTH_METRIC_KEYS[selectedMetric]?.category || 'clinical_care'] }}
                />
                <span className="font-medium text-sm">
                  {selectedMetricData?.display_name || HEALTH_METRIC_KEYS[selectedMetric]?.display || selectedMetric}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onMetricChange(null)}
                className="h-7 text-xs"
                data-testid="button-clear-metric"
              >
                Clear
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="overlay-toggle" className="text-sm">Show on map</Label>
              <Switch
                id="overlay-toggle"
                checked={overlayVisible}
                onCheckedChange={onOverlayVisibilityChange}
                data-testid="switch-overlay-visibility"
              />
            </div>

            {/* Public Safety data availability warning */}
            {METRIC_PRIMARY_SOURCE[selectedMetric] === 'Local Police' && (
              <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-md text-[11px]">
                <div className="flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-600" />
                  <p className="text-amber-700 dark:text-amber-400">
                    Safety data is currently available for select cities. Areas without coverage will show as "No Data."
                  </p>
                </div>
              </div>
            )}

            {overlayVisible && selectedMetric && (
              <div className="pt-2 border-t space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">Color Scale</Label>
                  <div className="flex items-center gap-1">
                    {((() => {
                      const positiveMetrics = ['dental_visit', 'routine_checkup', 'taking_bp_medication', 
                        'cholesterol_screening', 'colorectal_cancer_screening', 'cervical_cancer_screening', 'mammography',
                        'core_preventive_men', 'core_preventive_women', 'life_expectancy', 'high_school_completion',
                        'park_access', 'walkability', 'broadband_connection', 'racial_ethnic_diversity'];
                      return positiveMetrics.includes(selectedMetric)
                        ? HEALTH_METRIC_COLOR_SCALES.positive 
                        : HEALTH_METRIC_COLOR_SCALES.negative;
                    })()).map((color, i) => (
                      <div 
                        key={i}
                        className="flex-1 h-4 first:rounded-l last:rounded-r"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>Low</span>
                    <span>High</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <div 
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: 'rgba(128,128,128,0.5)' }}
                    />
                    <span className="text-[10px] text-muted-foreground">No Data</span>
                  </div>
                </div>

                {/* Data source attribution */}
                {METRIC_PRIMARY_SOURCE[selectedMetric] && (
                  <div className="pt-2 border-t flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground">Data Source</Label>
                      <Link 
                        href="/methodology" 
                        className="text-[10px] text-muted-foreground hover:text-primary hover:underline"
                        data-testid="link-methodology-overlay"
                      >
                        (methodology)
                      </Link>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a
                          href={DATA_SOURCE_INFO[METRIC_PRIMARY_SOURCE[selectedMetric]]?.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                          data-testid="link-data-source"
                        >
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                            {DATA_SOURCE_INFO[METRIC_PRIMARY_SOURCE[selectedMetric]]?.icon}
                          </Badge>
                          <span>{DATA_SOURCE_INFO[METRIC_PRIMARY_SOURCE[selectedMetric]]?.source}</span>
                        </a>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        Click to learn more about this data source
                      </TooltipContent>
                    </Tooltip>
                  </div>
                )}

              </div>
            )}
          </div>
        )}


        {onPerformanceModeChange && (
          <div className="pt-3 border-t">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="performance-mode" className="text-sm font-medium">
                    Performance Mode
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Groups pins for slower devices
                  </p>
                </div>
              </div>
              <Switch
                id="performance-mode"
                checked={performanceMode}
                onCheckedChange={onPerformanceModeChange}
                data-testid="switch-performance-mode"
              />
            </div>
          </div>
        )}

          {/* Health Metrics section */}
          <div className="pt-2">
            <Label className="text-sm font-medium mb-3 block">Health Metrics</Label>
          
          <Accordion type="multiple" value={expandedCategories} onValueChange={setExpandedCategories}>
              {[
                { name: 'clinical_care', display: 'Clinical Care' },
                { name: 'health_behavior', display: 'Health Behavior' },
                { name: 'health_outcomes', display: 'Health Outcomes' },
                { name: 'disabilities', display: 'Disabilities' },
                { name: 'social_needs', display: 'Community Wellbeing' },
                { name: 'social_economic', display: 'Economic Indicators' },
                { name: 'physical_environment', display: 'Physical Environment' },
                { name: 'public_safety', display: 'Public Safety' },
              ].map((category) => {
                const Icon = CATEGORY_ICONS[category.name] || Activity;
                const categoryMetrics = staticMetrics[category.name] || [];
                const color = CATEGORY_COLORS[category.name];
                
                return (
                  <AccordionItem key={category.name} value={category.name} className="border-b-0">
                    <AccordionTrigger 
                      className="py-2 hover:no-underline"
                      data-testid={`accordion-category-${category.name}`}
                    >
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-6 h-6 rounded flex items-center justify-center"
                          style={{ backgroundColor: `${color}20` }}
                        >
                          <Icon className="w-3.5 h-3.5" style={{ color }} />
                        </div>
                        <span className="text-sm font-medium">{category.display}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {categoryMetrics.length}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="pl-8 space-y-1">
                        {categoryMetrics.map((metric) => (
                          <button
                            key={metric.key}
                            onClick={() => handleMetricSelect(metric.key)}
                            className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                              selectedMetric === metric.key
                                ? "bg-primary text-primary-foreground"
                                : "hover-elevate"
                            }`}
                            data-testid={`button-metric-${metric.key}`}
                          >
                            {metric.display}
                          </button>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>

          <div className="pt-4 border-t mt-4">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <p>
                Data sources: CDC PLACES (health metrics), Census ACS (socioeconomic), 
                and local police departments (public safety). 
                Census tract boundaries from U.S. Census Bureau TIGERweb.
              </p>
            </div>
          </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
