import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { type CollaborationTag, type ChurchWithCallings } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  MapPin, 
  Users, 
  AlertTriangle, 
  Target,
  Building,
  Handshake,
  UserCog,
  Map as MapIcon,
  X,
  SkipForward,
  Info,
  HelpCircle,
  Tags
} from "lucide-react";
import { IconBuildingChurch } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { callingOptions, type CallingType } from "@shared/schema";
import { cn } from "@/lib/utils";

// Types
interface Platform {
  id: string;
  name: string;
  slug: string;
}

interface ClaimChurchWizardProps {
  churchId: string;
  churchName: string;
  platforms: Platform[];
  defaultPlatformId?: string;
  existingChurch?: ChurchWithCallings;
  onComplete: (data: WizardData) => void;
  onCancel: () => void;
}

export interface WizardData {
  selectedPlatformId: string;
  callingCategories: CallingType[];
  specificCallings: string[];
  facilityOwnership: 'own' | 'rent' | 'other';
  facilityAdequacy: 'adequate' | 'needs_improvement' | 'significantly_limited';
  unmetFacilityNeeds: string;
  // Space and colocation options (moved from collaboration step)
  seekSpace: boolean;
  openToCoLocation: boolean;
  shareSpace: boolean;
  facilityNotes: string;
  // Legacy field for backwards compatibility
  collaborationWillingness: {
    shareSpace: boolean;
    hostPartners: boolean;
    participateInPartners: boolean;
    seekSpace: boolean;
    openToCoLocation: boolean;
  };
  collaborationHave: string[];
  collaborationNeed: string[];
  roleSelection: 'owner' | 'administrator' | 'member';
  roleNotes: string;
}

// Calling category metadata with icons and descriptions
const CATEGORY_META: Record<CallingType, { 
  icon: typeof MapPin; 
  label: string; 
  description: string;
  color: string;
  example: string;
}> = {
  place: {
    icon: MapPin,
    label: "Called to a Place",
    description: "Your church has a geographic focus for ministry",
    color: "hsl(var(--calling-place))",
    example: "e.g., A specific neighborhood, urban core, or region",
  },
  people: {
    icon: Users,
    label: "Called to a People",
    description: "Your church ministers to a specific group of people",
    color: "hsl(var(--calling-people))",
    example: "e.g., Immigrants, single parents, youth, or marketplace leaders",
  },
  problem: {
    icon: AlertTriangle,
    label: "Called to a Problem",
    description: "Your church addresses specific societal challenges",
    color: "hsl(var(--calling-problem))",
    example: "e.g., Poverty relief, addiction recovery, or foster care",
  },
  purpose: {
    icon: Target,
    label: "Called to a Purpose",
    description: "Your church pursues a transformational mission",
    color: "hsl(var(--calling-purpose))",
    example: "e.g., Discipleship, justice, or evangelism",
  },
};

// Step definitions - platform step only shown when multiple platforms
// Note: Ministry boundary drawing happens AFTER claim approval, not during claim wizard
// Note: 'collaboration' step removed - space/colocation questions moved to 'facility' step
const STEPS = [
  { id: 'welcome', title: 'Welcome', icon: IconBuildingChurch },
  { id: 'platform', title: 'Platform', icon: MapPin }, // Only shown when multiple platforms
  { id: 'categories', title: 'Calling Types', icon: Target },
  { id: 'callings', title: 'Specific Callings', icon: Users },
  { id: 'facility', title: 'Facility', icon: Building },
  { id: 'collaborationTags', title: 'Offer & Need', icon: Tags },
  { id: 'role', title: 'Your Role', icon: UserCog },
  { id: 'confirm', title: 'Confirm', icon: Check },
] as const;

type StepId = typeof STEPS[number]['id'];

// Get initial wizard data
const getInitialWizardData = (defaultPlatformId?: string): WizardData => ({
  selectedPlatformId: defaultPlatformId || '',
  callingCategories: [],
  specificCallings: [],
  facilityOwnership: 'own',
  facilityAdequacy: 'adequate',
  unmetFacilityNeeds: '',
  // Space and colocation options
  seekSpace: false,
  openToCoLocation: false,
  shareSpace: false,
  facilityNotes: '',
  // Legacy field for backwards compatibility
  collaborationWillingness: {
    shareSpace: false,
    hostPartners: false,
    participateInPartners: false,
    seekSpace: false,
    openToCoLocation: false,
  },
  collaborationHave: [],
  collaborationNeed: [],
  roleSelection: 'member',
  roleNotes: '',
});

