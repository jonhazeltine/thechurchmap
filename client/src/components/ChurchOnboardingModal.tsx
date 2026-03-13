import { useState, useCallback, useEffect, useMemo } from "react";
import { getStateFromCoordinates } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { usePlatformContext } from "@/contexts/PlatformContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Search, 
  Plus, 
  MapPin, 
  ChevronLeft, 
  Building,
  Loader2,
  CheckCircle2,
  ArrowRight,
  Map as MapIcon
} from "lucide-react";
import { IconBuildingChurch } from "@tabler/icons-react";
import { useLocation } from "wouter";
import { ClaimChurchWizard, type WizardData } from "./ClaimChurchWizard";
import { ChurchForm } from "./ChurchForm";
import type { ChurchWithCallings, Calling, InsertChurch } from "@shared/schema";
import { cn } from "@/lib/utils";

type ModalStep = 'platform' | 'search' | 'claim' | 'add' | 'success' | 'claim_success';

interface ChurchOnboardingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callings: Calling[];
  onCreateChurch: (data: InsertChurch, platformId?: string) => Promise<{ id: string; name: string } | void>;
  onClaimSubmit: (churchId: string, platformId: string, wizardData: WizardData) => Promise<void>;
  isCreating?: boolean;
}

interface Platform {
  id: string;
  name: string;
  slug: string;
}

interface SearchResult {
  id: string;
  name: string;
  address: string;
  city?: string;
  state?: string;
  is_claimed?: boolean;
  platform_ids?: string[];
}

