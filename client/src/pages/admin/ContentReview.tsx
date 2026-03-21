import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, Trash2, Heart, MessageSquare, ExternalLink, PartyPopper, Archive, Plus, Undo2, ClipboardList } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { supabase } from "../../../../lib/supabaseClient";
import { Link } from "wouter";
import { MarkAnsweredDialog } from "@/components/MarkAnsweredDialog";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { usePlatformContext } from "@/contexts/PlatformContext";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PrayerWithSubmitter } from "@shared/schema";

// ---------- Types from Moderation ----------
interface ModerationItem {
  id: string;
  type: 'prayer' | 'comment';
  title?: string;
  body: string;
  status: string;
  created_at: string;
  guest_name?: string | null;
  is_anonymous?: boolean;
  display_first_name?: string | null;
  display_last_initial?: string | null;
  answered_at?: string | null;
  answered_note?: string | null;
  source: {
    type: 'church' | 'post';
    id: string;
    name: string;
  };
}

interface ModerationResponse {
  items: ModerationItem[];
  counts: {
    prayers: number;
    comments: number;
    total: number;
  };
}

// =============================================
// Unified Content Review Panel
// =============================================
export default function ContentReview() {
  const { toast } = useToast();
  const { isSuperAdmin } = useAdminAccess();
  const { platformId, platform } = usePlatformContext();
  const [activeTab, setActiveTab] = useState("review");
  const [processingId, setProcessingId] = useState<string | null>(null);

  // ----- Review Queue state (from Moderation) -----
  const [reviewTypeFilter, setReviewTypeFilter] = useState("all");

  // ----- Prayer Requests tab state (from Prayer) -----
  const [prayerStatus, setPrayerStatus] = useState("pending");

  // ----- Create prayer form state -----
  const [prayerType, setPrayerType] = useState<"platform" | "all_platforms" | "regional">("platform");
  const [regionType, setRegionType] = useState<string>("");
  const [regionId, setRegionId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitterName, setSubmitterName] = useState("");
  const [boundarySearch, setBoundarySearch] = useState("");
  const [selectedBoundaryName, setSelectedBoundaryName] = useState("");

  // =============================================
  // QUERIES
  // =============================================

  // Review Queue: pending items (prayers + comments) needing approval
  const { data: reviewData, isLoading: reviewLoading } = useQuery<ModerationResponse>({
    queryKey: ["/api/admin/moderation", reviewTypeFilter, "pending"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      const response = await fetch(
        `/api/admin/moderation?type=${reviewTypeFilter}&status=pending`,
        { headers, credentials: "include" }
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`${response.status}: ${text}`);
      }
      return response.json();
    },
  });

  // Pending counts for badge
  const { data: pendingCounts } = useQuery<ModerationResponse>({
    queryKey: ["/api/admin/moderation", "all", "pending", "counts"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      const response = await fetch(
        `/api/admin/moderation?type=all&status=pending`,
        { headers, credentials: "include" }
      );
      if (!response.ok) return { items: [], counts: { prayers: 0, comments: 0, total: 0 } };
      return response.json();
    },
  });

  // Comments tab: all comments across statuses
  const [commentStatus, setCommentStatus] = useState("pending");
  const { data: commentsData, isLoading: commentsLoading } = useQuery<ModerationResponse>({
    queryKey: ["/api/admin/moderation", "comments", commentStatus],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      const response = await fetch(
        `/api/admin/moderation?type=comments&status=${commentStatus}`,
        { headers, credentials: "include" }
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`${response.status}: ${text}`);
      }
      return response.json();
    },
    enabled: activeTab === "comments",
  });

  // Prayer Requests tab: fetches from /api/admin/prayers
  const { data: prayers, isLoading: prayersLoading } = useQuery<PrayerWithSubmitter[]>({
    queryKey: ["/api/admin/prayers", prayerStatus],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      const response = await fetch(`/api/admin/prayers?status=${prayerStatus}`, {
        headers,
        credentials: "include",
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`${response.status}: ${text}`);
      }
      return response.json();
    },
    enabled: activeTab === "prayers",
  });

  // Boundary search for create form
  const { data: boundaries, isLoading: boundariesLoading } = useQuery({
    queryKey: ["/api/boundaries/search", regionType, boundarySearch],
    queryFn: async () => {
      if (!regionType || !boundarySearch || boundarySearch.length < 2) return [];
      const response = await fetch(
        `/api/boundaries/search?q=${encodeURIComponent(boundarySearch)}&type=${regionType}`
      );
      if (!response.ok) throw new Error("Failed to search boundaries");
      return response.json();
    },
    enabled: !!regionType && regionType !== "platform_region" && prayerType === "regional" && boundarySearch.length >= 2,
  });

  // Platform regions for create form
  const { data: platformRegions } = useQuery<{ id: string; name: string; color: string }[]>({
    queryKey: [`/api/admin/city-platforms/${platformId}/regions`],
    queryFn: async () => {
      if (!platformId) return [];
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      const response = await fetch(`/api/admin/city-platforms/${platformId}/regions`, { headers });
      if (!response.ok) return [];
      const data = await response.json();
      return data.regions || [];
    },
    enabled: !!platformId,
  });

  // =============================================
  // MUTATIONS
  // =============================================

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/moderation"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/prayers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/comments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard/stats"] });
  };

  const updatePrayerMutation = useMutation({
    mutationFn: async ({ prayerId, status }: { prayerId: string; status: string }) => {
      setProcessingId(prayerId);
      return apiRequest("PATCH", `/api/admin/prayers/${prayerId}`, { status });
    },
    onSuccess: () => {
      invalidateAll();
      setProcessingId(null);
      toast({ title: "Success", description: "Prayer status updated" });
    },
    onError: (error: Error) => {
      setProcessingId(null);
      toast({ title: "Error", description: error.message || "Failed to update prayer", variant: "destructive" });
    },
  });

  const updateCommentMutation = useMutation({
    mutationFn: async ({ commentId, status }: { commentId: string; status: string }) => {
      setProcessingId(commentId);
      return apiRequest("PATCH", `/api/admin/comments/${commentId}`, { status });
    },
    onSuccess: () => {
      invalidateAll();
      setProcessingId(null);
      toast({ title: "Success", description: "Comment status updated" });
    },
    onError: (error: Error) => {
      setProcessingId(null);
      toast({ title: "Error", description: error.message || "Failed to update comment", variant: "destructive" });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      setProcessingId(commentId);
      return apiRequest("DELETE", `/api/admin/comments/${commentId}`);
    },
    onSuccess: () => {
      invalidateAll();
      setProcessingId(null);
      toast({ title: "Success", description: "Comment deleted" });
    },
    onError: (error: Error) => {
      setProcessingId(null);
      toast({ title: "Error", description: error.message || "Failed to delete comment", variant: "destructive" });
    },
  });

  const markAnsweredMutation = useMutation({
    mutationFn: async ({ prayerId, note }: { prayerId: string; note?: string }) => {
      setProcessingId(prayerId);
      return apiRequest("PATCH", `/api/admin/prayers/${prayerId}`, {
        mark_answered: true,
        answered_note: note || null,
      });
    },
    onSuccess: () => {
      invalidateAll();
      setProcessingId(null);
      toast({ title: "Prayer Answered!", description: "Prayer has been marked as answered" });
    },
    onError: (error: Error) => {
      setProcessingId(null);
      toast({ title: "Error", description: error.message || "Failed to mark prayer as answered", variant: "destructive" });
    },
  });

  const unmarkAnsweredMutation = useMutation({
    mutationFn: async (prayerId: string) => {
      setProcessingId(prayerId);
      return apiRequest("PATCH", `/api/admin/prayers/${prayerId}`, { unmark_answered: true });
    },
    onSuccess: () => {
      invalidateAll();
      setProcessingId(null);
      toast({ title: "Success", description: "Prayer unmarked as answered" });
    },
    onError: (error: Error) => {
      setProcessingId(null);
      toast({ title: "Error", description: error.message || "Failed to unmark prayer", variant: "destructive" });
    },
  });

  const createPrayerMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/admin/prayers/create", data);
    },
    onSuccess: () => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["/api/prayers/visible"] });
      setTitle("");
      setBody("");
      setSubmitterName("");
      setRegionType("");
      setRegionId("");
      setBoundarySearch("");
      setSelectedBoundaryName("");
      setPrayerType("platform");
      toast({ title: "Success", description: "Prayer created and published" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create prayer", variant: "destructive" });
    },
  });

  // =============================================
  // HANDLERS
  // =============================================

  const handlePrayerAction = (prayerId: string, status: string) => {
    updatePrayerMutation.mutate({ prayerId, status });
  };

  const handleCommentAction = (commentId: string, status: string) => {
    updateCommentMutation.mutate({ commentId, status });
  };

  const handleDeleteComment = (commentId: string) => {
    deleteCommentMutation.mutate(commentId);
  };

  const handleMarkAnswered = (prayerId: string, note?: string) => {
    markAnsweredMutation.mutate({ prayerId, note });
  };

  const handleUnmarkAnswered = (prayerId: string) => {
    unmarkAnsweredMutation.mutate(prayerId);
  };

  const handleCreatePrayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast({ title: "Validation Error", description: "Title and body are required", variant: "destructive" });
      return;
    }
    const prayerData: any = {
      title: title.trim(),
      body: body.trim(),
      submitter_name: submitterName.trim() || undefined,
    };
    if (prayerType === "all_platforms") {
      prayerData.global = true;
    } else if (prayerType === "platform") {
      prayerData.platform_wide = true;
      prayerData.city_platform_id = platformId;
    } else {
      if (!regionType) {
        toast({ title: "Validation Error", description: "Please select an area type", variant: "destructive" });
        return;
      }
      if (!regionId) {
        toast({
          title: "Validation Error",
          description: regionType === "platform_region" ? "Please select a region" : "Please select a boundary area",
          variant: "destructive",
        });
        return;
      }
      prayerData.region_type = regionType;
      prayerData.region_id = regionId;
      prayerData.city_platform_id = platformId;
    }
    createPrayerMutation.mutate(prayerData);
  };

  // =============================================
  // RENDER: Review Queue item (mixed prayers + comments)
  // =============================================
  const renderModerationItem = (item: ModerationItem) => {
    const isPrayer = item.type === 'prayer';
    const isProcessing = processingId === item.id;

    return (
      <Card key={item.id} data-testid={`card-moderation-${item.id}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {isPrayer ? (
                  <Heart className="h-4 w-4 text-rose-500 shrink-0" />
                ) : (
                  <MessageSquare className="h-4 w-4 text-blue-500 shrink-0" />
                )}
                <Badge variant="outline" className="text-xs">
                  {isPrayer ? 'Prayer' : 'Comment'}
                </Badge>
                {isPrayer && item.answered_at && (
                  <Badge variant="default" className="text-xs bg-yellow-500 hover:bg-yellow-600">
                    <PartyPopper className="h-3 w-3 mr-1" />
                    Answered
                  </Badge>
                )}
                <Badge variant={
                  item.status === 'approved' || item.status === 'published' ? 'default' :
                  item.status === 'pending' ? 'secondary' :
                  'outline'
                } className="text-xs">
                  {item.status}
                </Badge>
              </div>
              {item.title && (
                <CardTitle className="text-lg">{item.title}</CardTitle>
              )}
              <CardDescription className="mt-1 flex items-center gap-2 flex-wrap">
                <span>{item.source.name}</span>
                <span className="text-muted-foreground">&bull;</span>
                <span>{new Date(item.created_at).toLocaleDateString()}</span>
                {item.source.type === 'post' && item.source.id && (
                  <Link
                    href={`/community/${item.source.id}`}
                    className="text-primary hover:underline flex items-center gap-1"
                    data-testid={`link-view-source-${item.id}`}
                  >
                    <ExternalLink className="h-3 w-3" />
                    View Post
                  </Link>
                )}
                {item.source.type === 'church' && item.source.id && (
                  <Link
                    href={`/church/${item.source.id}`}
                    className="text-primary hover:underline flex items-center gap-1"
                    data-testid={`link-view-source-${item.id}`}
                  >
                    <ExternalLink className="h-3 w-3" />
                    View Church
                  </Link>
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm mb-4 line-clamp-3">{item.body}</p>

          {isPrayer && item.answered_at && item.answered_note && (
            <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
              <p className="text-xs font-medium text-yellow-800 dark:text-yellow-200 mb-1 flex items-center gap-1">
                <PartyPopper className="h-3 w-3" />
                Testimony / Answer Note
              </p>
              <p className="text-sm text-yellow-900 dark:text-yellow-100">{item.answered_note}</p>
            </div>
          )}

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs text-muted-foreground">
              {isPrayer ? (
                item.is_anonymous ? (
                  <span>Anonymous request</span>
                ) : item.display_first_name ? (
                  <span>From: {item.display_first_name} {item.display_last_initial}.</span>
                ) : (
                  <span>Submitted by user</span>
                )
              ) : (
                <span>Guest: {item.guest_name}</span>
              )}
            </div>

            {item.status === 'pending' && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => isPrayer
                    ? handlePrayerAction(item.id, 'approved')
                    : handleCommentAction(item.id, 'published')
                  }
                  disabled={isProcessing}
                  data-testid={`button-approve-${item.id}`}
                >
                  <Check className="h-4 w-4 mr-1" />
                  {isProcessing ? "..." : "Approve"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => isPrayer
                    ? handlePrayerAction(item.id, 'rejected')
                    : handleCommentAction(item.id, 'rejected')
                  }
                  disabled={isProcessing}
                  data-testid={`button-reject-${item.id}`}
                >
                  <X className="h-4 w-4 mr-1" />
                  {isProcessing ? "..." : "Reject"}
                </Button>
                {!isPrayer && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDeleteComment(item.id)}
                    disabled={isProcessing}
                    data-testid={`button-delete-${item.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}

            {isPrayer && item.status === 'approved' && !item.answered_at && (
              <div className="flex gap-2">
                <MarkAnsweredDialog
                  prayerId={item.id}
                  prayerTitle={item.title || 'Prayer Request'}
                  onMarkAnswered={handleMarkAnswered}
                  isProcessing={isProcessing}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handlePrayerAction(item.id, 'archived')}
                  disabled={isProcessing}
                  data-testid={`button-archive-${item.id}`}
                >
                  <Archive className="h-4 w-4 mr-1" />
                  {isProcessing ? "..." : "Archive"}
                </Button>
              </div>
            )}

            {item.status !== 'pending' && !isPrayer && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleDeleteComment(item.id)}
                disabled={isProcessing}
                data-testid={`button-delete-${item.id}`}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {isProcessing ? "..." : "Delete"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  // =============================================
  // RENDER: Prayer Request card (from Prayer.tsx)
  // =============================================
  const renderPrayerCard = (prayer: PrayerWithSubmitter) => {
    const isProcessing = processingId === prayer.id;
    const status = prayerStatus;

    return (
      <Card key={prayer.id} data-testid={`card-prayer-${prayer.id}`}>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <CardTitle className="text-lg">{prayer.title}</CardTitle>
              <CardDescription className="mt-1">
                {prayer.church?.name} &bull; {new Date(prayer.created_at).toLocaleDateString()}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {prayer.answered_at && (
                <Badge variant="default" className="bg-yellow-500 hover:bg-yellow-600">
                  <PartyPopper className="h-3 w-3 mr-1" />
                  Answered
                </Badge>
              )}
              <Badge variant={
                status === 'approved' ? 'default' :
                status === 'pending' ? 'secondary' :
                status === 'answered' ? 'default' :
                'outline'
              }>
                {status === 'answered' ? 'approved' : status}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm mb-4 line-clamp-3">{prayer.body}</p>

          {prayer.answered_at && prayer.answered_note && (
            <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
              <p className="text-xs font-medium text-yellow-800 dark:text-yellow-200 mb-1 flex items-center gap-1">
                <PartyPopper className="h-3 w-3" />
                Testimony / Answer Note
              </p>
              <p className="text-sm text-yellow-900 dark:text-yellow-100">{prayer.answered_note}</p>
            </div>
          )}

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs text-muted-foreground">
              {prayer.is_anonymous ? (
                <span>Anonymous request</span>
              ) : prayer.display_first_name ? (
                <span>From: {prayer.display_first_name} {prayer.display_last_initial}.</span>
              ) : (
                <span>Submitted by user</span>
              )}
            </div>

            {status === 'pending' && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handlePrayerAction(prayer.id, 'approved')}
                  disabled={isProcessing}
                  data-testid={`button-approve-${prayer.id}`}
                >
                  <Check className="h-4 w-4 mr-1" />
                  {isProcessing ? "Processing..." : "Approve"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handlePrayerAction(prayer.id, 'rejected')}
                  disabled={isProcessing}
                  data-testid={`button-reject-${prayer.id}`}
                >
                  <X className="h-4 w-4 mr-1" />
                  {isProcessing ? "Processing..." : "Reject"}
                </Button>
              </div>
            )}

            {status === 'approved' && !prayer.answered_at && (
              <div className="flex gap-2">
                <MarkAnsweredDialog
                  prayerId={prayer.id}
                  prayerTitle={prayer.title}
                  onMarkAnswered={handleMarkAnswered}
                  isProcessing={isProcessing}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handlePrayerAction(prayer.id, 'archived')}
                  disabled={isProcessing}
                  data-testid={`button-archive-${prayer.id}`}
                >
                  <Archive className="h-4 w-4 mr-1" />
                  {isProcessing ? "Processing..." : "Archive"}
                </Button>
              </div>
            )}

            {status === 'approved' && prayer.answered_at && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleUnmarkAnswered(prayer.id)}
                  disabled={isProcessing}
                  data-testid={`button-unmark-answered-${prayer.id}`}
                >
                  <Undo2 className="h-4 w-4 mr-1" />
                  {isProcessing ? "Processing..." : "Unmark Answered"}
                </Button>
              </div>
            )}

            {status === 'answered' && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleUnmarkAnswered(prayer.id)}
                  disabled={isProcessing}
                  data-testid={`button-unmark-answered-${prayer.id}`}
                >
                  <Undo2 className="h-4 w-4 mr-1" />
                  {isProcessing ? "Processing..." : "Unmark Answered"}
                </Button>
              </div>
            )}

            {status === 'rejected' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handlePrayerAction(prayer.id, 'archived')}
                disabled={isProcessing}
                data-testid={`button-archive-${prayer.id}`}
              >
                <Archive className="h-4 w-4 mr-1" />
                {isProcessing ? "Processing..." : "Archive"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  // =============================================
  // RENDER: Loading skeleton
  // =============================================
  const renderSkeleton = () => (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <Skeleton key={i} className="h-40 w-full" />
      ))}
    </div>
  );

  // =============================================
  // RENDER: Empty state
  // =============================================
  const renderEmpty = (message: string) => (
    <div className="text-center py-12 text-muted-foreground">
      {message}
    </div>
  );

  // =============================================
  // TAB CONTENT: Review Queue
  // =============================================
  const renderReviewQueue = () => (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap gap-2">
        {[
          { value: "all", label: "All" },
          { value: "prayers", label: "Prayers" },
          { value: "comments", label: "Comments" },
        ].map((opt) => (
          <Button
            key={opt.value}
            variant={reviewTypeFilter === opt.value ? "default" : "outline"}
            size="sm"
            onClick={() => setReviewTypeFilter(opt.value)}
            data-testid={`button-review-filter-${opt.value}`}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {reviewLoading
        ? renderSkeleton()
        : (reviewData?.items || []).length === 0
        ? renderEmpty("No pending items to review")
        : (
          <div className="space-y-4">
            {(reviewData?.items || []).map(renderModerationItem)}
          </div>
        )}
    </div>
  );

  // =============================================
  // TAB CONTENT: Prayer Requests
  // =============================================
  const renderPrayerRequests = () => (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap gap-2">
        {[
          { value: "pending", label: "Pending" },
          { value: "approved", label: "Approved" },
          { value: "answered", label: "Answered" },
          { value: "rejected", label: "Rejected" },
          { value: "archived", label: "Archived" },
        ].map((opt) => (
          <Button
            key={opt.value}
            variant={prayerStatus === opt.value ? "default" : "outline"}
            size="sm"
            onClick={() => setPrayerStatus(opt.value)}
            data-testid={`button-prayer-status-${opt.value}`}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {prayersLoading
        ? renderSkeleton()
        : (prayers || []).length === 0
        ? renderEmpty(`No ${prayerStatus} prayer requests`)
        : (
          <div className="space-y-4">
            {(prayers || []).map(renderPrayerCard)}
          </div>
        )}
    </div>
  );

  // =============================================
  // TAB CONTENT: Comments
  // =============================================
  const renderComments = () => {
    const commentItems = (commentsData?.items || []);
    return (
      <div className="mt-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          {[
            { value: "pending", label: "Pending" },
            { value: "published", label: "Published" },
            { value: "rejected", label: "Rejected" },
          ].map((opt) => (
            <Button
              key={opt.value}
              variant={commentStatus === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setCommentStatus(opt.value)}
              data-testid={`button-comment-status-${opt.value}`}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        {commentsLoading
          ? renderSkeleton()
          : commentItems.length === 0
          ? renderEmpty(`No ${commentStatus} comments`)
          : (
            <div className="space-y-4">
              {commentItems.map(renderModerationItem)}
            </div>
          )}
      </div>
    );
  };

  // =============================================
  // TAB CONTENT: Create Prayer
  // =============================================
  const renderCreatePrayer = () => (
    <div className="mt-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Platform or Regional Prayer</CardTitle>
          <CardDescription>
            Create a prayer request that will be visible platform-wide or in a specific region
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreatePrayer} className="space-y-6">
            {/* Prayer Type Selection */}
            <div className="space-y-3">
              <Label>Prayer Type</Label>
              <RadioGroup value={prayerType} onValueChange={(value: any) => setPrayerType(value)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="platform" id="platform" data-testid="radio-platform" />
                  <Label htmlFor="platform" className="font-normal cursor-pointer">
                    Platform Wide (visible across {platform?.name || "this platform"})
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="regional" id="regional" data-testid="radio-regional" />
                  <Label htmlFor="regional" className="font-normal cursor-pointer">
                    Location Based (visible in a specific area)
                  </Label>
                </div>
                {isSuperAdmin && (
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="all_platforms" id="all_platforms" data-testid="radio-all-platforms" />
                    <Label htmlFor="all_platforms" className="font-normal cursor-pointer">
                      All Platforms (visible everywhere - super admin only)
                    </Label>
                  </div>
                )}
              </RadioGroup>
            </div>

            {/* Regional Options */}
            {prayerType === "regional" && (
              <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                <div className="space-y-2">
                  <Label htmlFor="region-type">Area Type</Label>
                  <Select
                    value={regionType}
                    onValueChange={(value) => {
                      setRegionType(value);
                      setRegionId("");
                      setBoundarySearch("");
                      setSelectedBoundaryName("");
                    }}
                  >
                    <SelectTrigger id="region-type" data-testid="select-region-type">
                      <SelectValue placeholder="Select area type" />
                    </SelectTrigger>
                    <SelectContent>
                      {platformRegions && platformRegions.length > 0 && (
                        <SelectItem value="platform_region">Region</SelectItem>
                      )}
                      <SelectItem value="place">City/Place</SelectItem>
                      <SelectItem value="county">County</SelectItem>
                      <SelectItem value="zip">ZIP Code</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {regionType === "platform_region" && platformRegions && platformRegions.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="platform-region">Select Region</Label>
                    <Select
                      value={regionId}
                      onValueChange={(value) => {
                        setRegionId(value);
                        const selectedRegion = platformRegions.find(r => r.id === value);
                        setSelectedBoundaryName(selectedRegion?.name || "");
                      }}
                    >
                      <SelectTrigger id="platform-region" data-testid="select-platform-region">
                        <SelectValue placeholder="Select a region" />
                      </SelectTrigger>
                      <SelectContent>
                        {platformRegions.map((region) => (
                          <SelectItem key={region.id} value={region.id}>
                            {region.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {regionId && selectedBoundaryName && (
                      <p className="text-sm font-medium text-green-600">
                        Selected: {selectedBoundaryName}
                      </p>
                    )}
                  </div>
                )}

                {regionType && regionType !== "platform_region" && (
                  <div className="space-y-2">
                    <Label htmlFor="boundary-search">Search Boundary</Label>
                    <Input
                      id="boundary-search"
                      type="text"
                      placeholder="Type to search (e.g., Grand Rapids)"
                      value={boundarySearch}
                      onChange={(e) => setBoundarySearch(e.target.value)}
                      data-testid="input-boundary-search"
                    />
                    {boundarySearch.length >= 2 && boundaries && boundaries.length > 0 && (
                      <div className="border rounded-md max-h-48 overflow-y-auto">
                        {boundaries.map((boundary: any) => (
                          <button
                            key={boundary.external_id}
                            type="button"
                            onClick={() => {
                              setRegionId(boundary.external_id);
                              setSelectedBoundaryName(boundary.name);
                              setBoundarySearch("");
                            }}
                            className={`w-full text-left px-3 py-2 hover:bg-accent transition-colors ${
                              regionId === boundary.external_id ? 'bg-accent' : ''
                            }`}
                            data-testid={`boundary-option-${boundary.external_id}`}
                          >
                            <div className="font-medium">{boundary.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {boundary.external_id} &bull; {boundary.type}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {boundarySearch.length >= 2 && !boundariesLoading && boundaries && boundaries.length === 0 && (
                      <p className="text-sm text-muted-foreground">No boundaries found. Try a different search term.</p>
                    )}
                    {boundariesLoading && (
                      <p className="text-sm text-muted-foreground">Searching...</p>
                    )}
                    {regionId && selectedBoundaryName && (
                      <p className="text-sm font-medium text-green-600">
                        Selected: {selectedBoundaryName}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Type at least 2 characters to search for boundaries
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Pray for..."
                required
                maxLength={200}
                data-testid="input-title"
              />
            </div>

            {/* Body */}
            <div className="space-y-2">
              <Label htmlFor="body">
                Prayer Request <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Describe the prayer request..."
                required
                maxLength={2000}
                rows={6}
                data-testid="textarea-body"
              />
            </div>

            {/* Submitter Name */}
            <div className="space-y-2">
              <Label htmlFor="submitter-name">Submitter Name (optional)</Label>
              <Input
                id="submitter-name"
                value={submitterName}
                onChange={(e) => setSubmitterName(e.target.value)}
                placeholder="e.g., John Smith"
                data-testid="input-submitter-name"
              />
              <p className="text-xs text-muted-foreground">
                If provided, will be displayed as "First Name L." (e.g., "John S.")
              </p>
            </div>

            {/* Submit */}
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={createPrayerMutation.isPending}
                data-testid="button-create-prayer"
              >
                {createPrayerMutation.isPending ? "Creating..." : "Create Prayer"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );

  // =============================================
  // MAIN RENDER
  // =============================================
  const pendingTotal = pendingCounts?.counts?.total || 0;

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Prayer & Moderation</h1>
          <p className="text-muted-foreground mt-2">
            Review prayers, prayer requests, and guest comments in one place
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="review" data-testid="tab-review">
              <ClipboardList className="h-4 w-4 mr-1" />
              Review Queue
              {pendingTotal > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {pendingTotal}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="prayers" data-testid="tab-prayers">
              <Heart className="h-4 w-4 mr-1" />
              Prayer Requests
            </TabsTrigger>
            <TabsTrigger value="comments" data-testid="tab-comments">
              <MessageSquare className="h-4 w-4 mr-1" />
              Comments
            </TabsTrigger>
            <TabsTrigger value="create" data-testid="tab-create">
              <Plus className="h-4 w-4 mr-1" />
              Create Prayer
            </TabsTrigger>
          </TabsList>

          <TabsContent value="review">
            {renderReviewQueue()}
          </TabsContent>

          <TabsContent value="prayers">
            {renderPrayerRequests()}
          </TabsContent>

          <TabsContent value="comments">
            {renderComments()}
          </TabsContent>

          <TabsContent value="create">
            {renderCreatePrayer()}
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
