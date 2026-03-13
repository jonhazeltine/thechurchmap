import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Hand, Loader2, Send, MessageCircle, ExternalLink, Check, Megaphone } from "lucide-react";
import { IconBuildingChurch } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import type { VisiblePrayer } from "@shared/schema";
import { GuestPrayerModal } from "./GuestPrayerModal";

interface ChurchPrayerDialogProps {
  churchId: string | null;
  churchName?: string;
  onClose: () => void;
  onPrayerUpdate?: () => void;
}

interface NamePromptState {
  isOpen: boolean;
  prayerId: string | null;
  prayerTitle: string;
}

interface PostedResponse {
  postId: string;
  commentId: string;
  message: string;
}

export function ChurchPrayerDialog({ 
  churchId, 
  churchName,
  onClose, 
  onPrayerUpdate 
}: ChurchPrayerDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [prayingFor, setPrayingFor] = useState<string | null>(null);
  const [prayedIds, setPrayedIds] = useState<Set<string>>(new Set());
  const [namePrompt, setNamePrompt] = useState<NamePromptState>({ 
    isOpen: false, 
    prayerId: null, 
    prayerTitle: "" 
  });
  const [displayName, setDisplayName] = useState("");
  const [encouragement, setEncouragement] = useState("");
  const [isSubmittingEncouragement, setIsSubmittingEncouragement] = useState(false);
  const [postedResponse, setPostedResponse] = useState<PostedResponse | null>(null);
  
  // Guest prayer modal state
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [pendingGuestPrayer, setPendingGuestPrayer] = useState<{
    prayerId: string;
    prayerTitle: string;
  } | null>(null);

  const { data: prayers = [], isLoading } = useQuery<VisiblePrayer[]>({
    queryKey: ["/api/churches", churchId, "prayers"],
    queryFn: async () => {
      if (!churchId) return [];
      const response = await fetch(`/api/churches/${churchId}/prayers`);
      if (!response.ok) throw new Error("Failed to fetch prayers");
      const data = await response.json();
      return data.prayers || [];
    },
    enabled: !!churchId,
  });

  const postPrayerResponse = useMutation({
    mutationFn: async (data: { 
      commentType: 'prayer_tap' | 'encouragement'; 
      body: string; 
      displayName?: string; 
      prayerId?: string;
    }) => {
      const response = await apiRequest("POST", `/api/churches/${churchId}/prayer-post`, data);
      return response;
    },
    onSuccess: (data) => {
      if (data.posted) {
        setPostedResponse({
          postId: data.postId,
          commentId: data.commentId,
          message: data.message,
        });
        queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      }
    },
  });

  const handlePrayerTap = async (prayerId: string, prayerTitle: string, guestName?: string) => {
    if (prayingFor || prayedIds.has(prayerId)) return;
    
    // First, record the prayer interaction
    setPrayingFor(prayerId);
    
    try {
      const payload: any = { prayer_id: prayerId };
      if (guestName) {
        payload.guest_name = guestName;
      }
      
      await apiRequest("POST", "/api/prayers/pray", payload);
      setPrayedIds(prev => new Set(Array.from(prev).concat(prayerId)));
      onPrayerUpdate?.();
      
      // For logged-in users, auto-post using their profile name
      if (user) {
        try {
          const userName = user.user_metadata?.full_name || user.user_metadata?.first_name || user.email?.split('@')[0] || 'Someone';
          await postPrayerResponse.mutateAsync({
            commentType: 'prayer_tap',
            body: `Prayed for: "${prayerTitle}"`,
            displayName: userName,
            prayerId: prayerId,
          });
          toast({
            title: "Prayer Shared",
            description: "Your prayer has been added to the community feed.",
          });
        } catch (postError) {
          // Prayer was recorded but community post failed - that's okay
          toast({
            title: "Prayer Recorded",
            description: "Your prayer has been counted.",
          });
        }
      } else if (guestName) {
        // Guest with name provided - show thank you (modal will handle account prompt)
        // Success is handled by the modal
      } else {
        // For anonymous users without guest name, show name prompt for optional community posting
        setNamePrompt({ isOpen: true, prayerId, prayerTitle });
      }
    } catch (error: any) {
      // Check if guest needs to provide name
      if (error.message?.includes('400') || error.message?.includes('Guest name required')) {
        setPendingGuestPrayer({ prayerId, prayerTitle });
        setShowGuestModal(true);
        setPrayingFor(null);
        return;
      }
      
      // Handle rate limit silently - prayer was already counted
      if (error.message?.includes('429')) {
        // Silent - no toast needed
      } else {
        toast({
          title: "Error",
          description: "Failed to record prayer. Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setPrayingFor(null);
    }
  };
  
  const handleGuestPrayerSubmit = async (guestName: string, _fullName: string) => {
    if (!pendingGuestPrayer) return;
    await handlePrayerTap(pendingGuestPrayer.prayerId, pendingGuestPrayer.prayerTitle, guestName);
  };

  const handleNameSubmit = async () => {
    if (!namePrompt.prayerId) return;
    
    const name = displayName.trim();
    if (!name) {
      // Close prompt without posting to community
      setNamePrompt({ isOpen: false, prayerId: null, prayerTitle: "" });
      toast({
        title: "Prayer Recorded",
        description: "Your prayer has been counted privately.",
      });
      return;
    }

    try {
      const prayer = prayers.find(p => p.id === namePrompt.prayerId);
      await postPrayerResponse.mutateAsync({
        commentType: 'prayer_tap',
        body: `Prayed for: "${prayer?.title || namePrompt.prayerTitle}"`,
        displayName: name,
        prayerId: namePrompt.prayerId,
      });
      
      toast({
        title: "Prayer Shared",
        description: "Your prayer has been added to the community feed.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to share prayer. Your prayer was still counted.",
        variant: "destructive",
      });
    } finally {
      setNamePrompt({ isOpen: false, prayerId: null, prayerTitle: "" });
      setDisplayName("");
    }
  };

  const handleEncouragementSubmit = async () => {
    if (!encouragement.trim() || !churchId) return;
    
    if (!user) {
      toast({
        title: "Login Required",
        description: "Please log in to share encouragements.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmittingEncouragement(true);
    
    try {
      await postPrayerResponse.mutateAsync({
        commentType: 'encouragement',
        body: encouragement.trim(),
      });
      
      toast({
        title: "Encouragement Shared",
        description: "Your encouragement has been added to the community feed.",
      });
      setEncouragement("");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to share encouragement. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingEncouragement(false);
    }
  };

  const handleViewInCommunity = () => {
    if (postedResponse?.postId) {
      window.location.href = `/community?post=${postedResponse.postId}`;
    }
  };

  if (!churchId) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-[200] flex items-center justify-center"
        onClick={onClose}
        data-testid="church-prayer-dialog-backdrop"
      >
        {/* Dark backdrop with blur */}
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
        
        {/* Dialog content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-[90vw] max-w-md max-h-[80vh] rounded-2xl overflow-hidden"
          data-testid="church-prayer-dialog"
        >
          {/* Soft golden glow effect */}
          <div 
            className="absolute inset-0 rounded-2xl"
            style={{
              background: "radial-gradient(circle at 50% 0%, rgba(255, 215, 0, 0.08) 0%, transparent 60%)",
            }}
          />
          
          {/* Glass card effect */}
          <div className="relative bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-white/10">
                  <IconBuildingChurch className="w-4 h-4 text-white/70" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white/95">
                    {churchName || "Church Prayers"}
                  </h2>
                  <p className="text-xs text-white/50">Tap to join in prayer</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-white/60 hover:text-white hover:bg-white/10 rounded-full"
                data-testid="button-close-prayer-dialog"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            
            {/* Posted response notification */}
            <AnimatePresence>
              {postedResponse && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="border-b border-white/10 bg-emerald-500/10 flex-shrink-0"
                >
                  <div className="p-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-emerald-300 text-sm">
                      <Check className="w-4 h-4" />
                      <span>Posted to community</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleViewInCommunity}
                      className="text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/20 text-xs gap-1"
                      data-testid="button-view-in-community"
                    >
                      <ExternalLink className="w-3 h-3" />
                      View
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Prayer list */}
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-4 space-y-3">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 text-white/50">
                    <Loader2 className="w-8 h-8 animate-spin mb-3" />
                    <p className="text-sm">Loading prayers...</p>
                  </div>
                ) : prayers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-white/50">
                    <Hand className="w-10 h-10 mb-3 opacity-50" />
                    <p className="text-sm text-center">
                      No prayer requests yet for this church.
                    </p>
                    <p className="text-xs text-center mt-1 text-white/30">
                      Share an encouragement below!
                    </p>
                  </div>
                ) : (
                  prayers.map((prayer) => {
                    const hasPrayed = prayedIds.has(prayer.id);
                    const isPraying = prayingFor === prayer.id;
                    const isChurchRequest = prayer.is_church_request;
                    
                    return (
                      <motion.button
                        key={prayer.id}
                        onClick={() => handlePrayerTap(prayer.id, prayer.title)}
                        disabled={hasPrayed || isPraying}
                        whileTap={{ scale: 0.98 }}
                        className={`
                          w-full text-left p-4 rounded-xl transition-all duration-200
                          ${hasPrayed 
                            ? "bg-amber-500/20 border border-amber-500/30" 
                            : isChurchRequest
                              ? "bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/15 hover:border-emerald-500/30"
                              : "bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20"
                          }
                        `}
                        data-testid={`prayer-item-${prayer.id}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            {isChurchRequest && (
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <Megaphone className="w-3 h-3 text-emerald-400" />
                                <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-400">
                                  Church Need
                                </span>
                              </div>
                            )}
                            <h3 className="font-medium text-white/90 text-sm mb-1 line-clamp-1">
                              {prayer.title}
                            </h3>
                            <p className="text-white/60 text-xs line-clamp-3 leading-relaxed">
                              {prayer.body}
                            </p>
                            {!isChurchRequest && prayer.display_first_name && (
                              <p className="text-white/40 text-xs mt-2">
                                — {prayer.display_first_name} {prayer.display_last_initial}.
                              </p>
                            )}
                          </div>
                          
                          <div className={`
                            flex-shrink-0 p-2 rounded-full transition-all duration-300
                            ${hasPrayed 
                              ? "bg-amber-500/30 text-amber-300" 
                              : "bg-white/10 text-white/50 hover:bg-white/20 hover:text-white"
                            }
                          `}>
                            {isPraying ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Hand className={`w-4 h-4 ${hasPrayed ? "fill-current" : ""}`} />
                            )}
                          </div>
                        </div>
                        
                        {prayer.interaction_count !== undefined && prayer.interaction_count > 0 && (
                          <p className="text-white/30 text-xs mt-2">
                            {prayer.interaction_count} {prayer.interaction_count === 1 ? "person has" : "people have"} prayed
                          </p>
                        )}
                      </motion.button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
            
            {/* Encouragement input section */}
            <div className="p-4 border-t border-white/10 flex-shrink-0 bg-white/5">
              <div className="flex items-center gap-2 mb-2">
                <MessageCircle className="w-4 h-4 text-white/50" />
                <span className="text-white/70 text-sm font-medium">Share an encouragement</span>
              </div>
              <div className="flex gap-2">
                <Textarea
                  value={encouragement}
                  onChange={(e) => setEncouragement(e.target.value)}
                  placeholder={user ? "Write a prayer or encouragement for this church..." : "Log in to share encouragements"}
                  disabled={!user || isSubmittingEncouragement}
                  className="flex-1 min-h-[60px] max-h-[100px] bg-white/10 border-white/20 text-white placeholder:text-white/40 resize-none text-sm"
                  data-testid="input-encouragement"
                />
                <Button
                  onClick={handleEncouragementSubmit}
                  disabled={!encouragement.trim() || !user || isSubmittingEncouragement}
                  className="bg-amber-500/80 hover:bg-amber-500 active:bg-amber-600 active:scale-95 text-white self-end transition-all duration-150"
                  size="icon"
                  data-testid="button-submit-encouragement"
                >
                  {isSubmittingEncouragement ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
              {!user && (
                <p className="text-white/40 text-xs mt-2">
                  <a href="/login" className="text-amber-400 hover:text-amber-300 underline">Log in</a> to share encouragements
                </p>
              )}
            </div>
          </div>
        </motion.div>

        {/* Name prompt modal */}
        <AnimatePresence>
          {namePrompt.isOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[210] flex items-center justify-center"
              onClick={() => {
                setNamePrompt({ isOpen: false, prayerId: null, prayerTitle: "" });
                setDisplayName("");
              }}
            >
              <div className="absolute inset-0 bg-black/50" />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
                className="relative bg-slate-900 border border-white/20 rounded-xl p-5 w-[85vw] max-w-sm shadow-2xl"
                data-testid="name-prompt-modal"
              >
                <h3 className="text-white font-semibold text-lg mb-2">
                  Share with Community?
                </h3>
                <p className="text-white/60 text-sm mb-4">
                  Enter your name to share this prayer in the community feed. Leave blank to pray privately.
                </p>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your first name (optional)"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/40 mb-4"
                  autoFocus
                  data-testid="input-display-name"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleNameSubmit();
                    }
                  }}
                />
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setNamePrompt({ isOpen: false, prayerId: null, prayerTitle: "" });
                      setDisplayName("");
                      toast({
                        title: "Prayer Recorded",
                        description: "Your prayer has been counted privately.",
                      });
                    }}
                    className="flex-1 text-white/70 hover:text-white hover:bg-white/10"
                    data-testid="button-pray-privately"
                  >
                    Pray Privately
                  </Button>
                  <Button
                    onClick={handleNameSubmit}
                    disabled={postPrayerResponse.isPending}
                    className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                    data-testid="button-share-prayer"
                  >
                    {postPrayerResponse.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Share"
                    )}
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        
        <GuestPrayerModal
          open={showGuestModal}
          onClose={() => {
            setShowGuestModal(false);
            setPendingGuestPrayer(null);
          }}
          onSubmit={handleGuestPrayerSubmit}
          prayerTitle={pendingGuestPrayer?.prayerTitle}
          churchName={churchName}
        />
      </motion.div>
    </AnimatePresence>
  );
}
