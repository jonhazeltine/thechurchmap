import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type PostWithDetails, type ChurchSummary, insertPostSchema } from "@shared/schema";
import { MessageCircle, Building2, X, Loader2, Save, Hand, Pencil, Globe, MapPin, MoreHorizontal, Trash2, Map, LogOut, LogIn, User as UserIcon, Shield, ShieldCheck, Users, UserPlus, Clock, CheckCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { IconBuildingChurch } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import { PrayerCommentPreview } from "@/components/PrayerCommentPreview";
import { ChurchPrayerMiniCards } from "@/components/ChurchPrayerMiniCards";
import { formatDistanceToNow } from "date-fns";
import { RichTextEditor } from "@/components/RichTextEditor";
import { ReactionsBar } from "@/components/ReactionsBar";
import { MultiFileUpload } from "@/components/MultiFileUpload";
import { MediaGrid } from "@/components/MediaGrid";
import { ShareMenu } from "@/components/ShareMenu";
import { EmojiPicker } from "@/components/EmojiPicker";
import { LinkPreview, extractUrls } from "@/components/LinkPreview";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformContext } from "@/contexts/PlatformContext";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { motion, AnimatePresence } from "framer-motion";
import InfiniteScroll from "react-infinite-scroll-component";

const DRAFT_STORAGE_KEY = 'community_post_draft';
const AUTOSAVE_INTERVAL = 5000;

