import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePlatformContext } from "@/contexts/PlatformContext";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle2, 
  Circle, 
  MapPin, 
  Download, 
  GitMerge, 
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  X,
  ArrowRight,
  ShieldCheck
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface SetupStatus {
  boundariesCount: number;
  totalChurches: number;
  outsideBoundsCount: number;
  duplicateClusters: number;
  needsReviewCount: number;
  notVerifiedYetCount: number;
  hasCompletedImport: boolean;
}

const WIZARD_DISMISSED_KEY = 'getting_started_wizard_dismissed';

export function GettingStartedWizard() {
  const { platformId, platform } = usePlatformContext();
  const { buildPlatformUrl } = usePlatformNavigation();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (platformId) {
      const dismissedPlatforms = JSON.parse(localStorage.getItem(WIZARD_DISMISSED_KEY) || '{}');
      setIsDismissed(!!dismissedPlatforms[platformId]);
    }
  }, [platformId]);

  const { data: setupStatus, isLoading, isError } = useQuery<SetupStatus>({
    queryKey: [`/api/admin/city-platforms/${platformId}/setup-status`],
    enabled: !!platformId && !isDismissed,
    staleTime: 60 * 1000,
  });

  // Don't render if no platform, dismissed, loading, error, or no data yet
  if (!platformId || isDismissed || isLoading || isError || !setupStatus) return null;

  const steps = [
    {
      id: 'boundaries',
      title: 'Define Boundaries',
      description: 'Draw or select geographic boundaries for your platform',
      isComplete: (setupStatus?.boundariesCount ?? 0) > 0,
      count: setupStatus?.boundariesCount ?? 0,
      countLabel: 'boundaries',
      href: buildPlatformUrl(`/admin/city-platforms/${platformId}/boundaries`),
      icon: MapPin,
    },
    {
      id: 'import',
      title: 'Import Churches',
      description: 'Multi-step import: search Google, filter by boundaries, remove duplicates',
      isComplete: setupStatus?.hasCompletedImport || (setupStatus?.totalChurches ?? 0) > 0,
      count: setupStatus?.totalChurches ?? 0,
      countLabel: 'churches imported',
      href: buildPlatformUrl('/admin/churches?tab=ingestion&openWizard=import'),
      icon: Download,
    },
    {
      id: 'duplicates',
      title: 'Clean Duplicates',
      description: 'Review and merge duplicate church entries',
      isComplete: (setupStatus?.duplicateClusters ?? 0) === 0 && (setupStatus?.totalChurches ?? 0) > 0,
      count: setupStatus?.duplicateClusters ?? 0,
      countLabel: 'duplicate clusters',
      href: buildPlatformUrl('/admin/churches?tab=ingestion&openWizard=dedupe'),
      icon: GitMerge,
      showWarning: (setupStatus?.duplicateClusters ?? 0) > 0,
    },
    {
      id: 'verify',
      title: 'Verify with Google',
      description: 'Cross-reference uploaded churches with Google Places',
      isComplete: (setupStatus?.notVerifiedYetCount ?? 0) === 0 && (setupStatus?.totalChurches ?? 0) > 0,
      count: setupStatus?.notVerifiedYetCount ?? 0,
      countLabel: 'not verified',
      href: buildPlatformUrl('/admin/churches?tab=platform'),
      icon: ShieldCheck,
      showWarning: (setupStatus?.notVerifiedYetCount ?? 0) > 0,
    },
    {
      id: 'review',
      title: 'Review Churches',
      description: 'Verify and approve imported church data',
      isComplete: (setupStatus?.needsReviewCount ?? 0) === 0 && (setupStatus?.totalChurches ?? 0) > 0,
      count: setupStatus?.needsReviewCount ?? 0,
      countLabel: 'need review',
      href: buildPlatformUrl('/admin/churches?tab=platform&openWizard=review'),
      icon: AlertCircle,
      showWarning: (setupStatus?.needsReviewCount ?? 0) > 0,
    },
  ];

  const completedSteps = steps.filter(s => s.isComplete).length;
  const progressPercent = (completedSteps / steps.length) * 100;
  const allComplete = completedSteps === steps.length;

  const handleDismiss = () => {
    if (platformId) {
      const dismissedPlatforms = JSON.parse(localStorage.getItem(WIZARD_DISMISSED_KEY) || '{}');
      dismissedPlatforms[platformId] = true;
      localStorage.setItem(WIZARD_DISMISSED_KEY, JSON.stringify(dismissedPlatforms));
      setIsDismissed(true);
    }
  };

  const currentStep = steps.find(s => !s.isComplete) || steps[steps.length - 1];

  return (
    <Card className="mb-6 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent" data-testid="card-getting-started-wizard">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  Getting Started with {platform?.name || 'Your Platform'}
                  {allComplete && (
                    <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      Complete
                    </Badge>
                  )}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {completedSteps} of {steps.length} steps complete
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {allComplete && (
                <Button variant="ghost" size="sm" onClick={handleDismiss} data-testid="button-dismiss-wizard">
                  <X className="h-4 w-4 mr-1" />
                  Dismiss
                </Button>
              )}
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" data-testid="button-toggle-wizard">
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
          <Progress value={progressPercent} className="h-2 mt-3" />
        </CardHeader>
        
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {steps.map((step, index) => {
                const Icon = step.icon;
                const isCurrent = step.id === currentStep.id && !step.isComplete;
                
                return (
                  <Link key={step.id} href={step.href}>
                    <div 
                      className={`flex items-center gap-4 p-3 rounded-lg border transition-colors hover-elevate cursor-pointer ${
                        isCurrent 
                          ? 'border-primary/50 bg-primary/5' 
                          : step.isComplete 
                            ? 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/30' 
                            : 'border-muted'
                      }`}
                      data-testid={`wizard-step-${step.id}`}
                    >
                      <div className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${
                        step.isComplete 
                          ? 'bg-green-100 dark:bg-green-900' 
                          : isCurrent 
                            ? 'bg-primary/10' 
                            : 'bg-muted'
                      }`}>
                        {step.isComplete ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                        ) : (
                          <span className="text-sm font-semibold text-muted-foreground">{index + 1}</span>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className={`font-medium ${step.isComplete ? 'text-green-700 dark:text-green-400' : ''}`}>
                            {step.title}
                          </span>
                          {step.showWarning && step.count > 0 && (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                              {step.count} {step.countLabel}
                            </Badge>
                          )}
                          {step.isComplete && step.count > 0 && (
                            <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                              {step.count} {step.countLabel}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {step.description}
                        </p>
                      </div>
                      
                      {isCurrent && (
                        <Button size="sm" className="shrink-0" data-testid={`button-start-${step.id}`}>
                          Start
                          <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
