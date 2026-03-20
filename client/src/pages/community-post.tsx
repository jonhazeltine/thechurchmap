import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ChurchProfileCard } from "@/components/ChurchProfileCard";
import { RichTextEditor } from "@/components/RichTextEditor";
import { MediaGrid } from "@/components/MediaGrid";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformContext } from "@/contexts/PlatformContext";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type PostWithDetails, type PostCommentWithAuthor, type Church } from "@shared/schema";
import { ArrowLeft, MessageSquare, Send, Pencil, X, Check, Hand, MoreHorizontal, Trash2, Building2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { formatDistanceToNow } from "date-fns";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { SetPrayerPostDialog } from "@/components/SetPrayerPostDialog";
import { AddChurchPrayerSection } from "@/components/AddChurchPrayerSection";
import { GuestCommentModal } from "@/components/GuestCommentModal";
import { ReactionsBar } from "@/components/ReactionsBar";

export default function CommunityPost() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const { platformId, platform } = usePlatformContext();
  const { isSuperAdmin, isPlatformAdmin, churchAdminChurchIds } = useAdminAccess();
  const { getMapUrl, getCommunityUrl, getChurchUrl } = usePlatformNavigation();
  const [commentBody, setCommentBody] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editRichBody, setEditRichBody] = useState<any>(null);
  const [showSetPrayerPostDialog, setShowSetPrayerPostDialog] = useState(false);
  const [showDeletePostDialog, setShowDeletePostDialog] = useState(false);
  const [showDeleteCommentDialog, setShowDeleteCommentDialog] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<string | null>(null);
  const [showGuestCommentModal, setShowGuestCommentModal] = useState(false);
  const hasAutoStartedEdit = useRef(false);

  const handleMentionClick = useCallback((id: string, type: 'user' | 'church') => {
    if (type === 'church') {
      setLocation(getChurchUrl(id));
    }
  }, [setLocation, getChurchUrl]);

  // Use the navigation hook which now returns the cleaner platform URL
  const communityLink = getCommunityUrl();

  // Build the API URL - the platform parameter is optional for post detail
  // since the post ID is globally unique
  const postApiUrl = `/api/posts/${id}`;

  const { data: post, isLoading: isLoadingPost, isError: isPostError } = useQuery<PostWithDetails>({
    queryKey: [postApiUrl],
    enabled: !!id, // Only run query when id is available
  });

  // Check for ?edit=true query param and auto-start editing
  useEffect(() => {
    if (post && !hasAutoStartedEdit.current) {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('edit') === 'true') {
        hasAutoStartedEdit.current = true;
        // Auto-start editing - use startEditing logic to convert plain text if needed
        setEditTitle(post.title || "");
        setEditBody(post.body);
        if (post.body_format === 'rich_text_json' && post.rich_body) {
          setEditRichBody(post.rich_body);
        } else {
          // Convert plain text to TipTap JSON format for editing
          const paragraphs = (post.body || "").split('\n').filter(p => p.trim());
          setEditRichBody({
            type: 'doc',
            content: paragraphs.length > 0 
              ? paragraphs.map(text => ({
                  type: 'paragraph',
                  content: [{ type: 'text', text }]
                }))
              : [{ type: 'paragraph', content: [] }]
          });
        }
        setIsEditing(true);
        // Clear the edit param from URL without triggering navigation
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
      }
    }
  }, [post]);

  // Build comments API URL
  const commentsApiUrl = `/api/posts/${id}/comments`;
  
  const { data: comments, isLoading: isLoadingComments, isError: isCommentsError } = useQuery<PostCommentWithAuthor[]>({
    queryKey: [commentsApiUrl],
    enabled: !!id, // Only run query when id is available
  });

  const createCommentMutation = useMutation({
    mutationFn: async (data: { body: string; guest_name?: string; guest_full_name?: string }) => {
      return apiRequest("POST", commentsApiUrl, data);
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: [commentsApiUrl] });
      queryClient.invalidateQueries({ queryKey: [postApiUrl] });
      setCommentBody("");
      
      if (response?.pending) {
        toast({
          title: post?.post_type === 'prayer_post' ? "Prayer submitted" : "Comment submitted",
          description: "Your submission will appear once it's approved.",
        });
      } else {
        toast({
          title: post?.post_type === 'prayer_post' ? "Prayer posted" : "Comment posted",
          description: "Your submission has been added.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCommentSubmit = () => {
    if (!commentBody.trim()) return;
    
    if (!user) {
      setShowGuestCommentModal(true);
      return;
    }
    
    createCommentMutation.mutate({ body: commentBody });
  };

  const handleGuestCommentSubmit = async (guestName: string, fullName: string) => {
    const response = await createCommentMutation.mutateAsync({ 
      body: commentBody, 
      guest_name: guestName,
      guest_full_name: fullName,
    });
    // Return response so GuestCommentModal can store the token
    // Modal stays open to show success state - user can close it when ready
    return response;
  };

  const updatePostMutation = useMutation({
    mutationFn: async (data: { title?: string; body: string; bodyFormat?: string; richBody?: any }) => {
      return apiRequest("PATCH", `/api/posts/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [postApiUrl] });
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0]?.toString().startsWith('/api/posts') });
      setIsEditing(false);
      toast({
        title: "Post updated",
        description: "Your changes have been saved.",
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

  const deletePostMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/posts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0]?.toString().startsWith('/api/posts') });
      toast({
        title: "Post deleted",
        description: "The post has been removed.",
      });
      setLocation(communityLink);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      return apiRequest("DELETE", `/api/comments/${commentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [commentsApiUrl] });
      queryClient.invalidateQueries({ queryKey: [postApiUrl] });
      setShowDeleteCommentDialog(false);
      setCommentToDelete(null);
      toast({
        title: "Comment deleted",
        description: "The comment has been removed.",
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

  const handleViewOnMap = (church: Church) => {
    setLocation(getMapUrl({ church: church.id }));
  };

  const isRichText = post?.body_format === 'rich_text_json';

  const startEditing = () => {
    if (post) {
      setEditTitle(post.title || "");
      setEditBody(post.body);
      if (isRichText && post.rich_body) {
        setEditRichBody(post.rich_body);
      } else {
        // Convert plain text to TipTap JSON format for editing
        // This allows slash commands to work even for plain text posts
        const paragraphs = (post.body || "").split('\n').filter(p => p.trim());
        setEditRichBody({
          type: 'doc',
          content: paragraphs.length > 0 
            ? paragraphs.map(text => ({
                type: 'paragraph',
                content: [{ type: 'text', text }]
              }))
            : [{ type: 'paragraph', content: [] }]
        });
      }
      setIsEditing(true);
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditTitle("");
    setEditBody("");
    setEditRichBody(null);
  };

  const extractPlainText = (richContent: any): string => {
    if (!richContent) return "";
    
    const lines: string[] = [];
    
    const extractInlineText = (node: any): string => {
      if (!node) return "";
      if (node.type === 'text') return node.text || "";
      if (node.type === 'hardBreak') return "\n";
      if (node.content && Array.isArray(node.content)) {
        return node.content.map(extractInlineText).join('');
      }
      return "";
    };
    
    const processNode = (node: any, prefix: string = "", listIndex: number = 0): void => {
      if (!node) return;
      
      switch (node.type) {
        case 'paragraph':
        case 'heading': {
          const text = extractInlineText(node);
          if (text) lines.push(prefix + text);
          break;
        }
        case 'bulletList': {
          if (node.content) {
            node.content.forEach((item: any) => processNode(item, "• "));
          }
          break;
        }
        case 'orderedList': {
          if (node.content) {
            node.content.forEach((item: any, i: number) => processNode(item, `${i + 1}. `, i));
          }
          break;
        }
        case 'listItem': {
          if (node.content) {
            node.content.forEach((child: any, i: number) => {
              if (child.type === 'paragraph') {
                const text = extractInlineText(child);
                if (text) lines.push((i === 0 ? prefix : "  ") + text);
              } else {
                processNode(child, "  ");
              }
            });
          }
          break;
        }
        case 'blockquote': {
          if (node.content) {
            node.content.forEach((child: any) => processNode(child, "> "));
          }
          break;
        }
        case 'codeBlock': {
          const text = extractInlineText(node);
          if (text) lines.push(text);
          break;
        }
        default: {
          if (node.content && Array.isArray(node.content)) {
            node.content.forEach((child: any) => processNode(child, prefix));
          }
          break;
        }
      }
    };
    
    if (richContent.content && Array.isArray(richContent.content)) {
      richContent.content.forEach((node: any) => processNode(node));
    }
    
    return lines.join('\n').trim();
  };

  const saveEdit = () => {
    // Always use rich text format now since we always use RichTextEditor when editing
    if (!editRichBody) {
      toast({
        title: "Error",
        description: "Post body cannot be empty.",
        variant: "destructive",
      });
      return;
    }
    const plainText = extractPlainText(editRichBody);
    if (!plainText) {
      toast({
        title: "Error",
        description: "Post body cannot be empty.",
        variant: "destructive",
      });
      return;
    }
    updatePostMutation.mutate({
      title: editTitle.trim() || undefined,
      body: plainText,
      bodyFormat: 'rich_text_json',
      richBody: editRichBody,
    });
  };

  // Check if current user can edit this post
  // For prayer posts: only church admins for that church, platform admins, or super admins can edit
  // For other posts: author, platform admins, or super admins can edit
  const isChurchAdminForPost = post?.linked_church?.id 
    ? churchAdminChurchIds.includes(post.linked_church.id) 
    : false;
  
  const canEdit = post && user && (
    isSuperAdmin || 
    isPlatformAdmin ||
    (post.post_type === 'prayer_post' ? isChurchAdminForPost : post.author_id === user.id)
  );

  if (isLoadingPost) {
    return (
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <Skeleton className="h-8 w-32 mb-6" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isPostError) {
    return (
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <Card>
          <CardContent className="py-12 text-center">
            <h3 className="text-lg font-semibold mb-2">Unable to load post</h3>
            <p className="text-muted-foreground mb-4">
              We encountered an error loading this post. Please try again.
            </p>
            <Button asChild>
              <Link href={communityLink}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Community
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <Card>
          <CardContent className="py-12 text-center">
            <h3 className="text-lg font-semibold mb-2">Post not found</h3>
            <p className="text-muted-foreground mb-4">
              This post may have been removed or doesn't exist.
            </p>
            <Button asChild>
              <Link href={communityLink}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Community
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <Button
        variant="ghost"
        size="sm"
        asChild
        className="mb-6"
        data-testid="button-back"
      >
        <Link href={communityLink}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Community
        </Link>
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card data-testid="card-post-detail">
            {/* Prayer post header - "Prayer Card: Church Name" */}
            {post.post_type === 'prayer_post' && post.linked_church && (
              <div className="px-6 py-3 bg-gradient-to-r from-amber-50/60 to-amber-50/30 dark:from-amber-950/25 dark:to-amber-950/10 border-b border-amber-200/40 dark:border-amber-800/30 rounded-t-lg">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 rounded-full bg-amber-400/70 dark:bg-amber-500/50" />
                  <Building2 className="w-5 h-5 text-amber-600/80 dark:text-amber-400/70" />
                  <Link href={`/?church=${post.linked_church.id}`}>
                    <span className="font-bold text-lg text-foreground hover:underline" data-testid="link-church-prayer">
                      Prayer Card: {post.linked_church.name}
                    </span>
                  </Link>
                </div>
              </div>
            )}
            <CardHeader className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  {isEditing ? (
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Post title (optional)"
                      className="text-xl font-bold"
                      data-testid="input-edit-title"
                    />
                  ) : post.post_type === 'prayer_post' && post.linked_church ? (
                    <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-post-title">
                      Add your prayers and encouragement for {post.linked_church.name} in the comments
                    </p>
                  ) : (
                    post.title && (
                      <h1 className="text-2xl font-bold" data-testid="text-post-title">
                        {post.title}
                      </h1>
                    )
                  )}
                </div>
                {canEdit && !isEditing && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" data-testid="button-post-menu">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {(isSuperAdmin || isPlatformAdmin) && post.post_type !== 'prayer_post' && (
                        <DropdownMenuItem 
                          onClick={() => setShowSetPrayerPostDialog(true)}
                          data-testid="button-set-prayer-post"
                        >
                          <Hand className="w-4 h-4 mr-2 text-amber-500" />
                          Set as Prayer Post
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={startEditing} data-testid="button-edit-post">
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit Post
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-destructive focus:text-destructive"
                        onClick={() => setShowDeletePostDialog(true)}
                        data-testid="button-delete-post"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Post
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {isEditing && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={cancelEditing}
                      disabled={updatePostMutation.isPending}
                      data-testid="button-cancel-edit"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="default"
                      size="icon"
                      onClick={saveEdit}
                      disabled={updatePostMutation.isPending}
                      data-testid="button-save-edit"
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {/* Prayer posts show platform attribution, regular posts show user */}
                <span data-testid="text-author-name">
                  {post.post_type === 'prayer_post' 
                    ? (post.platform?.name || post.linked_church?.name || "Community")
                    : (post.author?.full_name || post.author?.first_name || "Community Member")}
                </span>
                <span>•</span>
                <span data-testid="text-post-date">
                  {post.created_at ? formatDistanceToNow(new Date(post.created_at), { addSuffix: true }) : 'Recently'}
                </span>
                {post.updated_at && post.updated_at !== post.created_at && (
                  <>
                    <span>•</span>
                    <span className="italic" data-testid="text-post-edited">
                      edited {post.updated_at ? formatDistanceToNow(new Date(post.updated_at), { addSuffix: true }) : ''}
                    </span>
                  </>
                )}
              </div>
            </CardHeader>

            {(post.media_urls && post.media_urls.length > 0) ? (
              <div className="px-6 pb-4">
                <MediaGrid urls={post.media_urls} postId={post.id} />
              </div>
            ) : post.media_url && post.media_type === 'image' ? (
              <div className="px-6 pb-4">
                <img
                  src={post.media_url}
                  alt={post.title || "Post image"}
                  className="w-full h-auto rounded-md"
                  data-testid="img-post-media"
                />
              </div>
            ) : post.media_url && post.media_type === 'video' ? (
              <div className="px-6 pb-4">
                <video
                  src={post.media_url}
                  controls
                  className="w-full max-h-96 rounded-xl"
                  data-testid="video-post-media"
                >
                  Your browser does not support the video tag.
                </video>
              </div>
            ) : null}

            <CardContent className="space-y-4">
              {isEditing ? (
                <div data-testid="editor-edit-body">
                  <RichTextEditor
                    content={editRichBody}
                    onChange={setEditRichBody}
                    placeholder="Write your post..."
                    editable={true}
                    platformId={platformId || undefined}
                  />
                </div>
              ) : (
                isRichText && post.rich_body ? (
                  <div data-testid="text-post-body-rich">
                    <RichTextEditor
                      content={post.rich_body}
                      onChange={() => {}}
                      editable={false}
                      onMentionClick={handleMentionClick}
                    />
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap" data-testid="text-post-body">
                    {post.body}
                  </p>
                )
              )}
            </CardContent>
          </Card>

          {/* Mobile-visible prayer request section for prayer posts */}
          {post.post_type === 'prayer_post' && canEdit && post.linked_church && (
            <div className="lg:hidden" data-testid="mobile-church-prayer-section">
              <AddChurchPrayerSection
                churchId={post.linked_church.id}
                churchName={post.linked_church.name}
                cityPlatformId={platform?.id}
              />
            </div>
          )}

          <Card data-testid="card-comments">
            <CardHeader>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                {post.post_type === 'prayer_post' 
                  ? `Prayers & Encouragements (${comments?.length || 0})`
                  : `Comments (${comments?.length || 0})`}
              </h2>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingComments ? (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  ))}
                </div>
              ) : comments && comments.length > 0 ? (
                <div className="space-y-4">
                  <Separator />
                  {comments.map((comment) => {
                    const canDeleteComment = user && (
                      comment.author_id === user.id || isSuperAdmin || isPlatformAdmin
                    );
                    return (
                      <div key={comment.id} className="space-y-2" data-testid={`comment-${comment.id}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium" data-testid="text-comment-author">
                              {comment.author?.full_name || comment.guest_name || "Anonymous"}
                            </span>
                            <span className="text-muted-foreground" data-testid="text-comment-date">
                              {comment.created_at ? formatDistanceToNow(new Date(comment.created_at), { addSuffix: true }) : ''}
                            </span>
                          </div>
                          {canDeleteComment && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => {
                                setCommentToDelete(comment.id);
                                setShowDeleteCommentDialog(true);
                              }}
                              data-testid={`button-delete-comment-${comment.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                        <p className="text-sm whitespace-pre-wrap" data-testid="text-comment-body">
                          {comment.body}
                        </p>
                        <div className="mt-2">
                          <ReactionsBar 
                            commentId={comment.id} 
                            initialCounts={comment.reaction_counts}
                            initialUserReactions={comment.user_reactions}
                            compact={true}
                          />
                        </div>
                        <Separator className="mt-3" />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">
                    {post.post_type === 'prayer_post' 
                      ? "No prayers yet. Be the first to pray!" 
                      : "No comments yet. Be the first to comment!"}
                  </p>
                </div>
              )}

              <Separator />
              <div className="space-y-2">
                <Textarea
                  placeholder={post.post_type === 'prayer_post' 
                    ? "Share a prayer or encouragement..." 
                    : "Write a comment..."}
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  rows={3}
                  data-testid="textarea-comment"
                />
                <Button
                  onClick={handleCommentSubmit}
                  disabled={!commentBody.trim() || createCommentMutation.isPending}
                  data-testid="button-submit-comment"
                >
                  <Send className="w-4 h-4 mr-2" />
                  {createCommentMutation.isPending 
                    ? "Posting..." 
                    : post.post_type === 'prayer_post' 
                      ? "Add Prayer" 
                      : "Post Comment"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Show linked_church for prayer posts, otherwise show regular church */}
        {(post.post_type === 'prayer_post' ? post.linked_church : post.church) && (
          <div className="lg:col-span-1">
            <div className="sticky top-4 space-y-6 max-h-[calc(100vh-2rem)] overflow-y-auto">
              <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
                  LINKED CHURCH
                </h3>
                <ChurchProfileCard
                  church={(post.post_type === 'prayer_post' ? post.linked_church : post.church)!}
                  onViewOnMap={handleViewOnMap}
                />
              </div>

              {/* Desktop-only prayer section (mobile version is shown inline above) */}
              {post.post_type === 'prayer_post' && canEdit && post.linked_church && (
                <div className="hidden lg:block">
                  <AddChurchPrayerSection
                    churchId={post.linked_church.id}
                    churchName={post.linked_church.name}
                    cityPlatformId={platform?.id}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {id && (
        <SetPrayerPostDialog
          postId={id}
          postTitle={post.title || undefined}
          open={showSetPrayerPostDialog}
          onOpenChange={setShowSetPrayerPostDialog}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: [postApiUrl] });
          }}
        />
      )}

      <AlertDialog open={showDeletePostDialog} onOpenChange={setShowDeletePostDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Post</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this post? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePostMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-post"
            >
              {deletePostMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteCommentDialog} onOpenChange={setShowDeleteCommentDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Comment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this comment? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCommentToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => commentToDelete && deleteCommentMutation.mutate(commentToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-comment"
            >
              {deleteCommentMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <GuestCommentModal
        open={showGuestCommentModal}
        onClose={() => setShowGuestCommentModal(false)}
        onSubmit={handleGuestCommentSubmit}
        isPrayerPost={post?.post_type === 'prayer_post'}
        commentBody={commentBody}
      />
    </div>
  );
}
