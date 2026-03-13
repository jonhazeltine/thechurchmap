import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "wouter";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import { 
  Users, AlertTriangle, Handshake, ChevronRight, MapPin,
  Heart, Home, Utensils, Car, Phone, Zap, Briefcase, GraduationCap,
  Activity, Brain, Eye, Ear, Hand, UserCheck, Sparkles, Shield
} from "lucide-react";
import { CALLING_COLORS, type CallingType } from "@shared/schema";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AreaIntelligenceData {
  hasArea: boolean;
  areaSource?: 'ministry_area' | 'boundary';
  churchName?: string;
  totalPartners?: number;
  partners?: {
    id: string;
    name: string;
    city: string | null;
    profile_photo_url: string | null;
    callings: { id: string; name: string; type: CallingType }[];
  }[];
  criticalNeeds?: {
    metricKey: string;
    displayName: string;
    category: string;
    estimate: number;
    level: 'concerning' | 'critical';
    dataSource: string;
    tractCount: number;
    totalPopulation?: number;
  }[];
  collaborationOpportunities?: {
    church: {
      id: string;
      name: string;
      city: string | null;
      profile_photo_url: string | null;
    };
    sharedCallings: { id: string; name: string; type: CallingType }[];
    collabMatches: string[];
    matchScore: number;
  }[];
  message?: string;
}

interface AreaIntelligenceSectionProps {
  churchId: string;
  onViewHotspot?: (metricKey: string) => void;
}

const CATEGORY_ICONS: Record<string, any> = {
  social_needs: Heart,
  social_economic: Briefcase,
  health_outcomes: Activity,
  health_behavior: Activity,
  clinical_care: Activity,
  disabilities: Brain,
  physical_environment: Home
};

const METRIC_ICONS: Record<string, any> = {
  food_insecurity: Utensils,
  housing_insecurity: Home,
  social_isolation: Users,
  transportation_barriers: Car,
  lack_social_support: Phone,
  utility_shutoff_threat: Zap,
  poverty: Briefcase,
  child_poverty: GraduationCap,
  unemployment: Briefcase,
  uninsured: Activity,
  health_insurance: Activity,
  depression: Brain,
  general_health: Activity,
  cognitive_disability: Brain,
  hearing_disability: Ear,
  mobility_disability: Hand,
  vision_disability: Eye,
  self_care_disability: UserCheck,
  independent_living_disability: Home,
  assault_rate: Shield,
  theft_rate: Shield,
  burglary_rate: Shield,
  vandalism_rate: Shield,
  robbery_rate: Shield,
  vehicle_theft_rate: Shield,
  drug_offense_rate: Shield,
};

const CRIME_METRICS = [
  'assault_rate',
  'theft_rate',
  'burglary_rate',
  'vandalism_rate',
  'robbery_rate',
  'vehicle_theft_rate',
  'drug_offense_rate',
];

const NATIONAL_AVERAGES: Record<string, number> = {
  assault_rate: 250,
  theft_rate: 1500,
  burglary_rate: 300,
  vandalism_rate: 400,
  robbery_rate: 100,
  vehicle_theft_rate: 200,
  drug_offense_rate: 300,
};

function isCrimeMetric(metricKey: string): boolean {
  return CRIME_METRICS.includes(metricKey);
}

function formatMetricDisplay(metricKey: string, estimate: number): string {
  if (isCrimeMetric(metricKey)) {
    const nationalAvg = NATIONAL_AVERAGES[metricKey];
    if (nationalAvg && nationalAvg > 0) {
      const multiplier = estimate / nationalAvg;
      if (multiplier > 1) {
        const pctAbove = Math.round((multiplier - 1) * 100);
        return `${pctAbove}% above US avg`;
      } else if (multiplier < 1) {
        const pctBelow = Math.round((1 - multiplier) * 100);
        return `${pctBelow}% below US avg`;
      }
      return `at US avg`;
    }
    return `${Math.round(estimate)}/100K`;
  }
  return `${estimate}%`;
}

