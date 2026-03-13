import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Megaphone, Loader2, Trash2, Hand, Check, ChevronDown } from "lucide-react";
import { IconBuildingChurch } from "@tabler/icons-react";
import { formatDistanceToNow } from "date-fns";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/contexts/AuthContext";
import { GuestPrayerModal } from "./GuestPrayerModal";

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

interface AddChurchPrayerSectionProps {
  churchId: string;
  churchName: string;
  cityPlatformId?: string | null;
  compact?: boolean;
}

export function AddChurchPrayerSection({
  churchId,
  churchName,
  cityPlatformId,
  compact = false,
}: AddChurchPrayerSectionProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  
  // Pray functionality - scoped by churchId to avoid cross-church collisions
  const prayedStorageKey = `prayedPrayerIds:${churchId}`;
  const [prayedIds, setPrayedIds] = useState<Set<string>>(new Set());
  const [prayingFor, setPrayingFor] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  
  // Guest prayer modal state
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [pendingGuestPrayer, setPendingGuestPrayer] = useState<{
    prayerId: string;
    prayerTitle: string;
  } | null>(null);
  
  useEffect(() => {
    const stored = sessionStorage.getItem(prayedStorageKey);
    if (stored) {
      setPrayedIds(new Set(JSON.parse(stored)));
    }
  }, [prayedStorageKey]);

  const { data: existingRequests, isLoading: isLoadingRequests } = useQuery<{
    requests: ChurchPrayerRequest[];
  }>({
    queryKey: ["/api/prayers/church-requests", churchId],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("church_id", churchId);
      params.set("limit", "10");
      const response = await fetch(`/api/prayers/church-requests?${params}`);
      if (!response.ok) throw new Error("Failed to fetch church prayer requests");
      return response.json();
    },
    enabled: !compact,
  });

  const createPrayerMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/churches/${churchId}/church-prayer-request`, {
        title,
        body,
        city_platform_id: cityPlatformId,
      });
    },
    onSuccess: () => {
      toast({
        title: "Prayer request created",
        description: "The church prayer need has been posted.",
      });
      setTitle("");
      setBody("");
      setIsAdding(false);
      queryClient.invalidateQueries({ queryKey: ["/api/prayers/church-requests", churchId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deletePrayerMutation = useMutation({
    mutationFn: async (prayerId: string) => {
      return apiRequest("DELETE", `/api/admin/prayers/${prayerId}`);
    },
    onSuccess: () => {
      toast({
        title: "Prayer request deleted",
        description: "The prayer request has been removed.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/prayers/church-requests", churchId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Post prayer response to community feed
  const postPrayerResponse = useMutation({
    mutationFn: async (data: { 
      commentType: 'prayer_tap'; 
      body: string; 
      displayName?: string; 
      prayerId?: string;
    }) => {
      const response = await apiRequest("POST", `/api/churches/${churchId}/prayer-post`, data);
      return response;
    },
    onSuccess: (data) => {
      if (data.posted) {
        queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      }
    },
  });
  
  const markPrayerComplete = (prayerId: string, prayerTitle: string) => {
    const newPrayedIds = new Set(prayedIds).add(prayerId);
    setPrayedIds(newPrayedIds);
    sessionStorage.setItem(prayedStorageKey, JSON.stringify(Array.from(newPrayedIds)));
    queryClient.invalidateQueries({ queryKey: ["/api/prayers/church-requests", churchId] });
    
    if (user) {
      const userName = user.user_metadata?.full_name || user.user_metadata?.first_name || user.email?.split('@')[0] || 'Someone';
      postPrayerResponse.mutate({
        commentType: 'prayer_tap',
        body: `Prayed for: "${prayerTitle}"`,
        displayName: userName,
        prayerId: prayerId,
      });
    }
    
    setPrayingFor(null);
  };
  
  const handlePray = async (e: React.MouseEvent, prayerId: string, prayerTitle: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (prayedIds.has(prayerId) || prayingFor) return;
    
    setPrayingFor(prayerId);
    
    try {
      await apiRequest("POST", "/api/prayers/pray", { prayer_id: prayerId });
      markPrayerComplete(prayerId, prayerTitle);
    } catch (error: any) {
      if (error.message?.includes('400') || error.message?.includes('Guest name required')) {
        setPendingGuestPrayer({ prayerId, prayerTitle });
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
  
  const handleGuestPrayerSubmit = async (guestName: string, fullName: string) => {
    if (!pendingGuestPrayer) return;
    
    const { prayerId, prayerTitle } = pendingGuestPrayer;
    
    await apiRequest("POST", "/api/prayers/pray", { 
      prayer_id: prayerId,
      guest_name: guestName,
      guest_full_name: fullName
    });
    
    markPrayerComplete(prayerId, prayerTitle);
  };
  
  const toggleExpanded = (prayerId: string) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(prayerId)) {
        newSet.delete(prayerId);
      } else {
        newSet.add(prayerId);
      }
      return newSet;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast({
        title: "Missing title",
        description: "Please enter a title for the prayer request.",
        variant: "destructive",
      });
      return;
    }
    createPrayerMutation.mutate();
  };

  const requests = existingRequests?.requests || [];

  if (compact) {
    return (
      <div className="space-y-3">
        {!isAdding ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAdding(true)}
            className="w-full border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
            data-testid="button-add-church-prayer-compact"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Prayer Request
          </Button>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3 p-3 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg border border-amber-200/50 dark:border-amber-800/30">
            <div>
              <Input
                placeholder="Prayer need title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-background"
                data-testid="input-prayer-title-compact"
              />
            </div>
            <div>
              <Textarea
                placeholder="Describe the prayer need..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={2}
                className="bg-background resize-none"
                data-testid="input-prayer-body-compact"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsAdding(false);
                  setTitle("");
                  setBody("");
                }}
                data-testid="button-cancel-prayer-compact"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={createPrayerMutation.isPending}
                className="bg-amber-500 hover:bg-amber-600 text-white"
                data-testid="button-submit-prayer-compact"
              >
                {createPrayerMutation.isPending ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Megaphone className="w-3 h-3 mr-1" />
                    Add
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    );
  }

  return (
    <Card className="border-amber-200/50 dark:border-amber-800/30 bg-amber-50/30 dark:bg-amber-950/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          Church Prayer Needs
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Add prayer requests on behalf of {churchName}. These appear as mini-cards on prayer posts.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoadingRequests ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
          </div>
        ) : requests.length > 0 ? (
          <div className="space-y-2">
            {requests.map((request) => {
              const isExpanded = expandedIds.has(request.id);
              const hasPrayed = prayedIds.has(request.id);
              const isPraying = prayingFor === request.id;
              const hasBody = request.body && request.body !== request.title;
              
              return (
                <Collapsible
                  key={request.id}
                  open={isExpanded}
                  onOpenChange={() => toggleExpanded(request.id)}
                >
                  <div
                    className={`p-3 bg-white dark:bg-slate-900 rounded-lg border transition-all ${
                      hasPrayed
                        ? "border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20"
                        : "border-amber-200/50 dark:border-amber-800/30"
                    }`}
                    data-testid={`existing-prayer-${request.id}`}
                  >
                    <div className="flex items-start gap-2">
                      <CollapsibleTrigger className="flex-1 text-left min-w-0" data-testid={`toggle-prayer-${request.id}`}>
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Badge
                                variant="secondary"
                                className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[10px]"
                              >
                                <IconBuildingChurch className="w-2.5 h-2.5 mr-1" />
                                Church Need
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                              </span>
                            </div>
                            <h4 className={`font-medium text-sm ${!isExpanded ? 'line-clamp-1' : ''}`} data-testid={`text-prayer-title-${request.id}`}>
                              {request.title}
                            </h4>
                            {hasBody && !isExpanded && (
                              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                {request.body}
                              </p>
                            )}
                            {(request.interaction_count || 0) > 0 && (
                              <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                                <Hand className="w-2.5 h-2.5" />
                                {request.interaction_count} prayed
                              </div>
                            )}
                          </div>
                          <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </CollapsibleTrigger>
                      
                      {!isExpanded && (
                        <Button
                          onClick={(e) => handlePray(e, request.id, request.title)}
                          disabled={hasPrayed || isPraying}
                          size="icon"
                          className={`h-8 w-8 rounded-full flex-shrink-0 ${
                            hasPrayed
                              ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                              : "bg-amber-500 text-white border-amber-500"
                          }`}
                          variant={hasPrayed ? "outline" : "default"}
                          data-testid={`button-quick-pray-${request.id}`}
                        >
                          {isPraying ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : hasPrayed ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Hand className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      )}
                    </div>
                    
                    <CollapsibleContent>
                      {hasBody && (
                        <p className="text-xs text-muted-foreground mt-2 leading-relaxed" data-testid={`text-prayer-body-${request.id}`}>
                          {request.body}
                        </p>
                      )}
                      
                      <div className="flex items-center gap-2 mt-3">
                        <Button
                          onClick={(e) => handlePray(e, request.id, request.title)}
                          disabled={hasPrayed || isPraying}
                          size="sm"
                          className={`flex-1 rounded-full ${
                            hasPrayed
                              ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                              : "bg-amber-500 text-white border-amber-500"
                          }`}
                          variant={hasPrayed ? "outline" : "default"}
                          data-testid={`button-pray-sidebar-${request.id}`}
                        >
                          {isPraying ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : hasPrayed ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <Hand className="w-3 h-3" />
                          )}
                          <span className="ml-1 text-xs">
                            {hasPrayed ? "Prayed" : "Pray for this need"}
                          </span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            deletePrayerMutation.mutate(request.id);
                          }}
                          disabled={deletePrayerMutation.isPending}
                          data-testid={`button-delete-prayer-${request.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-2">
            No prayer requests yet for this church.
          </p>
        )}

        {!isAdding ? (
          <Button
            variant="outline"
            onClick={() => setIsAdding(true)}
            className="w-full border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
            data-testid="button-add-church-prayer"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Prayer Request
          </Button>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3 p-3 bg-white dark:bg-slate-900 rounded-lg border border-amber-200/50 dark:border-amber-800/30">
            <div className="space-y-1.5">
              <Label htmlFor="prayer-title" className="text-xs">
                Title
              </Label>
              <Input
                id="prayer-title"
                placeholder="e.g., Pray for our youth ministry"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                data-testid="input-prayer-title"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prayer-body" className="text-xs">
                Description <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="prayer-body"
                placeholder="Describe the prayer need..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                className="resize-none"
                data-testid="input-prayer-body"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsAdding(false);
                  setTitle("");
                  setBody("");
                }}
                data-testid="button-cancel-prayer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={createPrayerMutation.isPending}
                className="bg-amber-500 hover:bg-amber-600 text-white"
                data-testid="button-submit-prayer"
              >
                {createPrayerMutation.isPending ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Megaphone className="w-3 h-3 mr-1" />
                    Add Prayer Request
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
      
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
    </Card>
  );
}
