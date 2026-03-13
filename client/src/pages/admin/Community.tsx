import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Eye, Globe } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import type { PostWithDetails, PostComment } from "@shared/schema";

export default function AdminCommunity() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("posts");
  const [selectedPlatformId, setSelectedPlatformId] = useState<string | null>(null);
  
  const { isSuperAdmin, userPlatforms, isLoading: accessLoading } = useAdminAccess();
  
  // Show platform selector if user is super admin or has access to multiple platforms
  const showPlatformSelector = isSuperAdmin || userPlatforms.length > 1;

  // Build query params for posts API
  const postsQueryParams = selectedPlatformId 
    ? `?city_platform_id=${selectedPlatformId}` 
    : '';

  const { data: posts, isLoading: postsLoading } = useQuery<PostWithDetails[]>({
    queryKey: ["/api/admin/posts", { cityPlatformId: selectedPlatformId }],
    queryFn: async () => {
      const res = await fetch(`/api/admin/posts${postsQueryParams}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch posts');
      return res.json();
    },
  });

  const { data: comments, isLoading: commentsLoading } = useQuery<PostComment[]>({
    queryKey: ["/api/admin/comments", { cityPlatformId: selectedPlatformId }],
    queryFn: async () => {
      const queryParams = selectedPlatformId 
        ? `?city_platform_id=${selectedPlatformId}` 
        : '';
      const res = await fetch(`/api/admin/comments${queryParams}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch comments');
      return res.json();
    },
  });

  const updatePostMutation = useMutation({
    mutationFn: async ({ postId, status }: { postId: string; status: string }) => {
      return apiRequest("PATCH", `/api/admin/posts/${postId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/posts", { cityPlatformId: selectedPlatformId }] });
      toast({
        title: "Success",
        description: "Post status updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update post",
        variant: "destructive",
      });
    },
  });

  const updateCommentMutation = useMutation({
    mutationFn: async ({ commentId, status }: { commentId: string; status: string }) => {
      return apiRequest("PATCH", `/api/admin/comments/${commentId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/comments", { cityPlatformId: selectedPlatformId }] });
      toast({
        title: "Success",
        description: "Comment status updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update comment",
        variant: "destructive",
      });
    },
  });

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold" data-testid="text-page-title">Community Moderation</h1>
              <p className="text-muted-foreground mt-2">
                Manage community posts and comments
              </p>
            </div>
            
            {showPlatformSelector && (
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <Select
                  value={selectedPlatformId || "all"}
                  onValueChange={(value) => setSelectedPlatformId(value === "all" ? null : value)}
                >
                  <SelectTrigger className="w-[200px]" data-testid="select-platform">
                    <SelectValue placeholder="Filter by platform" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" data-testid="option-platform-all">
                      All Platforms
                    </SelectItem>
                    {userPlatforms.map((platform) => (
                      <SelectItem 
                        key={platform.platform_id} 
                        value={platform.platform_id}
                        data-testid={`option-platform-${platform.platform_id}`}
                      >
                        {platform.platform_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="posts" data-testid="tab-posts">
              Posts
              {posts && (
                <Badge variant="secondary" className="ml-2">
                  {posts.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="comments" data-testid="tab-comments">
              Comments
              {comments && (
                <Badge variant="secondary" className="ml-2">
                  {comments.filter(c => c.status === 'published').length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="posts" className="mt-6">
            {postsLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {posts && posts.length > 0 ? (
                  posts.map((post) => (
                    <Card key={post.id} data-testid={`card-post-${post.id}`}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <CardTitle className="text-lg">{post.title}</CardTitle>
                            <CardDescription className="mt-1">
                              {post.author?.full_name || "Unknown"} • {new Date(post.created_at).toLocaleDateString()}
                            </CardDescription>
                          </div>
                          <Badge variant={post.status === 'published' ? 'default' : 'secondary'}>
                            {post.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm mb-4 line-clamp-2">{post.body}</p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            asChild
                            data-testid={`button-view-post-${post.id}`}
                          >
                            <a href={`/community/${post.id}`} target="_blank">
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </a>
                          </Button>
                          {post.status === 'published' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updatePostMutation.mutate({ postId: post.id, status: 'removed' })}
                              disabled={updatePostMutation.isPending}
                              data-testid={`button-remove-post-${post.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Remove
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    No posts found
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="comments" className="mt-6">
            {commentsLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {comments && comments.length > 0 ? (
                  comments.map((comment) => (
                    <Card key={comment.id} data-testid={`card-comment-${comment.id}`}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                          <CardDescription>
                            Comment on post • {new Date(comment.created_at).toLocaleDateString()}
                          </CardDescription>
                          <Badge variant={comment.status === 'published' ? 'default' : 'secondary'}>
                            {comment.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm mb-4">{comment.body}</p>
                        <div className="flex gap-2">
                          {comment.status === 'published' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateCommentMutation.mutate({ commentId: comment.id, status: 'removed' })}
                              disabled={updateCommentMutation.isPending}
                              data-testid={`button-remove-comment-${comment.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Remove
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    No comments found
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