interface PostsResponse {
  posts: PostWithDetails[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface DraftData {
  richContent: any;
  churchId: string | null;
  churchName: string | null;
  mediaUrls: string[];
  hasVideo: boolean;
  savedAt: number;
}

interface UserMembershipStatus {
  isMember: boolean;
  hasPendingRequest: boolean;
  role: string | null;
}

function extractPlainText(json: any): string {
  if (!json || !json.content) return '';
  let text = '';
  const traverse = (node: any) => {
    if (node.type === 'text') {
      text += node.text || '';
    } else if (node.content) {
      node.content.forEach(traverse);
    }
    if (node.type === 'paragraph' || node.type === 'heading') {
      text += '\n';
    }
  };
  traverse(json);
  return text.trim();
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

interface InlineComposerProps {
  onPostCreated: () => void;
  cityPlatformId?: string | null;
}

function InlineComposer({ onPostCreated, cityPlatformId }: InlineComposerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isSuperAdmin, isPlatformAdmin } = useAdminAccess();
  const isAdmin = isSuperAdmin || isPlatformAdmin;
  const [isExpanded, setIsExpanded] = useState(false);
  const [richContent, setRichContent] = useState<any>(null);
  const [selectedChurch, setSelectedChurch] = useState<ChurchSummary | null>(null);
  const [churchSearchOpen, setChurchSearchOpen] = useState(false);
  const [churchSearchQuery, setChurchSearchQuery] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [hasVideo, setHasVideo] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const lastSaveRef = useRef<number>(0);

  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (savedDraft) {
        const draft: DraftData = JSON.parse(savedDraft);
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        if (draft.savedAt > oneDayAgo) {
          setHasDraft(true);
        } else {
          localStorage.removeItem(DRAFT_STORAGE_KEY);
        }
      }
    } catch (e) {
      console.error('Failed to load draft:', e);
    }
  }, []);

  const restoreDraft = useCallback(() => {
    try {
      const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (savedDraft) {
        const draft: DraftData = JSON.parse(savedDraft);
        setRichContent(draft.richContent);
        if (draft.churchId && draft.churchName) {
          setSelectedChurch({ id: draft.churchId, name: draft.churchName } as ChurchSummary);
        }
        setMediaUrls(draft.mediaUrls || []);
        setHasVideo(draft.hasVideo || false);
        setIsExpanded(true);
        setHasDraft(false);
        toast({
          title: "Draft restored",
          description: "Your previous draft has been loaded.",
        });
      }
    } catch (e) {
      console.error('Failed to restore draft:', e);
    }
  }, [toast]);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    setDraftSaved(false);
    setHasDraft(false);
  }, []);

  useEffect(() => {
    if (!isExpanded) return;

    const plainText = extractPlainText(richContent);
    if (!plainText.trim() && mediaUrls.length === 0) return;

    const saveTimeout = setTimeout(() => {
      const now = Date.now();
      if (now - lastSaveRef.current < AUTOSAVE_INTERVAL) return;

      try {
        const draft: DraftData = {
          richContent,
          churchId: selectedChurch?.id || null,
          churchName: selectedChurch?.name || null,
          mediaUrls,
          hasVideo,
          savedAt: now,
        };
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
        lastSaveRef.current = now;
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 2000);
      } catch (e) {
        console.error('Failed to save draft:', e);
      }
    }, AUTOSAVE_INTERVAL);

    return () => clearTimeout(saveTimeout);
  }, [richContent, selectedChurch, mediaUrls, hasVideo, isExpanded]);

  const { data: searchResults } = useQuery<ChurchSummary[]>({
    queryKey: ["/api/churches/search", churchSearchQuery, cityPlatformId],
    queryFn: async () => {
      const params = new URLSearchParams({ q: churchSearchQuery });
      if (cityPlatformId) {
        params.set('city_platform_id', cityPlatformId);
      }
      const res = await fetch(`/api/churches/search?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    enabled: churchSearchQuery.length >= 2 && !!cityPlatformId,
  });

  const createPostMutation = useMutation({
    mutationFn: async () => {
      const plainText = extractPlainText(richContent);
      const mediaType = hasVideo ? 'video' : (mediaUrls.length > 0 ? 'image' : 'none');
      const validatedData = insertPostSchema.parse({
        body: plainText,
        bodyFormat: richContent ? 'rich_text_json' : 'plain_text',
        richBody: richContent,
        mediaUrl: mediaUrls[0] || undefined,
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
        mediaType: mediaType,
        churchId: selectedChurch?.id,
        cityPlatformId: cityPlatformId || undefined,
      });
      return apiRequest("POST", "/api/posts", validatedData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({
        title: "Post created",
        description: "Your post has been published to the community feed.",
      });
      clearDraft();
      setRichContent(null);
      setSelectedChurch(null);
      setMediaUrls([]);
      setHasVideo(false);
      setIsExpanded(false);
      onPostCreated();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!user) {
    return (
      <div className="bg-muted/30 rounded-lg p-3 mb-4 border border-border/30">
        <div className="flex items-center gap-2.5">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-muted text-muted-foreground text-xs">?</AvatarFallback>
          </Avatar>
          <Link href="/login" className="flex-1">
            <div className="bg-background/60 rounded-full px-3 py-2 text-muted-foreground text-sm hover:bg-background transition-colors border border-border/30">
              Sign in to start a thread...
            </div>
          </Link>
        </div>
      </div>
    );
  }

  const plainText = extractPlainText(richContent);
  const canSubmit = plainText.trim().length > 0;

  return (
    <div className="bg-muted/30 rounded-lg p-3 mb-4 border border-border/30">
      <div className="flex gap-2.5">
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarImage src={undefined} />
          <AvatarFallback className="bg-muted text-muted-foreground text-xs font-medium">
            {getInitials(user.user_metadata?.full_name || user.email)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          {!isExpanded ? (
            <div className="space-y-1.5">
              <button 
                className="w-full text-left bg-background/60 rounded-full px-3 py-2 text-muted-foreground text-sm hover:bg-background transition-colors border border-border/30"
                onClick={() => setIsExpanded(true)}
                data-testid="button-expand-composer"
              >
                Start a thread...
              </button>
              {hasDraft && (
                <button
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                  onClick={restoreDraft}
                  data-testid="button-restore-draft"
                >
                  <Save className="w-3 h-3" strokeWidth={2.2} />
                  You have a saved draft. Click to restore.
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <RichTextEditor
                content={richContent}
                onChange={setRichContent}
                placeholder="Start a thread..."
                minimal
                platformId={cityPlatformId || undefined}
              />

              {selectedChurch && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 bg-muted px-2.5 py-1 rounded-full text-sm">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={2.2} />
                    <span className="text-foreground">{selectedChurch.name}</span>
                    <button
                      onClick={() => setSelectedChurch(null)}
                      className="ml-0.5 hover:bg-background rounded-full p-0.5 transition-colors"
                      data-testid="button-remove-church-inline"
                    >
                      <X className="w-3 h-3 text-muted-foreground" strokeWidth={2.2} />
                    </button>
                  </span>
                </div>
              )}

              <MultiFileUpload
                onFilesChange={(urls, hasVid) => {
                  setMediaUrls(urls);
                  setHasVideo(hasVid);
                }}
                currentFiles={mediaUrls}
                maxFiles={10}
                isAdmin={isAdmin}
              />

              <div className="border-t border-border/50 pt-3 mt-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    {cityPlatformId && (
                      <Popover open={churchSearchOpen} onOpenChange={setChurchSearchOpen}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-muted-foreground hover:bg-muted transition-colors"
                            data-testid="button-tag-church-inline"
                          >
                            <Building2 className="w-4 h-4" strokeWidth={2.2} />
                            <span className="hidden sm:inline">Tag Church</span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-0" align="start">
                          <Command shouldFilter={false}>
                            <CommandInput
                              placeholder="Search churches..."
                              value={churchSearchQuery}
                              onValueChange={setChurchSearchQuery}
                            />
                            <CommandList>
                              {churchSearchQuery.length < 2 ? (
                                <CommandEmpty>Type at least 2 characters...</CommandEmpty>
                              ) : searchResults && searchResults.length > 0 ? (
                                <CommandGroup>
                                  {searchResults.map((church) => (
                                    <CommandItem
                                      key={church.id}
                                      value={church.id}
                                      onSelect={() => {
                                        setSelectedChurch(church);
                                        setChurchSearchOpen(false);
                                        setChurchSearchQuery("");
                                      }}
                                    >
                                      <Building2 className="w-4 h-4 mr-2" />
                                      <div className="flex-1 min-w-0">
                                        <div className="font-medium truncate">{church.name}</div>
                                        {church.city && (
                                          <div className="text-xs text-muted-foreground">{church.city}</div>
                                        )}
                                      </div>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              ) : (
                                <CommandEmpty>No churches found</CommandEmpty>
                              )}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    )}
                    
                    <AnimatePresence>
                      {draftSaved && (
                        <motion.div
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          className="flex items-center gap-1 text-xs text-muted-foreground"
                          data-testid="text-draft-saved"
                        >
                          <Save className="w-3 h-3" strokeWidth={2.2} />
                          Saved
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted"
                      onClick={() => {
                        setIsExpanded(false);
                        setRichContent(null);
                        setSelectedChurch(null);
                        setMediaUrls([]);
                        setHasVideo(false);
                      }}
                      data-testid="button-cancel-inline"
                    >
                      Cancel
                    </button>
                    <button
                      className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${
                        canSubmit && !createPostMutation.isPending
                          ? 'bg-foreground text-background hover:bg-foreground/90'
                          : 'bg-muted text-muted-foreground cursor-not-allowed'
                      }`}
                      onClick={() => createPostMutation.mutate()}
                      disabled={!canSubmit || createPostMutation.isPending}
                      data-testid="button-post-inline"
                    >
                      {createPostMutation.isPending ? "Posting..." : "Post"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PostCard({ post, index }: { post: PostWithDetails; index: number }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isSuperAdmin, isPlatformAdmin } = useAdminAccess();
  const { getMapUrl, getCommunityUrl, getChurchUrl } = usePlatformNavigation();
  const [, navigate] = useLocation();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const plainText = post.body_format === 'rich_text_json' && post.rich_body 
    ? extractPlainText(post.rich_body) 
    : post.body || '';
  
  const urls = extractUrls(plainText);
  const firstUrl = urls[0];
  
  const isPrayerPost = post.post_type === 'prayer_post';
  const linkedChurch = post.linked_church || post.church;
  
  // Check if user can edit/delete this post (author or admin)
  const canEdit = user && (post.author_id === user.id || isSuperAdmin || isPlatformAdmin);
  
  // Get cover image for prayer posts
  const prayerCoverImage = isPrayerPost ? post.cover_image_url : null;

  const handleMentionClick = useCallback((id: string, type: 'user' | 'church') => {
    if (type === 'church') {
      navigate(getChurchUrl(id));
    }
  }, [navigate, getChurchUrl]);

  const deletePostMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/posts/${post.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({
        title: "Post deleted",
        description: "The post has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete the post.",
        variant: "destructive",
      });
    },
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <div 
        className={`rounded-xl overflow-hidden transition-all duration-200 ${
          isPrayerPost 
            ? 'bg-card border border-amber-300/50 dark:border-amber-700/40 shadow-md ring-1 ring-amber-100/30 dark:ring-amber-900/20' 
            : 'bg-card border border-border/50 shadow-sm hover:bg-accent/30'
        }`}
        data-testid={`card-post-${post.id}`}
      >
        {/* Prayer post header - "Prayer Card: Church Name" with amber accent */}
        {isPrayerPost && linkedChurch && (
          <div className="px-4 py-3 bg-gradient-to-r from-amber-50/60 to-amber-50/30 dark:from-amber-950/25 dark:to-amber-950/10 border-b border-amber-200/40 dark:border-amber-800/30">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 rounded-full bg-amber-400/70 dark:bg-amber-500/50" />
              <IconBuildingChurch className="w-5 h-5 text-amber-600/80 dark:text-amber-400/70" />
              <Link href={getMapUrl({ church: linkedChurch.id })}>
                <span className="font-bold text-base text-foreground hover:underline" data-testid={`link-church-${post.id}`}>
                  Prayer Card: {linkedChurch.name}
                </span>
              </Link>
            </div>
          </div>
        )}
        
        {/* Prayer post cover image */}
        {isPrayerPost && prayerCoverImage && (
          <div className="w-full bg-muted">
            <img 
              src={prayerCoverImage} 
              alt="Prayer focus" 
              className="block w-full h-40 object-cover"
              data-testid={`img-prayer-cover-${post.id}`}
            />
          </div>
        )}
        
        <div className={`${isPrayerPost ? 'px-4 py-2' : 'p-4 pb-3'}`}>
          <div className="flex items-start gap-2.5">
            {/* Prayer posts show timestamp + edit menu only, regular posts show user */}
            {isPrayerPost ? (
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground/60 text-xs">
                    {formatDistanceToNow(new Date(post.last_activity_at || post.created_at), { addSuffix: true })}
                  </span>
                  {canEdit && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button 
                          className="ml-auto p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                          data-testid={`button-post-menu-${post.id}`}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <Link href={`${getCommunityUrl(post.id)}?edit=true`}>
                          <DropdownMenuItem data-testid={`button-edit-${post.id}`}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                        </Link>
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive"
                          onClick={() => setShowDeleteDialog(true)}
                          data-testid={`button-delete-${post.id}`}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ) : (
              <>
                <Avatar className="h-11 w-11 flex-shrink-0 ring-2 ring-background">
                  <AvatarImage src={post.author?.avatar_url || undefined} />
                  <AvatarFallback className="bg-muted text-muted-foreground font-medium">
                    {getInitials(post.author?.full_name || post.author?.first_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-[15px] text-foreground" data-testid={`text-author-${post.id}`}>
                      {post.author?.full_name || post.author?.first_name || "Unknown"}
                    </p>
                    <span className="text-muted-foreground text-xs">
                      · {formatDistanceToNow(new Date(post.last_activity_at || post.created_at), { addSuffix: false })}
                    </span>
                    {canEdit && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button 
                            className="ml-auto p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                            data-testid={`button-post-menu-${post.id}`}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <Link href={`${getCommunityUrl(post.id)}?edit=true`}>
                            <DropdownMenuItem data-testid={`button-edit-${post.id}`}>
                              <Pencil className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                          </Link>
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={() => setShowDeleteDialog(true)}
                            data-testid={`button-delete-${post.id}`}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  {post.church && (
                    <Link href={getMapUrl({ church: post.church.id })}>
                      <span 
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 mt-0.5" 
                        data-testid={`badge-church-${post.id}`}
                      >
                        <Building2 className="w-3 h-3" strokeWidth={2.2} />
                        {post.church.name}
                      </span>
                    </Link>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <Link href={getCommunityUrl(post.id)} className="block">
          <div className="px-4 pb-3 space-y-3 cursor-pointer">
            {/* Prayer posts show encouragement message, regular posts show their title */}
            {isPrayerPost && linkedChurch ? (
              <p className="text-sm text-muted-foreground leading-relaxed" data-testid={`text-title-${post.id}`}>
                Add your prayers and encouragement for {linkedChurch.name} in the comments
              </p>
            ) : post.title && (
              <h2 className="text-base font-semibold text-foreground leading-snug hover:text-primary transition-colors" data-testid={`text-title-${post.id}`}>
                {post.title}
              </h2>
            )}

            {post.body_format === 'rich_text_json' && post.rich_body ? (
              <div className="text-[15px] text-foreground leading-relaxed line-clamp-4" data-testid={`rich-body-${post.id}`}>
                <RichTextEditor
                  content={post.rich_body}
                  onChange={() => {}}
                  editable={false}
                  onMentionClick={handleMentionClick}
                />
              </div>
            ) : (
              <p className="text-[15px] text-foreground leading-relaxed whitespace-pre-wrap line-clamp-4" data-testid={`text-body-${post.id}`}>
                {post.body}
              </p>
            )}
            
            {/* Read more link for truncated content */}
            {(plainText.length > 200 || post.title) && (
              <span className="text-sm text-primary hover:underline font-medium" data-testid={`link-read-more-${post.id}`}>
                Read more
              </span>
            )}
          </div>
        </Link>

        {/* Media section - videos play inline, images open post */}
        <div className="px-4 pb-3">
          {post.media_urls && post.media_urls.length > 0 ? (
            <MediaGrid urls={post.media_urls} postId={post.id} inline />
          ) : post.media_url ? (
            <MediaGrid urls={[post.media_url]} postId={post.id} inline />
          ) : null}

          {firstUrl && !post.media_url && (!post.media_urls || post.media_urls.length === 0) && (
            <LinkPreview url={firstUrl} className="mt-2" />
          )}
        </div>

        {/* Church prayer needs - show first */}
        {isPrayerPost && linkedChurch && (
          <ChurchPrayerMiniCards churchId={linkedChurch.id} />
        )}

        {/* Prayer responses and encouragement */}
        {isPrayerPost && (
          <PrayerCommentPreview
            postId={post.id}
            comments={post.preview_comments || []}
            totalCommentCount={post.comment_count || 0}
            isFirstPrayerPost={post.is_first_prayer_post || false}
          />
        )}

        <div className="px-4 py-3 border-t border-border/50">
          <div className="flex items-center justify-between">
            <ReactionsBar 
              postId={post.id}
              initialCounts={post.reaction_counts}
              initialUserReactions={post.user_reactions}
              compact
            />
            <div className="flex items-center gap-4">
              <Link href={getCommunityUrl(post.id)}>
                <button 
                  className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  data-testid={`button-comment-${post.id}`}
                >
                  <MessageCircle className="h-5 w-5" strokeWidth={2.2} />
                  {(post.comment_count ?? 0) > 0 && (
                    <span className="text-sm font-medium">{post.comment_count}</span>
                  )}
                </button>
              </Link>
              <ShareMenu postId={post.id} title={post.title || undefined} />
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
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
              data-testid={`button-confirm-delete-${post.id}`}
            >
              {deletePostMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

function PostSkeleton() {
  return (
    <div className="bg-card rounded-xl shadow-sm p-4">
      <div className="flex items-start gap-3 mb-4">
        <Skeleton className="h-11 w-11 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-12" />
          </div>
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="space-y-3 mb-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
      <div className="border-t border-border/50 pt-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-16 rounded-full" />
          <Skeleton className="h-8 w-16 rounded-full" />
          <Skeleton className="h-8 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

interface FeedProps {
  scope: 'platform' | 'global';
  platformId: string | null;
  onPostCreated: () => void;
}

function Feed({ scope, platformId, onPostCreated }: FeedProps) {
  const { 
    data, 
    isLoading,
    fetchNextPage,
    hasNextPage,
    refetch
  } = useInfiniteQuery<PostsResponse>({
    queryKey: ["/api/posts", { scope, platformId }],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '10', scope });
      if (pageParam) {
        params.set('cursor', pageParam as string);
      }
      if (platformId && scope === 'platform') {
        params.set('city_platform_id', platformId);
      }
      const url = `/api/posts?${params.toString()}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch posts');
      return res.json();
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const posts = useMemo(() => {
    return data?.pages.flatMap(page => page.posts) || [];
  }, [data]);

  const handleRefetch = useCallback(() => {
    refetch();
    onPostCreated();
  }, [refetch, onPostCreated]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <PostSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="bg-card rounded-xl shadow-sm p-8 text-center">
        <MessageCircle className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" strokeWidth={1.5} />
        <h3 className="text-lg font-semibold text-foreground mb-2">No threads yet</h3>
        <p className="text-muted-foreground text-sm">
          {scope === 'platform' 
            ? "Be the first to start a conversation in this community!"
            : "Be the first to start a national conversation!"}
        </p>
      </div>
    );
  }

  return (
    <InfiniteScroll
      dataLength={posts.length}
      next={fetchNextPage}
      hasMore={!!hasNextPage}
      loader={
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
      endMessage={
        posts.length > 5 && (
          <p className="text-center text-muted-foreground text-sm py-6">
            You've reached the end
          </p>
        )
      }
    >
      <AnimatePresence mode="popLayout">
        <div className="space-y-5">
          {posts.map((post, index) => (
            <PostCard key={post.id} post={post} index={index} />
          ))}
        </div>
      </AnimatePresence>
    </InfiniteScroll>
  );
}

export default function Community() {
  const { platformId, platform, hasPlatformContext } = usePlatformContext();
  const { user, signOut, session } = useAuth();
  const { isSuperAdmin, isAnyAdmin, userPlatforms } = useAdminAccess();
  const { buildPlatformUrl, getChurchUrl, getMapUrl } = usePlatformNavigation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'platform' | 'global'>('platform');
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [joinMessage, setJoinMessage] = useState("");

  // Fetch user's church affiliation for "My Church" link
  const { data: onboardingStatus } = useQuery<{
    church_id: string | null;
    church: { id: string; name: string } | null;
  }>({
    queryKey: ['/api/onboarding/status'],
    enabled: !!user && !!session?.access_token,
    staleTime: 5 * 60 * 1000,
  });

  // Check membership status for current platform
  const { data: membershipStatus, isLoading: membershipLoading } = useQuery<UserMembershipStatus>({
    queryKey: ['/api/platforms', platformId, 'my-membership'],
    enabled: !!user && !!platformId && hasPlatformContext,
  });

  // Join platform mutation
  const joinMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/platforms/${platformId}/join`, { message: joinMessage || null });
    },
    onSuccess: () => {
      toast({
        title: "Request Submitted",
        description: "Your membership request has been submitted for review.",
      });
      setShowJoinDialog(false);
      setJoinMessage("");
      queryClient.invalidateQueries({ queryKey: ['/api/platforms', platformId, 'my-membership'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit join request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const backLink = useMemo(() => {
    // Map button should navigate to clean map view (panel closed)
    return getMapUrl({ panel: 'closed' });
  }, [getMapUrl]);

  // Render join button/badge for platform header
  const renderJoinButton = () => {
    if (!user || !hasPlatformContext) return null;

    if (membershipLoading) {
      return (
        <Badge variant="outline" className="text-xs">
          <Loader2 className="h-3 w-3 animate-spin" />
        </Badge>
      );
    }

    if (membershipStatus?.isMember) {
      return (
        <Badge variant="secondary" className="text-xs" data-testid="badge-member">
          <CheckCircle className="h-3 w-3 mr-1" />
          Member
        </Badge>
      );
    }

    if (membershipStatus?.hasPendingRequest) {
      return (
        <Badge variant="outline" className="text-xs" data-testid="badge-pending">
          <Clock className="h-3 w-3 mr-1" />
          Pending
        </Badge>
      );
    }

    return (
      <Button 
        size="sm" 
        variant="outline"
        onClick={() => setShowJoinDialog(true)}
        data-testid="button-join-platform"
      >
        <UserPlus className="h-3 w-3 mr-1" />
        Join
      </Button>
    );
  };

  const handlePostCreated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.log('SignOut completed (session may have been missing)');
    }
    window.location.href = '/login';
  };

  const getInitials = (email?: string) => {
    if (!email) return "U";
    return email.charAt(0).toUpperCase();
  };

  const pageTitle = useMemo(() => {
    if (hasPlatformContext && platform) {
      return platform.name;
    }
    return "National Community";
  }, [hasPlatformContext, platform]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-xl mx-auto px-4">
        {hasPlatformContext ? (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'platform' | 'global')}>
            {/* Sticky header */}
            <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border/40 -mx-4 px-4 py-3 mb-3">
              <div className="flex items-center gap-3">
                <Link href={backLink}>
                  <Button 
                    variant="ghost"
                    size="sm"
                    className="flex items-center gap-1.5 h-8 px-2"
                    data-testid="button-back-to-map"
                  >
                    <Map className="w-4 h-4" />
                    <span className="hidden sm:inline text-sm">Map</span>
                  </Button>
                </Link>
                <h1 className="text-lg font-semibold text-foreground truncate flex-1" data-testid="text-page-title">
                  {pageTitle}
                </h1>
                <TabsList className="h-7">
                  <TabsTrigger value="platform" className="flex items-center gap-1 px-2.5 h-6 text-xs" data-testid="tab-platform">
                    <MapPin className="w-3 h-3" />
                    City
                  </TabsTrigger>
                  <TabsTrigger value="global" className="flex items-center gap-1 px-2.5 h-6 text-xs" data-testid="tab-global">
                    <Globe className="w-3 h-3" />
                    National
                  </TabsTrigger>
                </TabsList>

                {renderJoinButton()}

                <ThemeToggle />

                {/* Profile Avatar Dropdown */}
                {user ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" data-testid="button-user-menu-community">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-xs">{getInitials(user.email)}</AvatarFallback>
                        </Avatar>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>
                        <div className="flex flex-col space-y-1">
                          <p className="text-sm font-medium" data-testid="text-user-email">{user.email}</p>
                        </div>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <Link href={buildPlatformUrl("/profile")}>
                        <DropdownMenuItem data-testid="link-profile">
                          <UserIcon className="mr-2 h-4 w-4" />
                          <span>Profile</span>
                        </DropdownMenuItem>
                      </Link>
                      {onboardingStatus?.church && (
                        <Link href={getChurchUrl(onboardingStatus.church.id)}>
                          <DropdownMenuItem data-testid="link-my-church">
                            <IconBuildingChurch className="mr-2 h-4 w-4" />
                            <span>My Church</span>
                          </DropdownMenuItem>
                        </Link>
                      )}
                      <DropdownMenuSeparator />
                      {isAnyAdmin && (
                        <>
                          {platform?.id && (
                            <Link href={`/admin/platform/${platform.id}`}>
                              <DropdownMenuItem data-testid="link-admin-panel">
                                <Shield className="mr-2 h-4 w-4" />
                                <span>Admin Panel</span>
                              </DropdownMenuItem>
                            </Link>
                          )}
                          {isSuperAdmin && (
                            <Link href="/admin/dashboard">
                              <DropdownMenuItem data-testid="link-super-admin-panel">
                                <ShieldCheck className="mr-2 h-4 w-4" />
                                <span>Super Admin Panel</span>
                              </DropdownMenuItem>
                            </Link>
                          )}
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuItem onClick={handleSignOut} data-testid="button-logout">
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Log out</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" data-testid="button-guest-menu-community">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="bg-muted">
                            <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          </AvatarFallback>
                        </Avatar>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuLabel className="text-muted-foreground font-normal">
                        Not signed in
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <Link href="/login">
                        <DropdownMenuItem data-testid="link-login-dropdown">
                          <LogIn className="mr-2 h-4 w-4" />
                          <span>Log In</span>
                        </DropdownMenuItem>
                      </Link>
                      <Link href="/signup">
                        <DropdownMenuItem data-testid="link-signup-dropdown">
                          <UserIcon className="mr-2 h-4 w-4" />
                          <span>Sign Up</span>
                        </DropdownMenuItem>
                      </Link>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            <InlineComposer 
              onPostCreated={handlePostCreated} 
              cityPlatformId={activeTab === 'platform' ? platform?.id || null : null} 
            />

            <TabsContent value="platform" className="mt-0">
              <Feed 
                scope="platform" 
                platformId={platformId} 
                onPostCreated={handlePostCreated} 
              />
            </TabsContent>

            <TabsContent value="global" className="mt-0">
              <Feed 
                scope="global" 
                platformId={null} 
                onPostCreated={handlePostCreated} 
              />
            </TabsContent>
          </Tabs>
        ) : (
          <>
            {/* Sticky header for national view */}
            <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border/40 -mx-4 px-4 py-3 mb-3">
              <div className="flex items-center gap-3">
                <Link href={backLink}>
                  <Button 
                    variant="ghost"
                    size="sm"
                    className="flex items-center gap-1.5 h-8 px-2"
                    data-testid="button-back-to-map"
                  >
                    <Map className="w-4 h-4" />
                    <span className="hidden sm:inline text-sm">Map</span>
                  </Button>
                </Link>
                <h1 className="text-lg font-semibold text-foreground truncate flex-1" data-testid="text-page-title">
                  {pageTitle}
                </h1>

                {/* My Platforms Dropdown */}
                {user && userPlatforms.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="flex items-center gap-1.5 h-8 px-2.5" data-testid="button-my-platforms">
                        <Users className="w-3.5 h-3.5" />
                        <span className="text-xs">My Platforms</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Your Communities</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {userPlatforms.map((p) => (
                        <Link key={p.platform_id} href={`/${p.platform_slug}`}>
                          <DropdownMenuItem data-testid={`link-platform-${p.platform_slug}`}>
                            <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
                            <span className="truncate">{p.platform_name}</span>
                          </DropdownMenuItem>
                        </Link>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                <ThemeToggle />

                {/* Profile Avatar Dropdown */}
                {user ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" data-testid="button-user-menu-community">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-xs">{getInitials(user.email)}</AvatarFallback>
                        </Avatar>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>
                        <div className="flex flex-col space-y-1">
                          <p className="text-sm font-medium" data-testid="text-user-email">{user.email}</p>
                        </div>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <Link href={buildPlatformUrl("/profile")}>
                        <DropdownMenuItem data-testid="link-profile">
                          <UserIcon className="mr-2 h-4 w-4" />
                          <span>Profile</span>
                        </DropdownMenuItem>
                      </Link>
                      {onboardingStatus?.church && (
                        <Link href={getChurchUrl(onboardingStatus.church.id)}>
                          <DropdownMenuItem data-testid="link-my-church">
                            <IconBuildingChurch className="mr-2 h-4 w-4" />
                            <span>My Church</span>
                          </DropdownMenuItem>
                        </Link>
                      )}
                      <DropdownMenuSeparator />
                      {isSuperAdmin && (
                        <>
                          <Link href="/admin/dashboard">
                            <DropdownMenuItem data-testid="link-super-admin-panel">
                              <ShieldCheck className="mr-2 h-4 w-4" />
                              <span>Super Admin Panel</span>
                            </DropdownMenuItem>
                          </Link>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuItem onClick={handleSignOut} data-testid="button-logout">
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Log out</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" data-testid="button-guest-menu-community">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="bg-muted">
                            <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          </AvatarFallback>
                        </Avatar>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuLabel className="text-muted-foreground font-normal">
                        Not signed in
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <Link href="/login">
                        <DropdownMenuItem data-testid="link-login-dropdown">
                          <LogIn className="mr-2 h-4 w-4" />
                          <span>Log In</span>
                        </DropdownMenuItem>
                      </Link>
                      <Link href="/signup">
                        <DropdownMenuItem data-testid="link-signup-dropdown">
                          <UserIcon className="mr-2 h-4 w-4" />
                          <span>Sign Up</span>
                        </DropdownMenuItem>
                      </Link>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
            <InlineComposer onPostCreated={handlePostCreated} cityPlatformId={null} />
            <Feed 
              scope="global" 
              platformId={null} 
              onPostCreated={handlePostCreated} 
            />
          </>
        )}
      </div>

      {/* Join Platform Dialog */}
      <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Join {platform?.name}</DialogTitle>
            <DialogDescription>
              Submit a request to join this platform. The platform admins will review your request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="join-message">Message (Optional)</Label>
              <Textarea
                id="join-message"
                placeholder="Introduce yourself or explain why you'd like to join..."
                value={joinMessage}
                onChange={(e) => setJoinMessage(e.target.value)}
                rows={3}
                data-testid="input-join-message"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowJoinDialog(false)} data-testid="button-cancel-join">
              Cancel
            </Button>
            <Button 
              onClick={() => joinMutation.mutate()}
              disabled={joinMutation.isPending}
              data-testid="button-submit-join"
            >
              {joinMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Request"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
