import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import { type PostWithDetails } from "@shared/schema";
import { MessageSquare, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface PostsResponse {
  posts: PostWithDetails[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface ChurchPostsFeedProps {
  churchId: string;
  churchName: string;
}

export function ChurchPostsFeed({ churchId, churchName }: ChurchPostsFeedProps) {
  const { getCommunityUrl } = usePlatformNavigation();
  const { data: response, isLoading } = useQuery<PostsResponse>({
    queryKey: ["/api/posts"],
  });

  // Filter posts by church_id on the frontend
  const posts = response?.posts?.filter(post => post.church_id === churchId) || [];

  // Don't show if no posts
  if (!isLoading && posts.length === 0) {
    return null;
  }

  return (
    <Card data-testid="card-church-posts">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Community Posts
            </CardTitle>
            <CardDescription>
              Posts from {churchName}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild data-testid="button-view-all-posts">
            <Link href={getCommunityUrl()}>
              <ExternalLink className="w-4 h-4 mr-2" />
              View All
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="p-3 border rounded-md space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-16 w-full" />
              </div>
            ))}
          </div>
        ) : posts.length > 0 ? (
          <div className="space-y-3">
            {posts.slice(0, 3).map((post) => (
              <Link key={post.id} href={getCommunityUrl(post.id)}>
                <div
                  className="p-3 border rounded-md space-y-2 hover-elevate cursor-pointer"
                  data-testid={`post-${post.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    {post.title && (
                      <h4 className="font-medium text-sm flex-1">{post.title}</h4>
                    )}
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  
                  {post.media_url && post.media_type === 'image' && (
                    <img
                      src={post.media_url}
                      alt={post.title || "Post image"}
                      className="w-full h-32 object-cover rounded-md"
                    />
                  )}
                  
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {post.body}
                  </p>
                  
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      <span>{post.comment_count || 0}</span>
                    </div>
                    <span>•</span>
                    <span>{post.author?.full_name || "Unknown"}</span>
                  </div>
                </div>
              </Link>
            ))}
            
            {posts.length > 3 && (
              <Button variant="ghost" size="sm" className="w-full" asChild>
                <Link href={getCommunityUrl()}>
                  View {posts.length - 3} more post{posts.length - 3 !== 1 ? 's' : ''}
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-md">
            No posts from this church yet
          </div>
        )}
      </CardContent>
    </Card>
  );
}
