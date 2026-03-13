import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ChurchSearchResult, OnboardingResult } from "@shared/schema";
import { Search, CheckCircle2, ArrowRight, ArrowLeft, Loader2, PartyPopper, MapPin, Globe } from "lucide-react";
import { IconBuildingChurch } from "@tabler/icons-react";
import { motion, AnimatePresence } from "framer-motion";

type OnboardingStep = 'welcome' | 'search' | 'details' | 'confirmation';

interface ChurchDetailsForm {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  denomination: string;
  website: string;
  phone: string;
}

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { user, session, loading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedChurch, setSelectedChurch] = useState<ChurchSearchResult | null>(null);
  const [showNotOnList, setShowNotOnList] = useState(false);
  const [result, setResult] = useState<OnboardingResult | null>(null);
  
  const [churchDetails, setChurchDetails] = useState<ChurchDetailsForm>({
    name: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    denomination: '',
    website: '',
    phone: '',
  });

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        setDebouncedQuery(searchQuery);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Check onboarding status
  const { data: status, isLoading: statusLoading } = useQuery<{
    onboarding_completed: boolean;
    church_id: string | null;
    church: any;
    pending_church: any;
    platform: any;
  }>({
    queryKey: ['/api/onboarding/status'],
    enabled: !!session?.access_token,
    meta: {
      headers: {
        'Authorization': `Bearer ${session?.access_token}`,
      },
    },
  });

  // Handle existing state - if user has pending church, show confirmation; if completed, redirect
  useEffect(() => {
    if (statusLoading) return;
    
    if (status?.pending_church) {
      // User has a pending church submission - show them the confirmation
      setResult({
        success: true,
        message: 'Your church submission is still pending review. We\'ll notify you once it\'s approved!',
        church_id: null,
        pending_church_id: status.pending_church.id,
        platform_id: null,
        platform_name: null,
        joined_platform: false,
      });
      setStep('confirmation');
    } else if (status?.church_id && status?.church) {
      // User already selected a church - redirect to home
      setLocation('/');
    } else if (status?.onboarding_completed) {
      // Onboarding completed without church - redirect to home
      setLocation('/');
    }
  }, [status, statusLoading, setLocation]);

  // Search churches
  const { data: searchResults, isLoading: searching } = useQuery<ChurchSearchResult[]>({
    queryKey: [`/api/onboarding/search-churches?query=${encodeURIComponent(debouncedQuery)}`],
    enabled: debouncedQuery.length >= 2 && !!session?.access_token,
    meta: {
      headers: {
        'Authorization': `Bearer ${session?.access_token}`,
      },
    },
  });

  // Select existing church mutation
  const selectChurchMutation = useMutation({
    mutationFn: async (churchId: string) => {
      return await apiRequest('POST', '/api/onboarding/select-church', { church_id: churchId });
    },
    onSuccess: (data: OnboardingResult) => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/status'] });
      setResult(data);
      setStep('confirmation');
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to select church",
        variant: "destructive",
      });
    },
  });

  // Submit pending church mutation
  const submitPendingChurchMutation = useMutation({
    mutationFn: async (details: ChurchDetailsForm) => {
      return await apiRequest('POST', '/api/onboarding/submit-pending-church', details);
    },
    onSuccess: (data: OnboardingResult) => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/status'] });
      setResult(data);
      setStep('confirmation');
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit church",
        variant: "destructive",
      });
    },
  });

  // Skip onboarding mutation
  const skipMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/onboarding/skip', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/status'] });
      setLocation('/');
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to skip onboarding",
        variant: "destructive",
      });
    },
  });

  const handleSelectChurch = (church: ChurchSearchResult) => {
    setSelectedChurch(church);
  };

  const handleConfirmSelection = () => {
    if (selectedChurch) {
      selectChurchMutation.mutate(selectedChurch.id);
    }
  };

  const handleSubmitPendingChurch = (e: React.FormEvent) => {
    e.preventDefault();
    submitPendingChurchMutation.mutate(churchDetails);
  };

  const handleFinish = () => {
    if (result?.platform_id) {
      setLocation(`/${result.platform_id}`);
    } else {
      setLocation('/');
    }
  };

  const handleCreatePlatform = () => {
    setLocation('/apply-for-platform');
  };

  // Wait for auth to initialize
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Need authenticated session to proceed
  if (!session?.access_token) {
    // If we have a user but no session, they might need to verify email or session is loading
    if (user) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-muted/20">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
              <CardTitle>Setting up your account...</CardTitle>
              <CardDescription>
                Please wait while we finish setting up your account. If this takes too long, try refreshing the page.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      );
    }
    // No user at all - redirect to login
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Please sign in</CardTitle>
            <CardDescription>
              You need to be signed in to complete onboarding.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button onClick={() => setLocation('/login')} data-testid="button-go-to-login">
              Go to Sign In
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (statusLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-lg">
        <AnimatePresence mode="wait">
          {/* Step 1: Welcome */}
          {step === 'welcome' && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <IconBuildingChurch className="w-8 h-8 text-primary" />
                </div>
                <CardTitle className="text-2xl" data-testid="text-onboarding-title">
                  Welcome to The Churches!
                </CardTitle>
                <CardDescription className="text-base mt-2">
                  Let's connect you with your church community. This will help you discover and collaborate with other churches in your area.
                </CardDescription>
              </CardHeader>
              <CardFooter className="flex flex-col gap-3">
                <Button 
                  className="w-full gap-2" 
                  onClick={() => setStep('search')}
                  data-testid="button-start-onboarding"
                >
                  Find My Church
                  <ArrowRight className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => skipMutation.mutate()}
                  disabled={skipMutation.isPending}
                  data-testid="button-skip-onboarding"
                >
                  {skipMutation.isPending ? "Skipping..." : "Skip for now"}
                </Button>
              </CardFooter>
            </motion.div>
          )}

          {/* Step 2: Church Search */}
          {step === 'search' && !showNotOnList && (
            <motion.div
              key="search"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <CardHeader>
                <CardTitle data-testid="text-search-title">Find Your Church</CardTitle>
                <CardDescription>
                  Search for your church by name or location
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by church name or city..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    data-testid="input-church-search"
                  />
                </div>

                {/* Search Results */}
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {searching && (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  
                  {!searching && searchResults && searchResults.length > 0 && (
                    searchResults.map((church) => (
                      <button
                        key={church.id}
                        onClick={() => handleSelectChurch(church)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors hover-elevate ${
                          selectedChurch?.id === church.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border'
                        }`}
                        data-testid={`button-select-church-${church.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{church.name}</p>
                            {church.address && (
                              <p className="text-sm text-muted-foreground truncate">
                                {church.address}
                              </p>
                            )}
                            <p className="text-sm text-muted-foreground truncate">
                              {[church.city, church.state].filter(Boolean).join(', ')}
                            </p>
                            {church.denomination && (
                              <p className="text-xs text-muted-foreground/70 mt-0.5">{church.denomination}</p>
                            )}
                          </div>
                          {church.platform && (
                            <div className="flex-shrink-0">
                              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                <Globe className="w-3 h-3" />
                                {church.platform.name}
                              </span>
                            </div>
                          )}
                        </div>
                      </button>
                    ))
                  )}

                  {!searching && debouncedQuery.length >= 2 && searchResults?.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">
                      No churches found matching "{debouncedQuery}"
                    </p>
                  )}

                  {!searching && debouncedQuery.length < 2 && (
                    <p className="text-center text-muted-foreground py-4">
                      Type at least 2 characters to search
                    </p>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-3">
                {selectedChurch && (
                  <Button
                    className="w-full gap-2"
                    onClick={handleConfirmSelection}
                    disabled={selectChurchMutation.isPending}
                    data-testid="button-confirm-church"
                  >
                    {selectChurchMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        This is my church
                      </>
                    )}
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowNotOnList(true)}
                  data-testid="button-not-on-list"
                >
                  My church is not on the list
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep('welcome')}
                  className="gap-1"
                  data-testid="button-back-welcome"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
              </CardFooter>
            </motion.div>
          )}

          {/* Step 3: Church Details Form */}
          {step === 'search' && showNotOnList && (
            <motion.div
              key="details"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <form onSubmit={handleSubmitPendingChurch}>
                <CardHeader>
                  <CardTitle data-testid="text-details-title">Add Your Church</CardTitle>
                  <CardDescription>
                    Tell us about your church. It will be reviewed by our team before appearing on the map.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="churchName">Church Name *</Label>
                    <Input
                      id="churchName"
                      placeholder="First Baptist Church"
                      value={churchDetails.name}
                      onChange={(e) => setChurchDetails({ ...churchDetails, name: e.target.value })}
                      required
                      data-testid="input-church-name"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="address">Street Address</Label>
                    <Input
                      id="address"
                      placeholder="123 Main Street"
                      value={churchDetails.address}
                      onChange={(e) => setChurchDetails({ ...churchDetails, address: e.target.value })}
                      data-testid="input-church-address"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        placeholder="Grand Rapids"
                        value={churchDetails.city}
                        onChange={(e) => setChurchDetails({ ...churchDetails, city: e.target.value })}
                        data-testid="input-church-city"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">State</Label>
                      <Input
                        id="state"
                        placeholder="MI"
                        value={churchDetails.state}
                        onChange={(e) => setChurchDetails({ ...churchDetails, state: e.target.value })}
                        data-testid="input-church-state"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="zip">ZIP Code</Label>
                      <Input
                        id="zip"
                        placeholder="49503"
                        value={churchDetails.zip}
                        onChange={(e) => setChurchDetails({ ...churchDetails, zip: e.target.value })}
                        data-testid="input-church-zip"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="denomination">Denomination</Label>
                      <Input
                        id="denomination"
                        placeholder="Baptist"
                        value={churchDetails.denomination}
                        onChange={(e) => setChurchDetails({ ...churchDetails, denomination: e.target.value })}
                        data-testid="input-church-denomination"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      type="url"
                      placeholder="https://mychurch.org"
                      value={churchDetails.website}
                      onChange={(e) => setChurchDetails({ ...churchDetails, website: e.target.value })}
                      data-testid="input-church-website"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="(555) 123-4567"
                      value={churchDetails.phone}
                      onChange={(e) => setChurchDetails({ ...churchDetails, phone: e.target.value })}
                      data-testid="input-church-phone"
                    />
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-3">
                  <Button
                    type="submit"
                    className="w-full gap-2"
                    disabled={!churchDetails.name || submitPendingChurchMutation.isPending}
                    data-testid="button-submit-church"
                  >
                    {submitPendingChurchMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <IconBuildingChurch className="w-4 h-4" />
                        Submit Church for Review
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowNotOnList(false)}
                    className="gap-1"
                    data-testid="button-back-search"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to search
                  </Button>
                </CardFooter>
              </form>
            </motion.div>
          )}

          {/* Step 4: Confirmation */}
          {step === 'confirmation' && result && (
            <motion.div
              key="confirmation"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                  {result.joined_platform ? (
                    <PartyPopper className="w-8 h-8 text-green-600 dark:text-green-400" />
                  ) : (
                    <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
                  )}
                </div>
                <CardTitle className="text-2xl" data-testid="text-confirmation-title">
                  {result.joined_platform ? "You're Connected!" : "Almost There!"}
                </CardTitle>
                <CardDescription className="text-base mt-2">
                  {result.message}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {result.joined_platform && result.platform_name && (
                  <div className="bg-muted/50 rounded-lg p-4 text-center">
                    <p className="text-sm text-muted-foreground mb-1">You're now part of</p>
                    <p className="font-semibold text-lg flex items-center justify-center gap-2">
                      <Globe className="w-5 h-5 text-primary" />
                      {result.platform_name}
                    </p>
                  </div>
                )}
                
                {!result.joined_platform && !result.pending_church_id && (
                  <div className="bg-muted/50 rounded-lg p-4 text-center">
                    <p className="text-sm text-muted-foreground mb-2">
                      Your church isn't part of a city network yet.
                    </p>
                    <p className="text-sm">
                      Would you like to start one for your area?
                    </p>
                  </div>
                )}

                {result.pending_church_id && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 text-center">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      Your church submission is pending review. We'll notify you once it's approved!
                    </p>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex flex-col gap-3">
                <Button 
                  className="w-full gap-2" 
                  onClick={handleFinish}
                  data-testid="button-finish-onboarding"
                >
                  {result.joined_platform ? (
                    <>
                      <MapPin className="w-4 h-4" />
                      Explore the Map
                    </>
                  ) : (
                    "Continue to Map"
                  )}
                </Button>
                
                {!result.joined_platform && !result.pending_church_id && (
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={handleCreatePlatform}
                    data-testid="button-create-platform"
                  >
                    <Globe className="w-4 h-4" />
                    Create a City Network
                  </Button>
                )}
              </CardFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </div>
  );
}
