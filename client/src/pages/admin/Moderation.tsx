import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, Trash2, Heart, MessageSquare, ExternalLink, PartyPopper, Archive } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { supabase } from "../../../../lib/supabaseClient";
import { Link } from "wouter";
import { MarkAnsweredDialog } from "@/components/MarkAnsweredDialog";

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

export default function AdminModeration() {
  const { toast } = useToast();
  const [activeType, setActiveType] = useState("all");
  const [activeStatus, setActiveStatus] = useState("pending");
  const [processingId, setProcessingId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<ModerationResponse>({
    queryKey: ["/api/admin/moderation", activeType, activeStatus],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      
      const response = await fetch(
        `/api/admin/moderation?type=${activeType}&status=${activeStatus}`,
        { headers, credentials: "include" }
      );
      
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`${response.status}: ${text}`);
      }
      
      return response.json();
    },
  });

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

  const updatePrayerMutation = useMutation({
    mutationFn: async ({ prayerId, status }: { prayerId: string; status: string }) => {
      setProcessingId(prayerId);
      return apiRequest("PATCH", `/api/admin/prayers/${prayerId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/moderation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prayers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard/stats"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/moderation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/comments"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/moderation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/comments"] });
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
        answered_note: note || null
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/moderation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/prayers"] });
      setProcessingId(null);
      toast({ title: "Prayer Answered!", description: "Prayer has been marked as answered" });
    },
    onError: (error: Error) => {
      setProcessingId(null);
      toast({ title: "Error", description: error.message || "Failed to mark prayer as answered", variant: "destructive" });
    },
  });

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

  const renderItem = (item: ModerationItem) => {
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
                <span className="text-muted-foreground">•</span>
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

  const renderList = () => {
    if (isLoading) {
      return (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      );
    }

    const items = data?.items || [];

    if (items.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          No {activeStatus} items found
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {items.map(renderItem)}
      </div>
    );
  };

  const statusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'published', label: 'Published/Approved' },
    { value: 'rejected', label: 'Rejected' },
    ...(activeType === 'prayers' || activeType === 'all' ? [{ value: 'answered', label: 'Answered' }] : []),
    ...(activeType === 'prayers' || activeType === 'all' ? [{ value: 'archived', label: 'Archived' }] : []),
  ];

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Unified Moderation</h1>
          <p className="text-muted-foreground mt-2">
            Review and moderate prayer requests and guest comments in one place
          </p>
        </div>

        <Tabs value={activeType} onValueChange={setActiveType}>
          <TabsList data-testid="tabs-type">
            <TabsTrigger value="all" data-testid="tab-all">
              All
              {pendingCounts && pendingCounts.counts.total > 0 && activeStatus === 'pending' && (
                <Badge variant="secondary" className="ml-2">
                  {pendingCounts.counts.total}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="prayers" data-testid="tab-prayers">
              <Heart className="h-4 w-4 mr-1" />
              Prayers
              {pendingCounts && pendingCounts.counts.prayers > 0 && activeStatus === 'pending' && (
                <Badge variant="secondary" className="ml-2">
                  {pendingCounts.counts.prayers}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="comments" data-testid="tab-comments">
              <MessageSquare className="h-4 w-4 mr-1" />
              Comments
              {pendingCounts && pendingCounts.counts.comments > 0 && activeStatus === 'pending' && (
                <Badge variant="secondary" className="ml-2">
                  {pendingCounts.counts.comments}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap gap-2 mt-6 mb-6">
          {statusOptions.map((option) => (
            <Button
              key={option.value}
              variant={activeStatus === option.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveStatus(option.value)}
              data-testid={`button-status-${option.value}`}
            >
              {option.label}
            </Button>
          ))}
        </div>

        {renderList()}
      </div>
    </AdminLayout>
  );
}
