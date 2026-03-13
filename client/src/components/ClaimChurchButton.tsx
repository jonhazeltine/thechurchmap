import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Loader2, Building, Check, Clock, X, AlertCircle, LogOut, ChevronDown, Map as MapIcon, CheckCircle2 } from "lucide-react";
import type { ChurchClaim, ChurchWithCallings } from "@shared/schema";
import { ClaimChurchWizard } from "./ClaimChurchWizard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePlatformContext } from "@/contexts/PlatformContext";
import { useLocation } from "wouter";

interface ClaimChurchButtonProps {
  churchId: string;
  churchName: string;
  platformId?: string;
  className?: string;
  church?: ChurchWithCallings;
}

const claimFormSchema = z.object({
  platform_id: z.string().uuid("Please select a platform"),
  role_at_church: z.string().min(1, "Role is required").max(100, "Role too long"),
  phone: z.string().max(20, "Phone number too long").optional().or(z.literal("")),
  verification_notes: z.string()
    .min(10, "Please provide at least 10 characters explaining your connection to this church")
    .max(1000, "Notes too long"),
});

type ClaimFormValues = z.infer<typeof claimFormSchema>;

interface ClaimStatusResponse {
  claim: ChurchClaim | null;
  is_claimed: boolean;
  claimed_by_current_user: boolean;
  has_pending_claim: boolean;
  pending_claim_by_other_user: boolean;
}

interface PlatformsResponse {
  platforms: Array<{
    id: string;
    name: string;
    slug: string;
    is_claimed: boolean;
    claimed_by_current_user: boolean;
    has_pending_claim: boolean;
    pending_claim_by_current_user: boolean;
  }>;
  church_id: string;
}

// DEV BYPASS: Get auth token for API requests
const DEV_BYPASS_AUTH = false;
const DEV_BYPASS_TOKEN = "dev-bypass-token";

async function getClaimAuthToken(): Promise<string> {
  if (DEV_BYPASS_AUTH) {
    return DEV_BYPASS_TOKEN;
  }
  const { supabase } = await import("../../../lib/supabaseClient");
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || '';
}

