import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Heart, PartyPopper } from "lucide-react";
import type { ReactionType, ReactionCounts } from "@shared/schema";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface ReactionsBarProps {
  postId?: string;
  commentId?: string;
  initialCounts?: ReactionCounts;
  initialUserReactions?: ReactionType[];
  compact?: boolean;
}

type ActiveReactionType = 'like' | 'celebrate';

const REACTION_CONFIG: Record<ActiveReactionType, { icon: typeof Heart; label: string; activeColor: string; activeBg: string }> = {
  like: { icon: Heart, label: "Like", activeColor: "text-red-500", activeBg: "bg-red-50 dark:bg-red-950/30" },
  celebrate: { icon: PartyPopper, label: "Celebrate", activeColor: "text-amber-500", activeBg: "bg-amber-50 dark:bg-amber-950/30" },
};

const ACTIVE_REACTIONS: ActiveReactionType[] = ['like', 'celebrate'];

export function ReactionsBar({ 
  postId,
  commentId,
  initialCounts = { like: 0, pray: 0, celebrate: 0, support: 0 },
  initialUserReactions = [],
  compact = false
}: ReactionsBarProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  
  const isComment = !!commentId;
  const entityId = commentId || postId;
  const queryKey = isComment 
    ? ["/api/comments", commentId, "reactions"]
    : ["/api/posts", postId, "reactions"];
  const apiPath = isComment
    ? `/api/comments/${commentId}/reactions`
    : `/api/posts/${postId}/reactions`;
  
  const { data: reactionsData } = useQuery<{ counts: ReactionCounts; user_reactions: ReactionType[] }>({
    queryKey,
    initialData: { counts: initialCounts, user_reactions: initialUserReactions },
    staleTime: 30000,
    enabled: !!entityId,
  });

  const counts = reactionsData?.counts || initialCounts;
  const userReactions = reactionsData?.user_reactions || initialUserReactions;

  const toggleReactionMutation = useMutation({
    mutationFn: async (reactionType: ReactionType) => {
      return apiRequest("POST", apiPath, { reaction_type: reactionType });
    },
    onSuccess: (data: any) => {
      queryClient.setQueryData(queryKey, {
        counts: data.counts,
        user_reactions: data.user_reactions,
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

  const handleReaction = (type: ReactionType) => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: isComment ? "Please sign in to react to comments." : "Please sign in to react to posts.",
        variant: "destructive",
      });
      return;
    }
    toggleReactionMutation.mutate(type);
  };

  return (
    <div className={cn("flex items-center", compact ? "gap-1" : "gap-2")}>
      {ACTIVE_REACTIONS.map((type) => {
        const config = REACTION_CONFIG[type];
        const Icon = config.icon;
        const count = counts[type] || 0;
        const isActive = userReactions.includes(type);

        return (
          <motion.button
            key={type}
            whileTap={{ scale: 0.9 }}
            onClick={() => handleReaction(type)}
            disabled={toggleReactionMutation.isPending}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full transition-colors",
              compact && "px-1.5 py-0.5",
              isActive 
                ? cn(config.activeColor, config.activeBg)
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            data-testid={`button-reaction-${type}-${entityId}`}
          >
            <Icon 
              className={cn(
                compact ? "h-4 w-4" : "h-5 w-5",
                isActive && "fill-current"
              )} 
              strokeWidth={2.2}
            />
            <AnimatePresence mode="wait">
              {count > 0 && (
                <motion.span 
                  key={count}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  className={cn("font-medium min-w-[1ch]", compact ? "text-xs" : "text-sm")}
                  data-testid={`count-reaction-${type}-${entityId}`}
                >
                  {count}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </div>
  );
}
