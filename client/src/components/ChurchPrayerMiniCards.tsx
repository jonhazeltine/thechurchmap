import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Hand, Megaphone, Loader2, Check, ChevronDown, ChevronRight } from "lucide-react";
import { IconBuildingChurch } from "@tabler/icons-react";
import { usePlatformContext } from "@/contexts/PlatformContext";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { GuestPrayerModal } from "./GuestPrayerModal";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ChurchPrayerRequest {
  id: string;
  title: string;
  body: string;
  church_id: string;
  church_name: string | null;
  is_church_request: boolean;
  created_at: string;
  interaction_count?: number;
}

interface ChurchPrayerMiniCardsProps {
  onPrayerClick?: (prayerId: string, prayerTitle: string, churchId: string) => void;
  churchId?: string;
}

export function ChurchPrayerMiniCards({ onPrayerClick, churchId }: ChurchPrayerMiniCardsProps) {
  const { platformId } = usePlatformContext();
  const { getMapUrl } = usePlatformNavigation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [prayedIds, setPrayedIds] = useState<Set<string>>(new Set());
  const [prayingFor, setPrayingFor] = useState<string | null>(null);
  
  // Guest prayer modal state
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [pendingGuestPrayer, setPendingGuestPrayer] = useState<{
    prayerId: string;
    prayerTitle: string;
    churchId: string;
    churchName: string | null;
  } | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("prayedPrayerIds");
    if (stored) {
      setPrayedIds(new Set(JSON.parse(stored)));
    }
  }, []);

  const postPrayerResponse = useMutation({
    mutationFn: async (data: { 
      churchId: string;
      commentType: 'prayer_tap'; 
      body: string; 
      displayName?: string; 
      prayerId?: string;
    }) => {
      const { churchId, ...postData } = data;
      const response = await apiRequest("POST", `/api/churches/${churchId}/prayer-post`, postData);
      return response;
    },
    onSuccess: (data) => {
      if (data.posted) {
        queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      }
    },
  });

  const handlePray = async (e: React.MouseEvent, prayerId: string, prayerTitle: string, requestChurchId: string, churchName: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (prayedIds.has(prayerId) || prayingFor) return;
    
    setPrayingFor(prayerId);
    
    if (onPrayerClick) {
      onPrayerClick(prayerId, prayerTitle, requestChurchId);
    }
    
    try {
      await apiRequest("POST", "/api/prayers/pray", { prayer_id: prayerId });
      
      markPrayerComplete(prayerId, prayerTitle, requestChurchId);
    } catch (error: any) {
      // Check if this is a guest requiring a name
      if (error.message?.includes('400') || error.message?.includes('Guest name required')) {
        setPendingGuestPrayer({ prayerId, prayerTitle, churchId: requestChurchId, churchName });
        setShowGuestModal(true);
        setPrayingFor(null);
        return;
      }
      
      if (error.message?.includes('429')) {
        // Rate limited - prayer was already counted
      } else {
        toast({
          title: "Error",
          description: "Failed to record your prayer. Please try again.",
          variant: "destructive",
        });
      }
      setPrayingFor(null);
    }
  };
  
  const markPrayerComplete = (prayerId: string, prayerTitle: string, requestChurchId: string) => {
    const newPrayedIds = new Set(prayedIds).add(prayerId);
    setPrayedIds(newPrayedIds);
    sessionStorage.setItem("prayedPrayerIds", JSON.stringify(Array.from(newPrayedIds)));
    queryClient.invalidateQueries({ queryKey: ["/api/prayers/church-requests"] });
    
    if (user) {
      const userName = user.user_metadata?.full_name || user.user_metadata?.first_name || user.email?.split('@')[0] || 'Someone';
      postPrayerResponse.mutate({
        churchId: requestChurchId,
        commentType: 'prayer_tap',
        body: `Prayed for: "${prayerTitle}"`,
        displayName: userName,
        prayerId: prayerId,
      });
    }
    
    setPrayingFor(null);
  };
  
  const handleGuestPrayerSubmit = async (guestName: string, fullName: string) => {
    if (!pendingGuestPrayer) return;
    
    const { prayerId, prayerTitle, churchId: requestChurchId } = pendingGuestPrayer;
    
    await apiRequest("POST", "/api/prayers/pray", { 
      prayer_id: prayerId,
      guest_name: guestName,
      guest_full_name: fullName
    });
    
    markPrayerComplete(prayerId, prayerTitle, requestChurchId);
  };

  const { data, isLoading } = useQuery<{ requests: ChurchPrayerRequest[] }>({
    queryKey: ["/api/prayers/church-requests", churchId || platformId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (churchId) {
        params.set("church_id", churchId);
      } else if (platformId) {
        params.set("city_platform_id", platformId);
      }
      params.set("limit", "5");
      const response = await fetch(`/api/prayers/church-requests?${params}`);
      if (!response.ok) throw new Error("Failed to fetch church prayer requests");
      return response.json();
    },
    staleTime: 30000,
  });

  const requests = data?.requests || [];
  const [isOpen, setIsOpen] = useState(false);
  
  // Show max 3 prayer needs when expanded
  const displayedRequests = requests.slice(0, 3);
  const totalRequests = requests.length;
  const hasMoreRequests = totalRequests > 3;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin text-amber-600 dark:text-amber-400" />
      </div>
    );
  }

  if (requests.length === 0) {
    return null;
  }

  return (
    <div className="px-4 py-4 mt-2 border-t border-border/30 bg-muted/30 dark:bg-muted/10">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="w-full" data-testid="toggle-prayer-needs">
          <div className="flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity mb-2">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/40">
                <Megaphone className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-sm font-semibold text-foreground/80 dark:text-foreground/70">
                Church Prayer Needs
              </span>
              {totalRequests > 0 && (
                <span className="text-xs text-muted-foreground/60 font-medium">
                  {totalRequests}
                </span>
              )}
            </div>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="space-y-4 pt-2">
            <AnimatePresence mode="popLayout">
              {displayedRequests.map((request, index) => {
                const hasPrayed = prayedIds.has(request.id);
                const isPraying = prayingFor === request.id;
                
                return (
                  <motion.div
                    key={request.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2, delay: index * 0.05 }}
                    className="w-full"
                  >
                    <div
                      className={`p-4 rounded-xl border shadow-sm hover-elevate text-left transition-all ${
                        hasPrayed
                          ? "bg-amber-50/80 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50"
                          : "bg-card border-border/80"
                      }`}
                      data-testid={`mini-card-prayer-${request.id}`}
                    >
                      <Link href={getMapUrl({ church: request.church_id })}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <IconBuildingChurch className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs font-medium text-muted-foreground">
                            {request.church_name || "Church"}
                          </span>
                        </div>
                        
                        <h4 className="font-semibold text-sm text-foreground mb-1.5">
                          {request.title}
                        </h4>
                        
                        {request.body && request.body !== request.title && (
                          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 mb-3">
                            {request.body}
                          </p>
                        )}
                      </Link>
                      
                      <Button
                        onClick={(e) => handlePray(e, request.id, request.title, request.church_id, request.church_name)}
                        disabled={hasPrayed || isPraying}
                        className={`w-full rounded-full ${
                          hasPrayed
                            ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                            : "bg-amber-500 text-white border-amber-500"
                        }`}
                        variant={hasPrayed ? "outline" : "default"}
                        data-testid={`button-pray-${request.id}`}
                      >
                        {isPraying ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : hasPrayed ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Hand className="w-4 h-4" />
                        )}
                        <span>
                          {hasPrayed ? "Prayed" : "Pray for this need"}
                        </span>
                        {((request.interaction_count || 0) + (hasPrayed && !request.interaction_count ? 1 : 0)) > 0 && (
                          <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
                            hasPrayed 
                              ? "bg-amber-200/50 dark:bg-amber-800/30" 
                              : "bg-white/20"
                          }`}>
                            {(request.interaction_count || 0) + (hasPrayed && !request.interaction_count ? 1 : 0)}
                          </span>
                        )}
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
          
          {hasMoreRequests && (
            <div className="pt-3">
              <Link href={getMapUrl({})}>
                <button 
                  className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                  data-testid="button-view-more-prayer-needs"
                >
                  <span>View all {totalRequests} prayer needs</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </Link>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
      
      <GuestPrayerModal
        open={showGuestModal}
        onClose={() => {
          setShowGuestModal(false);
          setPendingGuestPrayer(null);
        }}
        onSubmit={handleGuestPrayerSubmit}
        prayerTitle={pendingGuestPrayer?.prayerTitle}
        churchName={pendingGuestPrayer?.churchName || undefined}
      />
    </div>
  );
}