export function ClaimChurchButton({ churchId, churchName, platformId, className, church }: ClaimChurchButtonProps) {
  const { user, loading: authLoading } = useAuth();
  const { churchAdminChurchIds, isPlatformAdmin, isSuperAdmin } = useAdminAccess();
  const { platformId: contextPlatformId } = usePlatformContext();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPlatformId, setSelectedPlatformId] = useState<string | null>(platformId || null);
  const [useWizard, setUseWizard] = useState(true); // Default to wizard mode
  const [showReleaseDialog, setShowReleaseDialog] = useState(false);
  const [showSuccessStep, setShowSuccessStep] = useState(false);

  const isAdmin = isSuperAdmin || isPlatformAdmin || churchAdminChurchIds.includes(churchId);

  const { data: platformsData, isLoading: platformsLoading } = useQuery<PlatformsResponse>({
    queryKey: ["/api/churches", churchId, "claim", "platforms"],
    queryFn: async () => {
      const token = await getClaimAuthToken();
      const response = await fetch(`/api/churches/${churchId}/claim`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error("Failed to fetch church platforms");
      }
      return response.json();
    },
    enabled: !!user && !platformId,
    staleTime: 30 * 1000,
  });

  const { data: claimStatus, isLoading: claimLoading } = useQuery<ClaimStatusResponse>({
    queryKey: ["/api/churches", churchId, "claim", selectedPlatformId],
    queryFn: async () => {
      const token = await getClaimAuthToken();
      const response = await fetch(`/api/churches/${churchId}/claim?platform_id=${selectedPlatformId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error("Failed to fetch claim status");
      }
      return response.json();
    },
    enabled: !!user && !!selectedPlatformId,
    staleTime: 30 * 1000,
  });

  const form = useForm<ClaimFormValues>({
    resolver: zodResolver(claimFormSchema),
    defaultValues: {
      platform_id: platformId || "",
      role_at_church: "",
      phone: "",
      verification_notes: "",
    },
  });

  const submitClaimMutation = useMutation({
    mutationFn: async (values: ClaimFormValues & { wizard_data?: string }) => {
      return apiRequest("POST", `/api/churches/${churchId}/claim`, {
        city_platform_id: values.platform_id,
        role_at_church: values.role_at_church,
        phone: values.phone || null,
        verification_notes: values.verification_notes,
        wizard_data: values.wizard_data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches", churchId, "claim"] });
      form.reset();
      // Show success step with boundary drawing option instead of closing immediately
      setShowSuccessStep(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const cancelClaimMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/churches/${churchId}/claim?platform_id=${selectedPlatformId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches", churchId, "claim"] });
      toast({
        title: "Claim Cancelled",
        description: "Your claim has been cancelled.",
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

  const releaseManagementMutation = useMutation({
    mutationFn: async () => {
      const releasePlatformId = selectedPlatformId || contextPlatformId;
      if (!releasePlatformId) {
        throw new Error("No platform context available");
      }
      return apiRequest("POST", `/api/churches/${churchId}/claim/release`, {
        platform_id: releasePlatformId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches", churchId, "claim"] });
      queryClient.invalidateQueries({ queryKey: ["/api/churches", churchId, "team"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin-access"] });
      setShowReleaseDialog(false);
      toast({
        title: "Management Released",
        description: "You have released management of this church. It can now be claimed by someone else.",
      });
      navigate("/map");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (values: ClaimFormValues) => {
    submitClaimMutation.mutate(values);
  };

  const handleOpenDialog = (platId?: string) => {
    if (platId) {
      form.setValue("platform_id", platId);
      setSelectedPlatformId(platId);
    }
    setShowSuccessStep(false);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setShowSuccessStep(false);
  };

  const handleDrawMinistryBoundary = () => {
    handleCloseDialog();
    // Navigate to map with drawPrimary parameter to enable primary ministry area drawing
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.set('church', churchId);
    currentParams.set('drawPrimary', 'true');
    navigate(`/?${currentParams.toString()}`);
  };

  if (authLoading || (platformsLoading && !platformId)) {
    return null;
  }

  if (!user) {
    return null;
  }

  // Note: Removed admin check - show claim button for everyone on unclaimed churches
  // Admins can still see and use the claim button if they want to claim for themselves

  const platforms = platformsData?.platforms || [];
  // Filter out platforms that are already claimed or have pending claims by other users
  const availablePlatforms = platforms.filter(p => 
    !p.is_claimed && 
    !p.claimed_by_current_user && 
    (!p.has_pending_claim || p.pending_claim_by_current_user)
  );
  const claimedByUserPlatforms = platforms.filter(p => p.claimed_by_current_user);
  // Platforms with pending claims by other users (not current user)
  const pendingByOthersPlatforms = platforms.filter(p => 
    p.has_pending_claim && !p.pending_claim_by_current_user && !p.is_claimed
  );

  if (platforms.length === 0 && !platformId) {
    return null;
  }

  if (claimStatus?.is_claimed && selectedPlatformId) {
    if (claimStatus.claimed_by_current_user) {
      return (
        <Badge variant="default" className="gap-1.5" data-testid="badge-church-claimed-by-me">
          <Check className="h-3 w-3" />
          You manage this church
        </Badge>
      );
    }
    return null;
  }

  // Check if another user has a pending claim (not current user's claim)
  if (claimStatus?.pending_claim_by_other_user && selectedPlatformId) {
    return (
      <Badge variant="secondary" className="gap-1.5" data-testid="badge-claim-pending-other">
        <Clock className="h-3 w-3" />
        Claim Pending
      </Badge>
    );
  }

  if (claimStatus?.claim && selectedPlatformId) {
    const claim = claimStatus.claim;

    if (claim.status === "pending") {
      // If showing success step, keep the dialog open instead of returning early
      if (showSuccessStep && dialogOpen) {
        return (
          <>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1.5" data-testid="badge-claim-pending">
                <Clock className="h-3 w-3" />
                Claim Pending
              </Badge>
            </div>
            <Dialog open={dialogOpen} onOpenChange={handleCloseDialog}>
              <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden p-6" hideClose>
                <div className="space-y-6 text-center py-4">
                  <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-xl font-semibold">Claim Submitted!</h2>
                    <p className="text-muted-foreground">
                      Your claim for "{churchName}" has been submitted for review.
                    </p>
                  </div>

                  {church?.primary_ministry_area ? (
                    <>
                      <Card className="text-left">
                        <CardContent className="pt-6 space-y-3">
                          <h4 className="font-medium flex items-center gap-2">
                            <MapIcon className="w-4 h-4 text-primary" />
                            Ministry Boundary
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            Your church already has a ministry area defined. You can update it from your church profile.
                          </p>
                        </CardContent>
                      </Card>
                      <div className="flex flex-col gap-2">
                        <Button onClick={handleCloseDialog} data-testid="button-done">
                          Done
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
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
                        <Button variant="outline" onClick={handleCloseDialog} data-testid="button-done-later">
                          I'll Do This Later
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </>
        );
      }
      
      return (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5" data-testid="badge-claim-pending">
            <Clock className="h-3 w-3" />
            Claim Pending
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => cancelClaimMutation.mutate()}
            disabled={cancelClaimMutation.isPending}
            data-testid="button-cancel-claim"
          >
            {cancelClaimMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
            <span className="sr-only">Cancel claim</span>
          </Button>
        </div>
      );
    }

    if (claim.status === "rejected") {
      // If another user has a pending claim, don't allow resubmission
      if (claimStatus?.has_pending_claim) {
        return (
          <Badge variant="secondary" className="gap-1.5" data-testid="badge-claim-pending-other">
            <Clock className="h-3 w-3" />
            Claim Pending
          </Badge>
        );
      }

      // Get the platform info for the rejected claim so we can pass it to the wizard
      const rejectedPlatform = platforms.find(p => p.id === selectedPlatformId);
      const wizardPlatforms = rejectedPlatform 
        ? [{ id: rejectedPlatform.id, name: rejectedPlatform.name, slug: rejectedPlatform.slug }]
        : availablePlatforms.map(p => ({ id: p.id, name: p.name, slug: p.slug }));

      return (
        <>
          <div className="space-y-2">
            <Badge variant="destructive" className="gap-1.5" data-testid="badge-claim-rejected">
              <AlertCircle className="h-3 w-3" />
              Claim Rejected
            </Badge>
            {claim.reviewer_notes && (
              <p className="text-xs text-muted-foreground">
                Reason: {claim.reviewer_notes}
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenDialog(selectedPlatformId || undefined)}
              data-testid="button-resubmit-claim"
            >
              Submit New Claim
            </Button>
          </div>

          <Dialog open={dialogOpen} onOpenChange={handleCloseDialog}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden p-6" hideClose={!showSuccessStep}>
              {showSuccessStep ? (
                <div className="space-y-6 text-center py-4">
                  <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-xl font-semibold">Claim Submitted!</h2>
                    <p className="text-muted-foreground">
                      Your claim for "{churchName}" has been submitted for review.
                    </p>
                  </div>

                  {church?.primary_ministry_area ? (
                    <>
                      <Card className="text-left">
                        <CardContent className="pt-6 space-y-3">
                          <h4 className="font-medium flex items-center gap-2">
                            <MapIcon className="w-4 h-4 text-primary" />
                            Ministry Boundary
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            Your church already has a ministry area defined. You can update it from your church profile.
                          </p>
                        </CardContent>
                      </Card>
                      <div className="flex flex-col gap-2">
                        <Button onClick={handleCloseDialog} data-testid="button-done">
                          Done
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
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
                        <Button variant="outline" onClick={handleCloseDialog} data-testid="button-done-later">
                          I'll Do This Later
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <ClaimChurchWizard
                  churchId={churchId}
                  churchName={churchName}
                  platforms={wizardPlatforms}
                  defaultPlatformId={selectedPlatformId || undefined}
                  onComplete={async (wizardData) => {
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
                    
                    const spaceParts = [];
                    if (wizardData.shareSpace) spaceParts.push('Willing to Share Space');
                    if (wizardData.seekSpace) spaceParts.push('Looking for Space');
                    if (wizardData.openToCoLocation) spaceParts.push('Open to Co-location');
                    if (spaceParts.length > 0) {
                      verificationParts.push(`Space Sharing: ${spaceParts.join(', ')}`);
                    }
                    if (wizardData.facilityNotes) {
                      verificationParts.push(`Facility Notes: ${wizardData.facilityNotes}`);
                    }
                    if (wizardData.collaborationHave && wizardData.collaborationHave.length > 0) {
                      verificationParts.push(`We Offer Tags: ${wizardData.collaborationHave.join(', ')}`);
                    }
                    if (wizardData.collaborationNeed && wizardData.collaborationNeed.length > 0) {
                      verificationParts.push(`We Need Tags: ${wizardData.collaborationNeed.join(', ')}`);
                    }
                    
                    const targetPlatformId = wizardData.selectedPlatformId;
                    
                    submitClaimMutation.mutate({
                      platform_id: targetPlatformId,
                      role_at_church: roleMap[wizardData.roleSelection],
                      verification_notes: verificationParts.join('\n'),
                      wizard_data: JSON.stringify(wizardData),
                    });
                  }}
                  onCancel={handleCloseDialog}
                />
              )}
            </DialogContent>
          </Dialog>
        </>
      );
    }
  }

  if (claimedByUserPlatforms.length > 0 && availablePlatforms.length === 0) {
    return (
      <Badge variant="default" className="gap-1.5" data-testid="badge-church-claimed-by-me">
        <Check className="h-3 w-3" />
        You manage this church
      </Badge>
    );
  }

  // If there are platforms with pending claims by others but none available, show pending state
  if (availablePlatforms.length === 0 && pendingByOthersPlatforms.length > 0 && !platformId) {
    return (
      <Badge variant="secondary" className="gap-1.5" data-testid="badge-claim-pending-other">
        <Clock className="h-3 w-3" />
        Claim Pending
      </Badge>
    );
  }

  if (availablePlatforms.length === 0 && !platformId) {
    return null;
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          if (availablePlatforms.length === 1) {
            handleOpenDialog(availablePlatforms[0].id);
          } else if (platformId) {
            handleOpenDialog(platformId);
          } else {
            handleOpenDialog();
          }
        }}
        className={className}
        data-testid="button-claim-church"
      >
        <Building className="h-4 w-4 mr-2" />
        Claim This Church
      </Button>

      <Dialog open={dialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className={useWizard ? "sm:max-w-[600px] max-h-[90vh] overflow-hidden p-6" : "sm:max-w-[500px]"} hideClose={useWizard && !showSuccessStep}>
          {showSuccessStep ? (
            <div className="space-y-6 text-center py-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl font-semibold">Claim Submitted!</h2>
                <p className="text-muted-foreground">
                  Your claim for "{churchName}" has been submitted for review.
                </p>
              </div>

              {church?.primary_ministry_area ? (
                <>
                  <Card className="text-left">
                    <CardContent className="pt-6 space-y-3">
                      <h4 className="font-medium flex items-center gap-2">
                        <MapIcon className="w-4 h-4 text-primary" />
                        Ministry Boundary
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Your church already has a ministry area defined. You can update it from your church profile.
                      </p>
                    </CardContent>
                  </Card>
                  <div className="flex flex-col gap-2">
                    <Button onClick={handleCloseDialog} data-testid="button-done">
                      Done
                    </Button>
                  </div>
                </>
              ) : (
                <>
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
                    <Button variant="outline" onClick={handleCloseDialog} data-testid="button-done-later">
                      I'll Do This Later
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : useWizard ? (
            <ClaimChurchWizard
              churchId={churchId}
              churchName={churchName}
              platforms={availablePlatforms.map(p => ({ id: p.id, name: p.name, slug: p.slug }))}
              defaultPlatformId={selectedPlatformId || platformId || undefined}
              existingChurch={church}
              onComplete={async (wizardData) => {
                // Convert wizard data to claim format and submit
                const roleMap: Record<string, string> = {
                  owner: "Lead Pastor / Church Owner",
                  administrator: "Administrator", 
                  member: "Team Member"
                };
                
                // Build structured verification notes from wizard data
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
                
                // Facility info
                verificationParts.push(`Facility: ${wizardData.facilityOwnership} - ${wizardData.facilityAdequacy}`);
                if (wizardData.unmetFacilityNeeds) {
                  verificationParts.push(`Unmet Needs: ${wizardData.unmetFacilityNeeds}`);
                }
                
                // Space sharing preferences (now in facility step)
                const spaceParts = [];
                if (wizardData.shareSpace) spaceParts.push('Willing to Share Space');
                if (wizardData.seekSpace) spaceParts.push('Looking for Space');
                if (wizardData.openToCoLocation) spaceParts.push('Open to Co-location');
                if (spaceParts.length > 0) {
                  verificationParts.push(`Space Sharing: ${spaceParts.join(', ')}`);
                }
                if (wizardData.facilityNotes) {
                  verificationParts.push(`Facility Notes: ${wizardData.facilityNotes}`);
                }
                if (wizardData.collaborationHave && wizardData.collaborationHave.length > 0) {
                  verificationParts.push(`We Offer Tags: ${wizardData.collaborationHave.join(', ')}`);
                }
                if (wizardData.collaborationNeed && wizardData.collaborationNeed.length > 0) {
                  verificationParts.push(`We Need Tags: ${wizardData.collaborationNeed.join(', ')}`);
                }
                
                // Use the platform ID from wizard data
                const targetPlatformId = wizardData.selectedPlatformId;
                
                // Submit the claim
                submitClaimMutation.mutate({
                  platform_id: targetPlatformId,
                  role_at_church: roleMap[wizardData.roleSelection],
                  verification_notes: verificationParts.join('\n'),
                  wizard_data: JSON.stringify(wizardData),
                });
              }}
              onCancel={handleCloseDialog}
            />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Claim {churchName}</DialogTitle>
                <DialogDescription>
                  Submit a request to become the administrator of this church. A platform admin will review your claim.
                </DialogDescription>
              </DialogHeader>

              <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              {availablePlatforms.length > 1 && !platformId && (
                <FormField
                  control={form.control}
                  name="platform_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Platform</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          setSelectedPlatformId(value);
                        }}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-platform">
                            <SelectValue placeholder="Select a platform" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availablePlatforms.map((platform) => (
                            <SelectItem key={platform.id} value={platform.id}>
                              {platform.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Which platform do you want to claim this church for?
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="role_at_church"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Role at This Church</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Pastor, Office Manager, Elder"
                        {...field}
                        data-testid="input-claim-role"
                      />
                    </FormControl>
                    <FormDescription>
                      What is your position or role at this church?
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="(555) 555-5555"
                        {...field}
                        data-testid="input-claim-phone"
                      />
                    </FormControl>
                    <FormDescription>
                      A number where we can reach you for verification.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="verification_notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Verification Details</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Please describe your connection to this church and how you can verify your role..."
                        className="min-h-[100px]"
                        {...field}
                        data-testid="input-claim-verification"
                      />
                    </FormControl>
                    <FormDescription>
                      Help us verify your connection to this church. Include any details that would help confirm your role.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  data-testid="button-cancel-claim-dialog"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitClaimMutation.isPending}
                  data-testid="button-submit-claim"
                >
                  {submitClaimMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Submit Claim
                </Button>
              </DialogFooter>
            </form>
          </Form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