export function ChurchOnboardingModal({
  open,
  onOpenChange,
  callings,
  onCreateChurch,
  onClaimSubmit,
  isCreating = false,
}: ChurchOnboardingModalProps) {
  const { platformId: contextPlatformId, platform: contextPlatform } = usePlatformContext();
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Derive platform state code and center for place search biasing
  const platformStateCode = useMemo(() => {
    if (contextPlatform?.default_center_lat && contextPlatform?.default_center_lng) {
      return getStateFromCoordinates(contextPlatform.default_center_lng, contextPlatform.default_center_lat);
    }
    return null;
  }, [contextPlatform?.default_center_lat, contextPlatform?.default_center_lng]);
  
  const platformCenter = useMemo((): [number, number] | undefined => {
    if (contextPlatform?.default_center_lat && contextPlatform?.default_center_lng) {
      return [contextPlatform.default_center_lng, contextPlatform.default_center_lat];
    }
    return undefined;
  }, [contextPlatform?.default_center_lat, contextPlatform?.default_center_lng]);
  
  const [step, setStep] = useState<ModalStep>('search');
  // Use the resolved platform UUID (from contextPlatform.id), not the URL slug
  const resolvedPlatformId = contextPlatform?.id || '';
  const [selectedPlatformId, setSelectedPlatformId] = useState<string>(resolvedPlatformId);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChurch, setSelectedChurch] = useState<SearchResult | null>(null);
  const [newlyCreatedChurch, setNewlyCreatedChurch] = useState<{ id: string; name: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const platformsQuery = useQuery<Platform[]>({
    queryKey: ["/api/platforms/user"],
    enabled: !contextPlatformId && open,
  });
  const { data: platforms, isLoading: platformsLoading } = platformsQuery;

  const { data: searchResults, isLoading: searchLoading } = useQuery<SearchResult[]>({
    queryKey: ["/api/churches/search", searchQuery, selectedPlatformId],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return [];
      const params = new URLSearchParams({ q: searchQuery });
      if (selectedPlatformId) {
        params.append('city_platform_id', selectedPlatformId);
      }
      const res = await fetch(`/api/churches/search?${params}`);
      if (!res.ok) throw new Error('Search failed');
      return res.json();
    },
    enabled: searchQuery.length >= 2 && step === 'search' && !!selectedPlatformId,
    staleTime: 10000,
  });

  // Initialize step and platform when modal opens or platform data loads
  useEffect(() => {
    if (open) {
      // Use resolved UUID from contextPlatform, not the URL slug from contextPlatformId
      if (contextPlatform?.id) {
        setSelectedPlatformId(contextPlatform.id);
        setStep('search');
      } else if (platforms) {
        if (platforms.length === 1) {
          setSelectedPlatformId(platforms[0].id);
          setStep('search');
        } else if (platforms.length > 1) {
          setStep('platform');
        }
      }
    }
  }, [open, contextPlatform?.id, platforms]);

  const resetModal = useCallback(() => {
    setSearchQuery('');
    setSelectedChurch(null);
    setNewlyCreatedChurch(null);
    // Step and platform will be reset by the useEffect on next open
  }, []);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetModal();
    }
    onOpenChange(open);
  };

  const [isCheckingClaim, setIsCheckingClaim] = useState(false);
  
  const handleSelectChurch = async (church: SearchResult) => {
    // If user is not logged in, redirect to login
    if (!user) {
      handleOpenChange(false);
      toast({
        title: "Account Required",
        description: "Please log in or create an account to claim a church.",
      });
      const currentUrl = window.location.pathname + window.location.search;
      navigate(`/login?redirect=${encodeURIComponent(currentUrl)}`);
      return;
    }
    
    // Check claim status before starting wizard
    if (selectedPlatformId) {
      setIsCheckingClaim(true);
      try {
        const { supabase } = await import("../../../lib/supabaseClient");
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || '';
        
        const response = await fetch(`/api/churches/${church.id}/claim?platform_id=${selectedPlatformId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (response.ok) {
          const claimData = await response.json();
          
          if (claimData.is_claimed) {
            const claimantName = claimData.claimed_by_current_user 
              ? 'You' 
              : (claimData.claimant_name || 'Another user');
            toast({
              title: "Church Already Claimed",
              description: `This church has already been claimed by ${claimantName}.`,
              variant: "destructive",
            });
            setIsCheckingClaim(false);
            return;
          }
          
          if (claimData.has_pending_claim && claimData.pending_claim_by_other_user) {
            toast({
              title: "Claim Pending",
              description: "Another user has already submitted a claim for this church that is pending review.",
              variant: "destructive",
            });
            setIsCheckingClaim(false);
            return;
          }
        }
      } catch (error) {
        console.error('Error checking claim status:', error);
        // Continue anyway if check fails
      }
      setIsCheckingClaim(false);
    }
    
    setSelectedChurch(church);
    setStep('claim');
  };

  const handleAddNewChurch = () => {
    setStep('add');
  };

  const handleBack = () => {
    if (step === 'claim' || step === 'add') {
      setStep('search');
      setSelectedChurch(null);
    } else if (step === 'platform') {
      handleOpenChange(false);
    }
  };

  const handleChurchCreated = async (data: InsertChurch) => {
    try {
      // Pass the selectedPlatformId so the church gets linked to the platform with pending status
      const result = await onCreateChurch(data, selectedPlatformId || undefined);
      if (result) {
        setNewlyCreatedChurch(result);
        setStep('success');
      }
    } catch (error) {
      console.error('Failed to create church:', error);
    }
  };

  const handleClaimNewChurch = () => {
    // If user is not logged in, redirect to login
    if (!user) {
      handleOpenChange(false);
      toast({
        title: "Account Required",
        description: "Please log in or create an account to claim a church.",
      });
      const currentUrl = window.location.pathname + window.location.search;
      navigate(`/login?redirect=${encodeURIComponent(currentUrl)}`);
      return;
    }
    if (newlyCreatedChurch) {
      setSelectedChurch({
        id: newlyCreatedChurch.id,
        name: newlyCreatedChurch.name,
        address: '',
      });
      setStep('claim');
    }
  };

  const [, navigate] = useLocation();
  
  // Key for storing pending claim data in sessionStorage
  const PENDING_CLAIM_KEY = 'pending_church_claim';
  
  const handleClaimComplete = async (wizardData: WizardData) => {
    if (!selectedChurch) return;
    if (!wizardData.selectedPlatformId) {
      console.error('Cannot submit claim without platform ID');
      toast({
        title: "Platform Required",
        description: "Please select a platform before submitting your claim.",
        variant: "destructive",
      });
      return;
    }
    
    // If user is not logged in, save claim data and redirect to login
    if (!user) {
      const pendingClaim = {
        churchId: selectedChurch.id,
        churchName: selectedChurch.name,
        platformId: wizardData.selectedPlatformId,
        wizardData,
        savedAt: Date.now(),
      };
      sessionStorage.setItem(PENDING_CLAIM_KEY, JSON.stringify(pendingClaim));
      
      toast({
        title: "Account Required",
        description: "Please log in or create an account to complete your claim. Your information has been saved.",
      });
      
      // Close modal and redirect to login with return URL
      handleOpenChange(false);
      const currentUrl = window.location.pathname + window.location.search;
      navigate(`/login?redirect=${encodeURIComponent(currentUrl)}&pendingClaim=true`);
      return;
    }
    
    setIsSubmitting(true);
    try {
      await onClaimSubmit(selectedChurch.id, wizardData.selectedPlatformId, wizardData);
      // Show claim success step instead of just closing
      setStep('claim_success');
    } catch (error: any) {
      console.error('Failed to submit claim:', error);
      const errorMessage = error?.message || "There was an error submitting your claim. Please try again.";
      toast({
        title: "Submission Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleDrawMinistryBoundary = () => {
    if (selectedChurch) {
      handleOpenChange(false);
      // Navigate to map with drawPrimary parameter to enable primary ministry area drawing
      // This will show Area Intelligence popup after drawing is complete
      const currentParams = new URLSearchParams(window.location.search);
      currentParams.set('church', selectedChurch.id);
      currentParams.set('drawPrimary', 'true');
      navigate(`/?${currentParams.toString()}`);
    }
  };

  const getDialogSize = () => {
    if (step === 'claim') return "sm:max-w-[600px] max-h-[90vh]";
    if (step === 'add') return "sm:max-w-2xl max-h-[90vh]";
    return "sm:max-w-lg";
  };

  const renderPlatformStep = () => {
    // Handle error or empty states
    const hasPlatforms = platforms && platforms.length > 0;
    const queryError = platformsQuery.isError;
    
    return (
      <div className="space-y-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconBuildingChurch className="w-5 h-5 text-primary" />
            Select Platform
          </DialogTitle>
          <DialogDescription>
            Choose which city platform you want to add or claim a church for.
          </DialogDescription>
        </DialogHeader>

        {queryError ? (
          <div className="text-center py-8 text-destructive">
            <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Failed to load platforms. Please try again later.</p>
            <Button 
              variant="outline" 
              className="mt-3"
              onClick={() => platformsQuery.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : !hasPlatforms ? (
          <div className="text-center py-8 text-muted-foreground">
            <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">You don't have access to any platforms yet.</p>
            <p className="text-xs mt-1">Join a city platform to add or claim churches.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {platforms.map((platform) => (
              <Card
                key={platform.id}
                className={cn(
                  "cursor-pointer transition-all hover-elevate",
                  selectedPlatformId === platform.id && "ring-2 ring-primary"
                )}
                onClick={() => {
                  setSelectedPlatformId(platform.id);
                  setStep('search');
                }}
                data-testid={`platform-option-${platform.id}`}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <MapPin className="w-5 h-5 text-primary" />
                  <div className="flex-1">
                    <h4 className="font-medium">{platform.name}</h4>
                    <p className="text-sm text-muted-foreground">/{platform.slug}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderSearchStep = () => {
    // Guard: Must have a platform selected before searching
    const noPlatformSelected = !selectedPlatformId;
    
    return (
      <div className="space-y-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconBuildingChurch className="w-5 h-5 text-primary" />
            Add or Claim a Church
          </DialogTitle>
          <DialogDescription>
            Search for your church to claim it, or add a new one if it's not in our database.
          </DialogDescription>
        </DialogHeader>

        {noPlatformSelected ? (
          <div className="text-center py-8 text-amber-600 dark:text-amber-400">
            <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Please select a platform first to continue.</p>
            {!contextPlatformId && platforms && platforms.length > 1 && (
              <Button 
                variant="outline" 
                className="mt-3"
                onClick={() => setStep('platform')}
              >
                Select Platform
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by church name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-church-search"
              />
            </div>

            {searchQuery.length >= 2 && (
              <ScrollArea className="h-[280px] rounded-md border relative">
                {isCheckingClaim && (
                  <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Checking availability...</p>
                    </div>
                  </div>
                )}
                <div className="p-2 space-y-1">
                  {searchLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : searchResults && searchResults.length > 0 ? (
                    searchResults.map((church) => (
                      <Card
                        key={church.id}
                        className={cn(
                          "cursor-pointer transition-all hover-elevate",
                          church.is_claimed && "opacity-60"
                        )}
                        onClick={() => !church.is_claimed && handleSelectChurch(church)}
                        data-testid={`search-result-${church.id}`}
                      >
                        <CardContent className="flex items-center gap-3 p-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <IconBuildingChurch className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium truncate">{church.name}</h4>
                            <p className="text-sm text-muted-foreground truncate">
                              {[church.city, church.state].filter(Boolean).join(', ') || church.address}
                            </p>
                          </div>
                          {church.is_claimed ? (
                            <Badge variant="secondary" className="flex-shrink-0">Claimed</Badge>
                          ) : (
                            <Button size="sm" variant="outline" className="flex-shrink-0">
                              <Building className="w-3 h-3 mr-1" />
                              Claim
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <IconBuildingChurch className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No churches found matching "{searchQuery}"</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}

            {searchQuery.length < 2 && (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Enter at least 2 characters to search</p>
              </div>
            )}

            <Separator />

            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-3">
                Can't find your church in the search results?
              </p>
              <Button onClick={handleAddNewChurch} className="gap-2" data-testid="button-add-new-church">
                <Plus className="w-4 h-4" />
                Add New Church
              </Button>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderClaimStep = () => {
    if (!selectedChurch) return null;
    
    // Guard: Ensure we have a platform to claim under
    const hasPlatformForClaim = selectedPlatformId || (platforms && platforms.length > 0);
    
    if (!hasPlatformForClaim) {
      return (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2 mb-4">
            <Button variant="ghost" size="sm" onClick={handleBack} data-testid="button-back-to-search">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </div>
          <div className="text-center py-8 text-muted-foreground">
            <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No platform available for claiming.</p>
            <p className="text-xs mt-1">Please select or join a platform first.</p>
          </div>
        </div>
      );
    }
    
    const platformsForWizard = selectedPlatformId 
      ? [{ id: selectedPlatformId, name: platforms?.find(p => p.id === selectedPlatformId)?.name || 'Current Platform', slug: platforms?.find(p => p.id === selectedPlatformId)?.slug || '' }]
      : platforms?.map(p => ({ id: p.id, name: p.name, slug: p.slug })) || [];

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="sm" onClick={handleBack} data-testid="button-back-to-search">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>
        
        <ClaimChurchWizard
          churchId={selectedChurch.id}
          churchName={selectedChurch.name}
          platforms={platformsForWizard}
          defaultPlatformId={selectedPlatformId || (platforms && platforms.length === 1 ? platforms[0].id : undefined)}
          onComplete={handleClaimComplete}
          onCancel={() => setStep('search')}
        />
      </div>
    );
  };

  const renderAddStep = () => (
    <div className="flex flex-col h-full max-h-[calc(90vh-2rem)] overflow-hidden">
      <div className="flex items-center gap-2 mb-4 flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={handleBack} data-testid="button-back-to-search">
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Search
        </Button>
      </div>
      
      <DialogHeader className="mb-4 flex-shrink-0">
        <DialogTitle>Add Your Church</DialogTitle>
        <DialogDescription>
          Fill in your church's details. After adding, you'll be able to claim it.
        </DialogDescription>
      </DialogHeader>

      <ScrollArea className="flex-1 min-h-0 pr-4">
        <ChurchForm
          callings={callings}
          onSubmit={handleChurchCreated}
          onCancel={() => setStep('search')}
          isLoading={isCreating}
          platformStateCode={platformStateCode || undefined}
          platformCenter={platformCenter}
        />
      </ScrollArea>
    </div>
  );

  const renderSuccessStep = () => (
    <div className="space-y-6 text-center py-4">
      <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Church Submitted!</h2>
        <p className="text-muted-foreground">
          "{newlyCreatedChurch?.name}" has been submitted and is pending approval.
        </p>
      </div>

      <Card className="text-left">
        <CardContent className="pt-6 space-y-3">
          <h4 className="font-medium">What's next?</h4>
          <p className="text-sm text-muted-foreground">
            Would you like to claim this church as your own? This will let you manage the church profile, 
            add ministry information, and connect with other churches.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {user ? (
          <Button onClick={handleClaimNewChurch} className="gap-2" data-testid="button-claim-new-church">
            <Building className="w-4 h-4" />
            Claim This Church
          </Button>
        ) : (
          <Button 
            onClick={() => {
              handleOpenChange(false);
              const currentUrl = window.location.pathname + window.location.search;
              navigate(`/login?redirect=${encodeURIComponent(currentUrl)}`);
            }} 
            className="gap-2" 
            data-testid="button-login-to-claim"
          >
            <Building className="w-4 h-4" />
            Log In to Claim This Church
          </Button>
        )}
        <Button variant="outline" onClick={() => handleOpenChange(false)} data-testid="button-done">
          Done for Now
        </Button>
      </div>
    </div>
  );
  
  const renderClaimSuccessStep = () => (
    <div className="space-y-6 text-center py-4">
      <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
        <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Claim Submitted!</h2>
        <p className="text-muted-foreground">
          Your claim for "{selectedChurch?.name}" has been submitted for review.
        </p>
      </div>

      <Card className="text-left">
        <CardContent className="pt-6 space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <MapIcon className="w-4 h-4 text-primary" />
            Draw Your Ministry Boundary
          </h4>
          <p className="text-sm text-muted-foreground">
            Would you like to draw your church's ministry boundary now? This shows the area where your church 
            ministers and helps other churches see where you're serving.
          </p>
          <p className="text-xs text-muted-foreground italic">
            You can also do this later from your church profile.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <Button onClick={handleDrawMinistryBoundary} className="gap-2" data-testid="button-draw-ministry-boundary">
          <MapIcon className="w-4 h-4" />
          Draw Ministry Boundary Now
        </Button>
        <Button variant="outline" onClick={() => handleOpenChange(false)} data-testid="button-done-later">
          I'll Do This Later
        </Button>
      </div>
    </div>
  );

  // Show loading state while fetching platforms (only when no context platform)
  const showLoading = !contextPlatformId && platformsLoading;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={cn(getDialogSize(), "overflow-hidden")} hideClose={step === 'claim'}>
        {showLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Loading platforms...</p>
          </div>
        ) : (
          <>
            {step === 'platform' && renderPlatformStep()}
            {step === 'search' && renderSearchStep()}
            {step === 'claim' && renderClaimStep()}
            {step === 'add' && renderAddStep()}
            {step === 'success' && renderSuccessStep()}
            {step === 'claim_success' && renderClaimSuccessStep()}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
