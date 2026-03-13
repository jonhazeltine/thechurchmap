import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import { 
  Sparkles, Users, AlertTriangle, Handshake, MapPin, 
  ChevronRight, PartyPopper, Heart, Check, Loader2
} from "lucide-react";
import { CALLING_COLORS, type CallingType } from "@shared/schema";

const LOADING_STEPS = [
  { label: "Analyzing ministry area", icon: MapPin },
  { label: "Gathering community needs", icon: Heart },
  { label: "Finding church partners", icon: Users },
  { label: "Identifying collaboration matches", icon: Handshake },
];

function AnimatedLoadingSteps({ isComplete }: { isComplete: boolean }) {
  const [currentStep, setCurrentStep] = useState(0);
  
  useEffect(() => {
    if (isComplete) {
      setCurrentStep(LOADING_STEPS.length);
      return;
    }
    
    const interval = setInterval(() => {
      setCurrentStep(prev => {
        if (prev >= LOADING_STEPS.length - 1) return prev;
        return prev + 1;
      });
    }, 600);
    
    return () => clearInterval(interval);
  }, [isComplete]);
  
  return (
    <div className="space-y-3 py-4">
      {LOADING_STEPS.map((step, index) => {
        const Icon = step.icon;
        const isActive = index === currentStep && !isComplete;
        const isDone = index < currentStep || isComplete;
        
        return (
          <div 
            key={step.label}
            className={`flex items-center gap-3 p-3 rounded-lg transition-all duration-300 ${
              isActive ? 'bg-primary/10 border border-primary/30' :
              isDone ? 'bg-muted/50' : 'opacity-40'
            }`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              isDone ? 'bg-primary text-primary-foreground' : 
              isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
            }`}>
              {isDone ? (
                <Check className="w-4 h-4" />
              ) : isActive ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Icon className="w-4 h-4" />
              )}
            </div>
            <span className={`text-sm font-medium transition-colors ${
              isActive ? 'text-primary' : isDone ? 'text-foreground' : 'text-muted-foreground'
            }`}>
              {step.label}
              {isActive && <span className="animate-pulse">...</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface AreaIntelligenceData {
  hasArea: boolean;
  areaSource?: 'ministry_area' | 'boundary';
  churchName?: string;
  totalPartners?: number;
  partners?: any[];
  criticalNeeds?: {
    metricKey: string;
    displayName: string;
    level: 'concerning' | 'critical';
    estimate: number;
  }[];
  collaborationOpportunities?: {
    church: {
      id: string;
      name: string;
    };
    sharedCallings: { id: string; name: string; type: CallingType }[];
    collabMatches: string[];
  }[];
}

interface AreaIntelligencePopupProps {
  churchId: string;
  churchName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewHotspot?: (metricKey: string) => void;
}

export function AreaIntelligencePopup({ churchId, churchName, open, onOpenChange, onViewHotspot }: AreaIntelligencePopupProps) {
  const { getChurchUrl } = usePlatformNavigation();
  const { data, isLoading, isFetching } = useQuery<AreaIntelligenceData>({
    queryKey: ['/api/churches/area-intelligence', churchId],
    queryFn: () => fetch(`/api/churches/area-intelligence?churchId=${churchId}`).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }),
    enabled: open && !!churchId,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  
  const showLoading = isLoading || isFetching;

  const { totalPartners = 0, criticalNeeds = [], collaborationOpportunities = [] } = data || {};
  const churchProfileLink = getChurchUrl(churchId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col" data-testid="dialog-area-intelligence">
        <DialogHeader className="text-center flex-shrink-0">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <PartyPopper className="w-8 h-8 text-primary" />
          </div>
          <DialogTitle className="text-2xl">
            Area Intelligence Unlocked!
          </DialogTitle>
          <DialogDescription className="text-base">
            You've defined your ministry area. Here's what we discovered about your mission field.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
        {showLoading ? (
          <AnimatedLoadingSteps isComplete={false} />
        ) : (
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-lg bg-primary/5 border border-primary/20">
                <Users className="w-6 h-6 mx-auto mb-1 text-primary" />
                <div className="text-xl font-bold text-primary">{totalPartners}</div>
                <div className="text-xs text-muted-foreground">Partners</div>
              </div>
              
              <div className="text-center p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
                <AlertTriangle className="w-6 h-6 mx-auto mb-1 text-orange-500" />
                <div className="text-xl font-bold text-orange-600">{criticalNeeds.length}</div>
                <div className="text-xs text-muted-foreground">Needs</div>
              </div>
              
              <div className="text-center p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                <Handshake className="w-6 h-6 mx-auto mb-1 text-green-500" />
                <div className="text-xl font-bold text-green-600">{collaborationOpportunities.length}</div>
                <div className="text-xs text-muted-foreground">Matches</div>
              </div>
            </div>

            {totalPartners > 0 && (
              <div className="p-4 rounded-lg bg-muted/50 border">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-primary" />
                  <span className="font-medium">Potential Church Partners</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  There are <span className="font-semibold text-primary">{totalPartners} churches</span> in your ministry area. 
                  You're not alone in this mission!
                </p>
              </div>
            )}

            {criticalNeeds.length > 0 && (
              <div className="p-4 rounded-lg bg-orange-500/5 border border-orange-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Heart className="w-4 h-4 text-orange-500" />
                  <span className="font-medium">Community Needs</span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  Your area has people who need support:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {criticalNeeds.slice(0, 5).map((need) => (
                    <Badge 
                      key={need.metricKey}
                      variant="outline"
                      className={`${need.level === 'critical' 
                        ? 'border-red-400 bg-red-500/10 text-red-700 dark:text-red-400 text-xs' 
                        : 'border-orange-400 bg-orange-500/10 text-orange-700 dark:text-orange-400 text-xs'
                      } ${onViewHotspot ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                      onClick={onViewHotspot ? () => {
                        onOpenChange(false);
                        onViewHotspot(need.metricKey);
                      } : undefined}
                      data-testid={`badge-popup-need-${need.metricKey}`}
                    >
                      {need.displayName}
                    </Badge>
                  ))}
                  {criticalNeeds.length > 5 && (
                    <Badge variant="outline" className="text-xs">
                      +{criticalNeeds.length - 5} more
                    </Badge>
                  )}
                </div>
                {onViewHotspot && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Click a need to view hotspots on the map
                  </p>
                )}
              </div>
            )}

            {collaborationOpportunities.length > 0 && (
              <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Handshake className="w-4 h-4 text-green-500" />
                  <span className="font-medium">Collaboration Opportunities</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-green-600">{collaborationOpportunities.length} churches</span> share 
                  your callings or have collaboration matches. The Kingdom is stronger together!
                </p>
              </div>
            )}

            {totalPartners === 0 && criticalNeeds.length === 0 && (
              <div className="p-4 rounded-lg bg-muted/50 border text-center">
                <MapPin className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  We're still gathering intelligence for your area. Check back soon!
                </p>
              </div>
            )}
          </div>
        )}
        </div>

        <div className="flex flex-col gap-2 flex-shrink-0 pt-2">
          <Button asChild data-testid="button-view-full-intelligence">
            <Link href={churchProfileLink}>
              <Sparkles className="w-4 h-4 mr-2" />
              View Full Area Intelligence
              <ChevronRight className="w-4 h-4 ml-1" />
            </Link>
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close-popup">
            Continue Exploring
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