function getMetricTooltip(metricKey: string, displayName: string, estimate: number): string {
  if (isCrimeMetric(metricKey)) {
    const nationalAvg = NATIONAL_AVERAGES[metricKey];
    if (!nationalAvg) return `${Math.round(estimate)} incidents per 100,000 residents`;
    
    const multiplier = estimate / nationalAvg;
    const metricType = displayName.toLowerCase().replace(' rate', 's');
    
    if (multiplier > 1) {
      return `${Math.round(estimate)} ${metricType} per 100K people in this area vs ${nationalAvg} US average (${multiplier.toFixed(1)}x higher)`;
    } else if (multiplier < 1) {
      return `${Math.round(estimate)} ${metricType} per 100K people in this area vs ${nationalAvg} US average (${((1 - multiplier) * 100).toFixed(0)}% lower)`;
    }
    return `${Math.round(estimate)} ${metricType} per 100K people (same as US average)`;
  }
  return `${estimate}% of residents in this area report this condition`;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function AreaIntelligenceSection({ churchId, onViewHotspot }: AreaIntelligenceSectionProps) {
  const [showAllPartners, setShowAllPartners] = useState(false);
  const { getChurchUrl } = usePlatformNavigation();
  
  const { data, isLoading, error } = useQuery<AreaIntelligenceData>({
    queryKey: ['/api/churches/area-intelligence', churchId],
    queryFn: () => fetch(`/api/churches/area-intelligence?churchId=${churchId}`).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }),
    enabled: !!churchId,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card data-testid="card-area-intelligence-loading">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return null;
  }

  if (!data.hasArea) {
    return (
      <Card data-testid="card-area-intelligence-empty">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Area Intelligence
          </CardTitle>
          <CardDescription>
            Draw a ministry area on your church profile to unlock insights about partners, community needs, and collaboration opportunities in your area.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <MapPin className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No ministry area defined yet</p>
            <p className="text-sm mt-1">Set up your primary ministry area below to see area intelligence</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { totalPartners = 0, partners = [], criticalNeeds = [], collaborationOpportunities = [] } = data;

  return (
    <Card data-testid="card-area-intelligence">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          Area Intelligence
        </CardTitle>
        <CardDescription>
          Insights about your {data.areaSource === 'ministry_area' ? 'ministry area' : 'geographic boundary'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-primary/5 rounded-lg p-4 text-center">
            <Users className="w-8 h-8 mx-auto mb-2 text-primary" />
            <div className="text-2xl font-bold text-primary">{totalPartners}</div>
            <div className="text-sm text-muted-foreground">Potential Partners</div>
          </div>
          
          <div className="bg-orange-500/10 rounded-lg p-4 text-center">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-orange-500" />
            <div className="text-2xl font-bold text-orange-600">{criticalNeeds.length}</div>
            <div className="text-sm text-muted-foreground">Community Needs</div>
          </div>
          
          <div className="bg-green-500/10 rounded-lg p-4 text-center">
            <Handshake className="w-8 h-8 mx-auto mb-2 text-green-500" />
            <div className="text-2xl font-bold text-green-600">{collaborationOpportunities.length}</div>
            <div className="text-sm text-muted-foreground">Collaboration Matches</div>
          </div>
        </div>

        {criticalNeeds.length > 0 && (
          <div>
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              Community Needs in Your Area
            </h4>
            <div className="flex flex-wrap gap-2">
              {criticalNeeds.map((need) => {
                const IconComponent = METRIC_ICONS[need.metricKey] || CATEGORY_ICONS[need.category] || AlertTriangle;
                const isClickable = !!onViewHotspot;
                const displayValue = formatMetricDisplay(need.metricKey, need.estimate);
                const tooltipText = getMetricTooltip(need.metricKey, need.displayName, need.estimate);
                return (
                  <Tooltip key={need.metricKey}>
                    <TooltipTrigger asChild>
                      <Badge 
                        variant="outline"
                        className={`${need.level === 'critical' 
                          ? 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-400' 
                          : 'border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-400'
                        } ${isClickable ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                        onClick={isClickable ? () => onViewHotspot(need.metricKey) : undefined}
                        data-testid={`badge-need-${need.metricKey}`}
                      >
                        <IconComponent className="w-3 h-3 mr-1" />
                        {need.displayName}: {displayValue}
                        {need.level === 'critical' && <span className="ml-1 text-xs">(Critical)</span>}
                        {isClickable && <MapPin className="w-3 h-3 ml-1" />}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-sm">{tooltipText}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {onViewHotspot ? 'Click a metric to view hotspots on the map. ' : ''}
              Hover for details. Data from CDC PLACES, Census, and local police departments.
            </p>
          </div>
        )}

        {collaborationOpportunities.length > 0 && (
          <div>
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <Handshake className="w-4 h-4 text-green-500" />
              Collaboration Opportunities
            </h4>
            <div className="space-y-3">
              {collaborationOpportunities.slice(0, 5).map((opp) => (
                <div 
                  key={opp.church.id} 
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover-elevate"
                  data-testid={`collab-opportunity-${opp.church.id}`}
                >
                  <Avatar className="h-10 w-10 flex-shrink-0">
                    <AvatarImage src={opp.church.profile_photo_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {getInitials(opp.church.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <Link href={getChurchUrl(opp.church.id)}>
                      <span className="font-medium hover:text-primary cursor-pointer">
                        {opp.church.name}
                      </span>
                    </Link>
                    {opp.church.city && (
                      <p className="text-xs text-muted-foreground">{opp.church.city}</p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {opp.sharedCallings.map((calling) => (
                        <Badge 
                          key={calling.id} 
                          variant="secondary" 
                          className="text-xs"
                          style={{ 
                            backgroundColor: `${CALLING_COLORS[calling.type]}20`,
                            color: CALLING_COLORS[calling.type],
                            borderColor: CALLING_COLORS[calling.type]
                          }}
                        >
                          {calling.name}
                        </Badge>
                      ))}
                      {opp.collabMatches.slice(0, 2).map((match, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {match}
                        </Badge>
                      ))}
                      {opp.collabMatches.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{opp.collabMatches.length - 2} more
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" asChild>
                    <Link href={getChurchUrl(opp.church.id)}>
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </Button>
                </div>
              ))}
              {collaborationOpportunities.length > 5 && (
                <p className="text-sm text-muted-foreground text-center">
                  +{collaborationOpportunities.length - 5} more collaboration opportunities
                </p>
              )}
            </div>
          </div>
        )}

        {partners.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Churches in Your Area ({totalPartners})
              </h4>
              {totalPartners > 6 && (
                <Dialog open={showAllPartners} onOpenChange={setShowAllPartners}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" data-testid="button-see-all-partners">
                      See all
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Churches in Your Ministry Area ({totalPartners})</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2 mt-4">
                      {partners.map((partner) => (
                        <Link key={partner.id} href={getChurchUrl(partner.id)}>
                          <div 
                            className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted cursor-pointer"
                            data-testid={`partner-${partner.id}`}
                          >
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={partner.profile_photo_url || undefined} />
                              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {getInitials(partner.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{partner.name}</p>
                              {partner.city && (
                                <p className="text-xs text-muted-foreground">{partner.city}</p>
                              )}
                            </div>
                            <div className="flex gap-1">
                              {partner.callings.slice(0, 3).map((calling) => (
                                <div
                                  key={calling.id}
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: CALLING_COLORS[calling.type] }}
                                  title={calling.name}
                                />
                              ))}
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {partners.slice(0, 6).map((partner) => (
                <Link key={partner.id} href={getChurchUrl(partner.id)}>
                  <div 
                    className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover-elevate cursor-pointer"
                    data-testid={`partner-preview-${partner.id}`}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={partner.profile_photo_url || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                        {getInitials(partner.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{partner.name}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            {totalPartners > 6 && !showAllPartners && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                +{totalPartners - 6} more churches in your area
              </p>
            )}
          </div>
        )}

        {totalPartners === 0 && criticalNeeds.length === 0 && collaborationOpportunities.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>No data found for this area yet.</p>
            <p className="text-sm">Try expanding your ministry area or checking back later.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