export function ClaimChurchWizard({ 
  churchId, 
  churchName, 
  platforms,
  defaultPlatformId,
  existingChurch,
  onComplete, 
  onCancel 
}: ClaimChurchWizardProps) {
  // Filter steps based on platform count
  const showPlatformStep = platforms.length > 1;
  const activeSteps = showPlatformStep 
    ? STEPS 
    : STEPS.filter(s => s.id !== 'platform');

  const [currentStep, setCurrentStep] = useState<StepId>('welcome');
  const [wizardData, setWizardData] = useState<WizardData>(() => 
    getInitialWizardData(defaultPlatformId || (platforms.length === 1 ? platforms[0].id : undefined))
  );
  const [skippedSteps, setSkippedSteps] = useState<Set<StepId>>(new Set());
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [hasExistingCallings, setHasExistingCallings] = useState(false);
  const [hasExistingCollaboration, setHasExistingCollaboration] = useState(false);
  const [hasExistingMinistryAreas, setHasExistingMinistryAreas] = useState(false);
  const [hasExistingPrayerBudget, setHasExistingPrayerBudget] = useState(false);
  const hasPrePopulated = useRef(false);

  const { data: fetchedChurch } = useQuery<ChurchWithCallings>({
    queryKey: [`/api/churches/${churchId}`],
    enabled: !!churchId && !existingChurch,
    staleTime: 60 * 1000,
  });

  const { data: churchAreasData } = useQuery<any[]>({
    queryKey: ['/api/areas', { church_id: churchId }],
    queryFn: async () => {
      const res = await fetch(`/api/areas?church_id=${churchId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!churchId,
    staleTime: 60 * 1000,
  });

  const { data: prayerBudgetData } = useQuery<any>({
    queryKey: ['/api/churches', churchId, 'prayer-budget'],
    queryFn: async () => {
      const res = await fetch(`/api/churches/${churchId}/prayer-budget`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!churchId,
    staleTime: 60 * 1000,
  });

  const churchData = existingChurch || fetchedChurch;

  useEffect(() => {
    if (!churchData || hasPrePopulated.current) return;
    hasPrePopulated.current = true;

    const updates: Partial<WizardData> = {};

    if (churchData.callings && churchData.callings.length > 0) {
      const callingIds = churchData.callings.map((c: any) => c.calling_id || c.value || c.id);
      const validCallingIds = callingIds.filter((id: string) => callingOptions.some(opt => opt.value === id));
      const matchedOptions = callingOptions.filter(opt => validCallingIds.includes(opt.value));
      const categories = [...new Set(matchedOptions.map(opt => opt.type))] as CallingType[];
      
      if (categories.length > 0) {
        updates.callingCategories = categories;
      }
      if (validCallingIds.length > 0) {
        updates.specificCallings = validCallingIds;
      }
      if (categories.length > 0 || validCallingIds.length > 0) {
        setHasExistingCallings(true);
      }
    }

    const collabHave = churchData.collaboration_have || [];
    const collabNeed = churchData.collaboration_need || [];
    if (collabHave.length > 0 || collabNeed.length > 0) {
      if (collabHave.length > 0) updates.collaborationHave = collabHave;
      if (collabNeed.length > 0) updates.collaborationNeed = collabNeed;
      setHasExistingCollaboration(true);
    }

    if (churchData.primary_ministry_area) {
      setHasExistingMinistryAreas(true);
    }

    if (Object.keys(updates).length > 0) {
      setWizardData(prev => ({ ...prev, ...updates }));
    }
  }, [churchData]);

  useEffect(() => {
    if (churchAreasData && Array.isArray(churchAreasData) && churchAreasData.length > 0) {
      setHasExistingMinistryAreas(true);
    }
  }, [churchAreasData]);

  useEffect(() => {
    if (prayerBudgetData && prayerBudgetData.budget && (prayerBudgetData.budget.monthly_budget > 0 || prayerBudgetData.budget.total_allocated > 0)) {
      setHasExistingPrayerBudget(true);
    }
  }, [prayerBudgetData]);

  const currentStepIndex = activeSteps.findIndex(s => s.id === currentStep);
  const progress = ((currentStepIndex + 1) / activeSteps.length) * 100;

  // Navigation
  const goToStep = useCallback((stepId: StepId) => {
    setCurrentStep(stepId);
  }, []);

  const goNext = useCallback(() => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < activeSteps.length) {
      setCurrentStep(activeSteps[nextIndex].id);
    }
  }, [currentStepIndex, activeSteps]);

  const goBack = useCallback(() => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(activeSteps[prevIndex].id);
    }
  }, [currentStepIndex, activeSteps]);

  const skipStep = useCallback(() => {
    setSkippedSteps(prev => new Set([...Array.from(prev), currentStep]));
    goNext();
  }, [currentStep, goNext]);

  const updateData = useCallback(<K extends keyof WizardData>(
    key: K, 
    value: WizardData[K]
  ) => {
    setWizardData(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleComplete = useCallback(() => {
    onComplete(wizardData);
  }, [wizardData, onComplete]);

  // Determine if step can proceed
  const canProceed = useCallback(() => {
    switch (currentStep) {
      case 'welcome':
        return true;
      case 'platform':
        return !!wizardData.selectedPlatformId;
      case 'categories':
        return wizardData.callingCategories.length > 0;
      case 'callings':
        return wizardData.specificCallings.length > 0;
      case 'facility':
        return true; // All options have defaults
      case 'collaborationTags':
        return true; // Optional - churches can skip collaboration tags
      case 'role':
        return true; // Has default
      case 'confirm':
        return true;
      default:
        return true;
    }
  }, [currentStep, wizardData]);

  // Check if step is skippable
  const isSkippable = useCallback(() => {
    return ['categories', 'callings', 'facility', 'collaborationTags'].includes(currentStep);
  }, [currentStep]);

  // Render current step content
  const renderStep = () => {
    switch (currentStep) {
      case 'welcome':
        return (
          <WelcomeStep
            churchName={churchName}
            hasExistingCallings={hasExistingCallings}
            hasExistingCollaboration={hasExistingCollaboration}
            hasExistingMinistryAreas={hasExistingMinistryAreas}
            hasExistingPrayerBudget={hasExistingPrayerBudget}
          />
        );
      case 'platform':
        return (
          <PlatformStep
            platforms={platforms}
            selectedPlatformId={wizardData.selectedPlatformId}
            onChange={(id) => updateData('selectedPlatformId', id)}
          />
        );
      case 'categories':
        return (
          <CategoriesStep 
            selected={wizardData.callingCategories}
            onChange={(categories) => updateData('callingCategories', categories)}
            hasExistingData={hasExistingCallings}
          />
        );
      case 'callings':
        return (
          <CallingsStep
            categories={wizardData.callingCategories}
            selected={wizardData.specificCallings}
            onChange={(callings) => updateData('specificCallings', callings)}
            hasExistingData={hasExistingCallings}
          />
        );
      case 'facility':
        return (
          <FacilityStep
            ownership={wizardData.facilityOwnership}
            adequacy={wizardData.facilityAdequacy}
            unmetNeeds={wizardData.unmetFacilityNeeds}
            seekSpace={wizardData.seekSpace}
            openToCoLocation={wizardData.openToCoLocation}
            shareSpace={wizardData.shareSpace}
            facilityNotes={wizardData.facilityNotes}
            onOwnershipChange={(v) => updateData('facilityOwnership', v)}
            onAdequacyChange={(v) => updateData('facilityAdequacy', v)}
            onUnmetNeedsChange={(v) => updateData('unmetFacilityNeeds', v)}
            onSeekSpaceChange={(v) => updateData('seekSpace', v)}
            onOpenToCoLocationChange={(v) => updateData('openToCoLocation', v)}
            onShareSpaceChange={(v) => updateData('shareSpace', v)}
            onFacilityNotesChange={(v) => updateData('facilityNotes', v)}
          />
        );
      case 'collaborationTags':
        return (
          <CollaborationTagsStep
            haveTags={wizardData.collaborationHave}
            needTags={wizardData.collaborationNeed}
            onHaveChange={(tags) => updateData('collaborationHave', tags)}
            onNeedChange={(tags) => updateData('collaborationNeed', tags)}
            hasExistingData={hasExistingCollaboration}
          />
        );
      case 'role':
        return (
          <RoleStep
            role={wizardData.roleSelection}
            notes={wizardData.roleNotes}
            onRoleChange={(r) => updateData('roleSelection', r)}
            onNotesChange={(n) => updateData('roleNotes', n)}
          />
        );
      case 'confirm':
        return (
          <ConfirmStep
            data={wizardData}
            skippedSteps={skippedSteps}
            onEditStep={goToStep}
            platforms={platforms}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full max-h-[80vh]" data-testid="claim-church-wizard">
      {/* Header with progress */}
      <div className="flex-shrink-0 border-b pb-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <IconBuildingChurch className="w-5 h-5 text-primary" />
            <span className="font-medium text-sm">Claim {churchName}</span>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onCancel}
            className="h-8 w-8"
            data-testid="button-close-wizard"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
        
        {/* Progress bar */}
        <Progress value={progress} className="h-1.5 mb-2" />
        
        {/* Step indicators */}
        <div className="flex items-center justify-between px-2">
          {activeSteps.map((step, idx) => {
            const isActive = currentStep === step.id;
            const isCompleted = idx < currentStepIndex;
            const isSkipped = skippedSteps.has(step.id);
            const StepIcon = step.icon;
            
            return (
              <Tooltip key={step.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => idx <= currentStepIndex && goToStep(step.id)}
                    disabled={idx > currentStepIndex}
                    className={cn(
                      "flex flex-col items-center gap-1 transition-all",
                      idx <= currentStepIndex ? "cursor-pointer" : "cursor-not-allowed opacity-50",
                    )}
                    data-testid={`step-indicator-${step.id}`}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                      isActive && "bg-primary text-primary-foreground",
                      isCompleted && !isSkipped && "bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-400",
                      isSkipped && "bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400",
                      !isActive && !isCompleted && !isSkipped && "bg-muted text-muted-foreground",
                    )}>
                      {isCompleted && !isSkipped ? (
                        <Check className="w-4 h-4" />
                      ) : isSkipped ? (
                        <SkipForward className="w-4 h-4" />
                      ) : (
                        <StepIcon className="w-4 h-4" />
                      )}
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{step.title}</p>
                  {isSkipped && <p className="text-xs text-amber-500">Skipped</p>}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <ScrollArea className="flex-1 pr-4">
        {renderStep()}
      </ScrollArea>

      {/* Footer with navigation */}
      <div className="flex-shrink-0 border-t pt-4 mt-4">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            onClick={goBack}
            disabled={currentStepIndex === 0}
            className="gap-1"
            data-testid="button-wizard-back"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>

          <div className="flex items-center gap-2">
            {isSkippable() && (
              <Button
                variant="ghost"
                onClick={skipStep}
                className="text-muted-foreground gap-1"
                data-testid="button-wizard-skip"
              >
                <SkipForward className="w-4 h-4" />
                Skip
              </Button>
            )}
            
            {currentStep === 'confirm' ? (
              <Button 
                onClick={handleComplete}
                className="gap-1"
                data-testid="button-wizard-complete"
              >
                <Check className="w-4 h-4" />
                Claim Church
              </Button>
            ) : (
              <Button
                onClick={goNext}
                disabled={!canProceed()}
                className="gap-1"
                data-testid="button-wizard-next"
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
        
        <p className="text-xs text-muted-foreground text-center mt-2">
          You can edit all of this later from your church profile
        </p>
      </div>
    </div>
  );
}

// Step Components

function WelcomeStep({ 
  churchName,
  hasExistingCallings,
  hasExistingCollaboration,
  hasExistingMinistryAreas,
  hasExistingPrayerBudget,
}: { 
  churchName: string;
  hasExistingCallings: boolean;
  hasExistingCollaboration: boolean;
  hasExistingMinistryAreas: boolean;
  hasExistingPrayerBudget: boolean;
}) {
  const hasAnyExistingData = hasExistingCallings || hasExistingCollaboration || hasExistingMinistryAreas || hasExistingPrayerBudget;

  return (
    <div className="space-y-6 text-center py-8">
      <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
        <IconBuildingChurch className="w-8 h-8 text-primary" />
      </div>
      
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">Claim {churchName}</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          This wizard will help you set up your church profile and connect with other churches in your area.
        </p>
      </div>

      {hasAnyExistingData && (
        <Card className="text-left max-w-lg mx-auto" data-testid="card-existing-data-summary">
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="font-medium text-sm">Some setup is already complete</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              This church already has some data configured. You can review and adjust it during the wizard, or skip those steps.
            </p>
            <div className="space-y-2">
              {hasExistingCallings && (
                <div className="flex items-center gap-2 text-sm" data-testid="status-existing-callings">
                  <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="text-muted-foreground">Ministry callings defined</span>
                </div>
              )}
              {hasExistingCollaboration && (
                <div className="flex items-center gap-2 text-sm" data-testid="status-existing-collaboration">
                  <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="text-muted-foreground">Collaboration tags configured</span>
                </div>
              )}
              {hasExistingMinistryAreas && (
                <div className="flex items-center gap-2 text-sm" data-testid="status-existing-ministry-areas">
                  <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="text-muted-foreground">Ministry areas defined</span>
                </div>
              )}
              {hasExistingPrayerBudget && (
                <div className="flex items-center gap-2 text-sm" data-testid="status-existing-prayer-budget">
                  <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="text-muted-foreground">Prayer budget configured</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="text-left max-w-lg mx-auto">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Target className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h4 className="font-medium">Share your ministry callings</h4>
              <p className="text-sm text-muted-foreground">Help others discover what your church focuses on outside its walls</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Handshake className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h4 className="font-medium">Find collaboration opportunities</h4>
              <p className="text-sm text-muted-foreground">Connect with churches sharing similar callings or complementary resources</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <MapIcon className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h4 className="font-medium">Map your ministry reach</h4>
              <p className="text-sm text-muted-foreground">Show where your church goes to serve, not just where it's located</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Info className="w-4 h-4" />
        <span>Takes about 3-5 minutes. You can skip steps and edit later.</span>
      </div>
    </div>
  );
}

function PlatformStep({
  platforms,
  selectedPlatformId,
  onChange,
}: {
  platforms: Platform[];
  selectedPlatformId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">Select a Platform</h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          This church is part of multiple city platforms. Choose which platform you'd like to claim this church for.
        </p>
      </div>

      <RadioGroup value={selectedPlatformId} onValueChange={onChange}>
        <div className="grid gap-3">
          {platforms.map((platform) => {
            const isSelected = selectedPlatformId === platform.id;
            
            return (
              <Card
                key={platform.id}
                className={cn(
                  "cursor-pointer transition-all hover-elevate",
                  isSelected && "ring-2 ring-primary",
                )}
                onClick={() => onChange(platform.id)}
                data-testid={`platform-card-${platform.id}`}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium">{platform.name}</h3>
                    <p className="text-sm text-muted-foreground">/{platform.slug}</p>
                  </div>
                  <RadioGroupItem 
                    value={platform.id}
                    id={`platform-${platform.id}`}
                    className="pointer-events-none"
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </RadioGroup>

      {!selectedPlatformId && (
        <p className="text-center text-sm text-muted-foreground">
          Select a platform to continue
        </p>
      )}
    </div>
  );
}

function CategoriesStep({ 
  selected, 
  onChange,
  hasExistingData = false,
}: { 
  selected: CallingType[];
  onChange: (categories: CallingType[]) => void;
  hasExistingData?: boolean;
}) {
  const toggleCategory = (category: CallingType) => {
    if (selected.includes(category)) {
      onChange(selected.filter(c => c !== category));
    } else {
      onChange([...selected, category]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">What is your church called to?</h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          {hasExistingData
            ? "Your church's current calling focus is shown below. Adjust as needed."
            : <>Select the types of callings that define your church's ministry <strong>outside its walls</strong>. Most churches have multiple callings—you'll narrow your focus in the next step.</>
          }
        </p>
      </div>

      {hasExistingData && (
        <div className="flex items-center gap-3 p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800" data-testid="banner-existing-callings">
          <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center flex-shrink-0">
            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Calling types already defined</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">Your current selections are pre-filled below. You can adjust them or skip this step.</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md p-3">
        <HelpCircle className="w-4 h-4 flex-shrink-0" />
        <span>Callings describe where and how your church ministers in the community - not internal programs.</span>
      </div>

      <div className="grid gap-3">
        {(Object.keys(CATEGORY_META) as CallingType[]).map((category) => {
          const meta = CATEGORY_META[category];
          const Icon = meta.icon;
          const isSelected = selected.includes(category);
          
          return (
            <Card
              key={category}
              className={cn(
                "cursor-pointer transition-all hover-elevate",
                isSelected && "ring-2 ring-primary",
              )}
              onClick={() => toggleCategory(category)}
              data-testid={`category-card-${category}`}
            >
              <CardContent className="flex items-start gap-4 p-4">
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${meta.color}20` }}
                >
                  <Icon className="w-5 h-5" style={{ color: meta.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-medium">{meta.label}</h3>
                    <Checkbox 
                      checked={isSelected}
                      className="pointer-events-none"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{meta.description}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1 italic">{meta.example}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selected.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          Select at least one category to continue
        </p>
      )}
    </div>
  );
}

function CallingsStep({
  categories,
  selected,
  onChange,
  hasExistingData = false,
}: {
  categories: CallingType[];
  selected: string[];
  onChange: (callings: string[]) => void;
  hasExistingData?: boolean;
}) {
  const toggleCalling = (callingValue: string) => {
    if (selected.includes(callingValue)) {
      onChange(selected.filter(c => c !== callingValue));
    } else {
      onChange([...selected, callingValue]);
    }
  };

  // Filter callings by selected categories
  const filteredCallings = callingOptions.filter(c => categories.includes(c.type));

  // Group by category
  const groupedCallings = categories.reduce((acc, cat) => {
    acc[cat] = filteredCallings.filter(c => c.type === cat);
    return acc;
  }, {} as Record<CallingType, typeof callingOptions>);

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">Select specific callings</h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          {hasExistingData
            ? "Your church's current callings are selected. Add or remove as needed."
            : "Choose the specific ministries your church actively pursues in the community."
          }
        </p>
      </div>

      {hasExistingData && selected.length > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800" data-testid="banner-existing-specific-callings">
          <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center flex-shrink-0">
            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">{selected.length} calling{selected.length !== 1 ? 's' : ''} already defined</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">Your current selections are shown below. You can adjust them or skip this step.</p>
          </div>
        </div>
      )}

      {categories.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">
            Go back and select at least one calling category first.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {categories.map((category) => {
            const meta = CATEGORY_META[category];
            const callings = groupedCallings[category] || [];
            
            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-3">
                  <div 
                    className="w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: `${meta.color}20` }}
                  >
                    <meta.icon className="w-3 h-3" style={{ color: meta.color }} />
                  </div>
                  <h3 className="font-medium text-sm">{meta.label}</h3>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  {callings.map((calling) => {
                    const isSelected = selected.includes(calling.value);
                    return (
                      <Badge
                        key={calling.value}
                        variant={isSelected ? "default" : "outline"}
                        className={cn(
                          "cursor-pointer transition-all py-1.5 px-3",
                          isSelected && "ring-1 ring-primary/50",
                        )}
                        onClick={() => toggleCalling(calling.value)}
                        data-testid={`calling-badge-${calling.value}`}
                      >
                        {calling.label}
                        {isSelected && <Check className="w-3 h-3 ml-1" />}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected.length > 0 && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Check className="w-4 h-4 text-emerald-500" />
          <span>{selected.length} calling{selected.length !== 1 ? 's' : ''} selected</span>
        </div>
      )}
    </div>
  );
}

function FacilityStep({
  ownership,
  adequacy,
  unmetNeeds,
  seekSpace,
  openToCoLocation,
  shareSpace,
  facilityNotes,
  onOwnershipChange,
  onAdequacyChange,
  onUnmetNeedsChange,
  onSeekSpaceChange,
  onOpenToCoLocationChange,
  onShareSpaceChange,
  onFacilityNotesChange,
}: {
  ownership: WizardData['facilityOwnership'];
  adequacy: WizardData['facilityAdequacy'];
  unmetNeeds: string;
  seekSpace: boolean;
  openToCoLocation: boolean;
  shareSpace: boolean;
  facilityNotes: string;
  onOwnershipChange: (v: WizardData['facilityOwnership']) => void;
  onAdequacyChange: (v: WizardData['facilityAdequacy']) => void;
  onUnmetNeedsChange: (v: string) => void;
  onSeekSpaceChange: (v: boolean) => void;
  onOpenToCoLocationChange: (v: boolean) => void;
  onShareSpaceChange: (v: boolean) => void;
  onFacilityNotesChange: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">Tell us about your facility</h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          This helps us match churches for potential space-sharing and collaboration.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Facility Ownership</CardTitle>
          <CardDescription>Does your church own or rent its facility?</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={ownership} onValueChange={(v) => onOwnershipChange(v as typeof ownership)}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="own" id="own" />
              <Label htmlFor="own">We own our building</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="rent" id="rent" />
              <Label htmlFor="rent">We rent or lease space</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="other" id="other" />
              <Label htmlFor="other">Other arrangement (shared, mobile, etc.)</Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Facility Adequacy</CardTitle>
          <CardDescription>How well does your current space support your ministry?</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={adequacy} onValueChange={(v) => onAdequacyChange(v as typeof adequacy)}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="adequate" id="adequate" />
              <Label htmlFor="adequate">Adequate for our current needs</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="needs_improvement" id="needs_improvement" />
              <Label htmlFor="needs_improvement">Could use some improvements</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="significantly_limited" id="significantly_limited" />
              <Label htmlFor="significantly_limited">Significantly limits our ministry</Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {(adequacy === 'needs_improvement' || adequacy === 'significantly_limited') && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What facilities would help?</CardTitle>
            <CardDescription>Describe any unmet facility needs (optional)</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="e.g., Need more parking, larger fellowship hall, commercial kitchen..."
              value={unmetNeeds}
              onChange={(e) => onUnmetNeedsChange(e.target.value)}
              className="resize-none"
              rows={3}
              data-testid="input-unmet-needs"
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Space Sharing & Co-location</CardTitle>
          <CardDescription>Are you open to sharing space with other churches or ministries?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div 
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all hover-elevate",
              shareSpace && "ring-2 ring-primary bg-primary/5"
            )}
            onClick={() => onShareSpaceChange(!shareSpace)}
            data-testid="facility-share-space"
          >
            <Checkbox checked={shareSpace} onCheckedChange={onShareSpaceChange} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">Willing to share our space</span>
                <Badge variant="outline" className="text-xs">OFFER</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">We have capacity and would consider letting other ministries use our facility</p>
            </div>
          </div>
          
          <div 
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all hover-elevate",
              seekSpace && "ring-2 ring-primary bg-primary/5"
            )}
            onClick={() => onSeekSpaceChange(!seekSpace)}
            data-testid="facility-seek-space"
          >
            <Checkbox checked={seekSpace} onCheckedChange={onSeekSpaceChange} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">Looking for space</span>
                <Badge variant="outline" className="text-xs">NEED</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">We need additional or better space for our ministries</p>
            </div>
          </div>
          
          <div 
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all hover-elevate",
              openToCoLocation && "ring-2 ring-primary bg-primary/5"
            )}
            onClick={() => onOpenToCoLocationChange(!openToCoLocation)}
            data-testid="facility-colocation"
          >
            <Checkbox checked={openToCoLocation} onCheckedChange={onOpenToCoLocationChange} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">Open to co-location</span>
                <Badge variant="outline" className="text-xs">OFFER/NEED</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">We would consider sharing a building with another congregation</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Additional Notes</CardTitle>
          <CardDescription>Any other details about your facility situation (optional)</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="e.g., Available times for space sharing, specific requirements, etc..."
            value={facilityNotes}
            onChange={(e) => onFacilityNotesChange(e.target.value)}
            className="resize-none"
            rows={3}
            data-testid="input-facility-notes"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function CollaborationTagsStep({
  haveTags,
  needTags,
  onHaveChange,
  onNeedChange,
  hasExistingData = false,
}: {
  haveTags: string[];
  needTags: string[];
  onHaveChange: (tags: string[]) => void;
  onNeedChange: (tags: string[]) => void;
  hasExistingData?: boolean;
}) {
  const { data: taxonomyData, isLoading } = useQuery<{ tags: CollaborationTag[] }>({
    queryKey: ["/api/collaboration-taxonomy"],
    staleTime: 5 * 60 * 1000,
  });

  const activeTags = (taxonomyData?.tags || []).filter(tag => tag.is_active);

  const toggleHave = (slug: string) => {
    if (haveTags.includes(slug)) {
      onHaveChange(haveTags.filter(t => t !== slug));
    } else {
      onHaveChange([...haveTags, slug]);
    }
  };

  const toggleNeed = (slug: string) => {
    if (needTags.includes(slug)) {
      onNeedChange(needTags.filter(t => t !== slug));
    } else {
      onNeedChange([...needTags, slug]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">What We Offer & Need</h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          {hasExistingData
            ? "Your church's current collaboration tags are shown below. Adjust as needed."
            : "Select the ministries and resources your church excels at and can share with partner churches."
          }
        </p>
      </div>

      {hasExistingData && (
        <div className="flex items-center gap-3 p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800" data-testid="banner-existing-collaboration">
          <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center flex-shrink-0">
            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Collaboration tags already configured</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">Your current offer/need tags are pre-filled below. You can adjust them or skip this step.</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 rounded-md p-3">
        <Info className="w-4 h-4 flex-shrink-0" />
        <span>These tags help other churches discover collaboration opportunities with you.</span>
      </div>

      {isLoading ? (
        <div className="grid gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-14 bg-muted animate-pulse rounded-md" />
          ))}
        </div>
      ) : activeTags.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Tags className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No collaboration tags available yet.</p>
        </div>
      ) : (
        <ScrollArea className="h-[320px] pr-4">
          <div className="space-y-1">
            {activeTags.map((tag) => {
              const hasOffer = haveTags.includes(tag.slug);
              const hasNeed = needTags.includes(tag.slug);
              
              return (
                <div
                  key={tag.slug}
                  className="flex items-center justify-between gap-2 py-2 px-2 rounded-md hover-elevate"
                  data-testid={`collab-tag-${tag.slug}`}
                >
                  <span className="text-sm flex-1 min-w-0 truncate">{tag.label}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge
                      variant="outline"
                      className={cn(
                        "cursor-pointer transition-all",
                        hasOffer 
                          ? "bg-emerald-100 border-emerald-500 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" 
                          : "border-muted-foreground/30 text-muted-foreground"
                      )}
                      onClick={() => toggleHave(tag.slug)}
                      data-testid={`toggle-offer-${tag.slug}`}
                    >
                      {hasOffer && <Check className="w-3 h-3 mr-0.5" />}
                      Offer
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        "cursor-pointer transition-all",
                        hasNeed 
                          ? "bg-amber-100 border-amber-500 text-amber-700 dark:bg-amber-900 dark:text-amber-300" 
                          : "border-muted-foreground/30 text-muted-foreground"
                      )}
                      onClick={() => toggleNeed(tag.slug)}
                      data-testid={`toggle-need-${tag.slug}`}
                    >
                      {hasNeed && <Check className="w-3 h-3 mr-0.5" />}
                      Need
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {(haveTags.length > 0 || needTags.length > 0) && (
        <div className="border-t pt-4 space-y-3">
          {haveTags.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">What we offer ({haveTags.length}):</p>
              <div className="flex flex-wrap gap-2">
                {haveTags.map((slug) => {
                  const tag = activeTags.find(t => t.slug === slug);
                  return (
                    <Badge key={`have-${slug}`} className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                      {tag?.label || slug}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}
          {needTags.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">What we need ({needTags.length}):</p>
              <div className="flex flex-wrap gap-2">
                {needTags.map((slug) => {
                  const tag = activeTags.find(t => t.slug === slug);
                  return (
                    <Badge key={`need-${slug}`} className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                      {tag?.label || slug}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RoleStep({
  role,
  notes,
  onRoleChange,
  onNotesChange,
}: {
  role: WizardData['roleSelection'];
  notes: string;
  onRoleChange: (r: WizardData['roleSelection']) => void;
  onNotesChange: (n: string) => void;
}) {
  const roles = [
    {
      value: 'owner' as const,
      title: 'Church Owner/Lead Pastor',
      description: 'Full control over the church profile and can manage all team members',
      icon: UserCog,
    },
    {
      value: 'administrator' as const,
      title: 'Administrator',
      description: 'Can edit church information and manage content, but cannot transfer ownership',
      icon: Users,
    },
    {
      value: 'member' as const,
      title: 'Team Member',
      description: 'Can view and participate, but limited editing permissions',
      icon: IconBuildingChurch,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">Your Role at This Church</h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Select the role that best describes your position. This can be changed later.
        </p>
      </div>

      <RadioGroup value={role} onValueChange={(v) => onRoleChange(v as typeof role)}>
        <div className="grid gap-3">
          {roles.map((r) => {
            const Icon = r.icon;
            const isSelected = role === r.value;
            
            return (
              <Card
                key={r.value}
                className={cn(
                  "cursor-pointer transition-all hover-elevate",
                  isSelected && "ring-2 ring-primary",
                )}
                onClick={() => onRoleChange(r.value)}
                data-testid={`role-option-${r.value}`}
              >
                <CardContent className="flex items-start gap-4 p-4">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-medium">{r.title}</h3>
                      <RadioGroupItem value={r.value} className="pointer-events-none" />
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{r.description}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </RadioGroup>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Additional Notes (Optional)</CardTitle>
          <CardDescription>Anything else we should know about your role or connection to this church?</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="e.g., I'm the Associate Pastor, or I lead the outreach ministry..."
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            className="resize-none"
            rows={3}
            data-testid="input-role-notes"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ConfirmStep({
  data,
  skippedSteps,
  onEditStep,
  platforms,
}: {
  data: WizardData;
  skippedSteps: Set<StepId>;
  onEditStep: (step: StepId) => void;
  platforms: Platform[];
}) {
  const selectedCallings = callingOptions.filter(c => data.specificCallings.includes(c.value));
  const selectedPlatform = platforms.find(p => p.id === data.selectedPlatformId);
  
  const getSummaryItems = () => {
    const items: { label: string; value: string | JSX.Element; step: StepId; skipped?: boolean }[] = [];

    // Platform (only if multiple platforms)
    if (platforms.length > 1) {
      items.push({
        label: 'Platform',
        value: selectedPlatform?.name || 'Not selected',
        step: 'platform',
      });
    }

    // Categories
    items.push({
      label: 'Calling Types',
      value: data.callingCategories.length > 0 
        ? data.callingCategories.map(c => CATEGORY_META[c].label).join(', ')
        : 'None selected',
      step: 'categories',
      skipped: skippedSteps.has('categories'),
    });

    // Specific callings
    items.push({
      label: 'Specific Callings',
      value: selectedCallings.length > 0 
        ? (
          <div className="flex flex-wrap gap-1">
            {selectedCallings.slice(0, 5).map(c => (
              <Badge key={c.value} variant="secondary" className="text-xs">{c.label}</Badge>
            ))}
            {selectedCallings.length > 5 && (
              <Badge variant="outline" className="text-xs">+{selectedCallings.length - 5} more</Badge>
            )}
          </div>
        )
        : 'None selected',
      step: 'callings',
      skipped: skippedSteps.has('callings'),
    });

    // Facility
    const facilityLabels = {
      own: 'Own building',
      rent: 'Rent/Lease',
      other: 'Other arrangement',
    };
    const adequacyLabels = {
      adequate: 'Adequate',
      needs_improvement: 'Needs improvement',
      significantly_limited: 'Significantly limited',
    };
    items.push({
      label: 'Facility',
      value: `${facilityLabels[data.facilityOwnership]} - ${adequacyLabels[data.facilityAdequacy]}`,
      step: 'facility',
      skipped: skippedSteps.has('facility'),
    });

    // Space Sharing options (now part of facility step)
    const spaceOptions = [];
    if (data.shareSpace) spaceOptions.push('Willing to share space');
    if (data.seekSpace) spaceOptions.push('Looking for space');
    if (data.openToCoLocation) spaceOptions.push('Open to co-location');
    if (spaceOptions.length > 0) {
      items.push({
        label: 'Space Sharing',
        value: spaceOptions.join(', '),
        step: 'facility',
        skipped: skippedSteps.has('facility'),
      });
    }

    // Offer & Need (combined)
    const hasOfferOrNeed = data.collaborationHave.length > 0 || data.collaborationNeed.length > 0;
    items.push({
      label: 'Offer & Need',
      value: hasOfferOrNeed 
        ? (
          <div className="space-y-1">
            {data.collaborationHave.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {data.collaborationHave.slice(0, 3).map(slug => (
                  <Badge key={`have-${slug}`} className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                    {slug}
                  </Badge>
                ))}
                {data.collaborationHave.length > 3 && (
                  <Badge variant="outline" className="text-xs">+{data.collaborationHave.length - 3} more offers</Badge>
                )}
              </div>
            )}
            {data.collaborationNeed.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {data.collaborationNeed.slice(0, 3).map(slug => (
                  <Badge key={`need-${slug}`} className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                    {slug}
                  </Badge>
                ))}
                {data.collaborationNeed.length > 3 && (
                  <Badge variant="outline" className="text-xs">+{data.collaborationNeed.length - 3} more needs</Badge>
                )}
              </div>
            )}
          </div>
        )
        : 'None selected',
      step: 'collaborationTags',
      skipped: skippedSteps.has('collaborationTags'),
    });

    // Role
    const roleLabels = {
      owner: 'Owner/Lead Pastor',
      administrator: 'Administrator',
      member: 'Team Member',
    };
    items.push({
      label: 'Your Role',
      value: roleLabels[data.roleSelection],
      step: 'role',
    });

    return items;
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
          <Check className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-xl font-semibold">Ready to Claim</h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Review your selections below. You can edit any of this later from your church profile.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 divide-y">
          {getSummaryItems().map((item, idx) => (
            <div key={idx} className="flex items-start justify-between py-3 first:pt-0 last:pb-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{item.label}</span>
                  {item.skipped && (
                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                      Skipped
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {typeof item.value === 'string' ? item.value : item.value}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEditStep(item.step)}
                className="text-xs gap-1 flex-shrink-0"
                data-testid={`button-edit-${item.step}`}
              >
                Edit
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="text-center text-sm text-muted-foreground">
        After claiming, you'll have full access to edit your church profile, 
        respond to prayer requests, and connect with other churches.
      </div>
    </div>
  );
}
