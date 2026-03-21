import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { type PreviewComment } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { Hand, MessageCircle, ChevronRight, ChevronDown } from "lucide-react";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const VIEWED_COMMENTS_KEY = 'viewed_prayer_comments';

function getViewedComments(): Set<string> {
  try {
    const stored = localStorage.getItem(VIEWED_COMMENTS_KEY);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch (e) {
    console.error('Failed to load viewed comments:', e);
  }
  return new Set();
}

function markCommentsAsViewed(commentIds: string[]) {
  try {
    const viewed = getViewedComments();
    commentIds.forEach(id => viewed.add(id));
    const MAX_STORED = 500;
    const viewedArray = Array.from(viewed);
    const trimmed = viewedArray.slice(-MAX_STORED);
    localStorage.setItem(VIEWED_COMMENTS_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('Failed to save viewed comments:', e);
  }
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

interface PrayerCommentPreviewProps {
  postId: string;
  comments: PreviewComment[];
  totalCommentCount: number;
  isFirstPrayerPost: boolean;
}

export function PrayerCommentPreview({ 
  postId, 
  comments, 
  totalCommentCount,
  isFirstPrayerPost 
}: PrayerCommentPreviewProps) {
  const [viewedCommentIds, setViewedCommentIds] = useState<Set<string>>(() => getViewedComments());
  const [hasMarkedViewed, setHasMarkedViewed] = useState(false);
  const { getCommunityUrl } = usePlatformNavigation();

  const newCommentIds = useMemo(() => {
    return comments.filter(c => !viewedCommentIds.has(c.id)).map(c => c.id);
  }, [comments, viewedCommentIds]);

  useEffect(() => {
    if (!hasMarkedViewed && comments.length > 0) {
      const timer = setTimeout(() => {
        const commentIds = comments.map(c => c.id);
        markCommentsAsViewed(commentIds);
        // Update local state so NEW badges disappear without page refresh
        setViewedCommentIds(prev => {
          const updated = new Set(prev);
          commentIds.forEach(id => updated.add(id));
          return updated;
        });
        setHasMarkedViewed(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [comments, hasMarkedViewed]);

  const [isOpen, setIsOpen] = useState(false);
  
  // Show max 3 comments when expanded
  const displayedComments = comments.slice(0, 3);
  const hasMoreComments = totalCommentCount > 3;

  return (
    <div className="mx-4 mt-3 rounded-lg border border-border/40 overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="w-full" data-testid={`toggle-prayers-${postId}`}>
          <div className="px-4 py-3 hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hand className="w-4 h-4 text-primary/60" />
                <span className="text-sm font-medium">
                  {totalCommentCount > 0 ? `${totalCommentCount} Praying` : "Prayers"}
                </span>
                {newCommentIds.length > 0 && (
                  <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {newCommentIds.length} new
                  </span>
                )}
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </div>
            {/* Teaser — show snippet of most recent prayer when collapsed */}
            {!isOpen && displayedComments.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 text-left italic">
                "{displayedComments[0].body?.slice(0, 120)}{(displayedComments[0].body?.length || 0) > 120 ? "..." : ""}"
              </p>
            )}
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 space-y-2">
            {displayedComments.map((comment) => {
              const isNew = newCommentIds.includes(comment.id);
              const displayName = comment.display_name || 
                comment.guest_name ||
                comment.author?.full_name || 
                comment.author?.first_name || 
                'Anonymous';
              const isPrayer = comment.comment_type === 'prayer_tap';
              
              return (
                <div 
                  key={comment.id}
                  className={`
                    flex items-start gap-2.5 p-2.5 rounded-lg border transition-all duration-300
                    ${isNew 
                      ? 'new-comment-highlight border-primary/30' 
                      : 'bg-muted/30 border-border/30'
                    }
                  `}
                  data-testid={`preview-comment-${comment.id}`}
                >
                  <Avatar className="h-7 w-7 flex-shrink-0">
                    <AvatarImage src={comment.author?.avatar_url || undefined} />
                    <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                      {getInitials(displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-sm text-foreground">
                        {displayName}
                      </span>
                      {isPrayer && (
                        <Hand className="w-3 h-3 text-amber-500/70" />
                      )}
                      <span className="text-xs text-muted-foreground/70">
                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: false })}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/80 line-clamp-2 mt-0.5">
                      {comment.body}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-4 pt-2 pb-3">
            {displayedComments.length === 0 && totalCommentCount === 0 ? (
              <Link href={getCommunityUrl(postId)}>
                <div 
                  className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:text-foreground bg-muted/30 rounded-lg border border-dashed border-border/50 transition-colors cursor-pointer"
                  data-testid={`button-add-prayer-${postId}`}
                >
                  <Hand className="w-4 h-4" />
                  <span className="font-medium">Be the first to pray for this church</span>
                </div>
              </Link>
            ) : hasMoreComments ? (
              <Link href={getCommunityUrl(postId)}>
                <button 
                  className="w-full flex items-center justify-center gap-2 py-2.5 mt-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                  data-testid={`button-view-more-comments-${postId}`}
                >
                  <span>View all {totalCommentCount} prayers</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </Link>
            ) : displayedComments.length > 0 ? (
              <Link href={getCommunityUrl(postId)}>
                <button 
                  className="w-full flex items-center justify-center gap-2 py-2.5 mt-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                  data-testid={`button-add-more-prayers-${postId}`}
                >
                  <Hand className="w-4 h-4" />
                  <span>Add your prayer</span>
                </button>
              </Link>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
