import { useState, useRef, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertPostSchema, type ChurchSummary } from "@shared/schema";
import { ArrowLeft, Building2, X } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformContext } from "@/contexts/PlatformContext";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import { RichTextEditor } from "@/components/RichTextEditor";
import { FileUpload } from "@/components/FileUpload";

// Helper function to extract plain text from TipTap JSON
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

export default function CommunityNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, loading } = useAuth();
  const { platformId } = usePlatformContext();
  const { isSuperAdmin, isPlatformAdmin } = useAdminAccess();
  const isAdmin = isSuperAdmin || isPlatformAdmin;
  const { getCommunityUrl } = usePlatformNavigation();
  const [title, setTitle] = useState("");
  const [richContent, setRichContent] = useState<any>(null);
  const [selectedChurch, setSelectedChurch] = useState<ChurchSummary | null>(null);
  const [churchSearchOpen, setChurchSearchOpen] = useState(false);
  const [churchSearchQuery, setChurchSearchQuery] = useState("");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'none'>('none');

  // Use the navigation hook which now returns the cleaner platform URL
  const communityLink = getCommunityUrl();

  useEffect(() => {
    if (!loading && !user) {
      toast({
        title: "Authentication required",
        description: "Please log in to create posts.",
        variant: "destructive",
      });
      setLocation("/login");
    }
  }, [user, loading, setLocation, toast]);

  const { data: searchResults } = useQuery<ChurchSummary[]>({
    queryKey: ["/api/churches/search", churchSearchQuery],
    queryFn: async () => {
      const res = await fetch(`/api/churches/search?q=${encodeURIComponent(churchSearchQuery)}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`${res.status}: ${res.statusText}`);
      }
      return res.json();
    },
    enabled: churchSearchQuery.length >= 2,
  });

  // Platform context for post creation:
  // - When creating from a platform-specific context, cityPlatformId would be set
  // - Posts created with a cityPlatformId are scoped to that platform
  // - For now, posts from the main app are not platform-scoped (cityPlatformId is null)
  const cityPlatformId: string | null = null;

  const createPostMutation = useMutation({
    mutationFn: async () => {
      // Convert TipTap JSON to plain text for backward compatibility
      const plainText = extractPlainText(richContent);
      
      const validatedData = insertPostSchema.parse({
        title: title || undefined,
        body: plainText,
        bodyFormat: richContent ? 'rich_text_json' : 'plain_text',
        richBody: richContent,
        mediaUrl: mediaUrl || undefined,
        mediaType: mediaType,
        churchId: selectedChurch?.id,
        cityPlatformId: cityPlatformId || undefined,
      });

      return apiRequest("POST", "/api/posts", validatedData);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({
        title: "Post created",
        description: "Your post has been published to the community feed.",
      });
      setLocation(getCommunityUrl(data.id));
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createPostMutation.mutate();
  };

  return (
    <div className="container max-w-3xl mx-auto py-8 px-4">
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

      <Card>
        <CardHeader>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            Create New Post
          </h1>
          <p className="text-muted-foreground">
            Share updates, stories, or resources with the community
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Title (optional)</Label>
              <Input
                id="title"
                placeholder="Give your post a title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                data-testid="input-title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="body">Content *</Label>
              <RichTextEditor
                content={richContent}
                onChange={setRichContent}
                placeholder="Share something with the community..."
                data-testid="editor-post-body"
              />
            </div>

            <div className="space-y-2">
              <Label>Media (optional)</Label>
              <FileUpload
                onUploadComplete={(url, type) => {
                  setMediaUrl(url);
                  setMediaType(type);
                }}
                onRemove={() => {
                  setMediaUrl(null);
                  setMediaType('none');
                }}
                currentUrl={mediaUrl || undefined}
                isAdmin={isAdmin}
              />
              <p className="text-sm text-muted-foreground">
                Add an image or video to your post (max {isAdmin ? '500MB' : '100MB'})
              </p>
            </div>

            <div className="space-y-2">
              <Label>Link to Church (optional)</Label>
              <div className="flex gap-2">
                {selectedChurch ? (
                  <div className="flex-1">
                    <Badge
                      variant="secondary"
                      className="text-sm px-3 py-2 w-full justify-between"
                      data-testid="badge-selected-church"
                    >
                      <span className="flex items-center gap-2">
                        <Building2 className="w-4 h-4" />
                        {selectedChurch.name}
                        {selectedChurch.city && (
                          <span className="text-muted-foreground">
                            • {selectedChurch.city}
                          </span>
                        )}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedChurch(null)}
                        className="h-auto p-0 hover:bg-transparent"
                        data-testid="button-remove-church"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </Badge>
                  </div>
                ) : (
                  <Popover open={churchSearchOpen} onOpenChange={setChurchSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 justify-start"
                        data-testid="button-select-church"
                      >
                        <Building2 className="w-4 h-4 mr-2" />
                        Select a church...
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Search churches..."
                          value={churchSearchQuery}
                          onValueChange={setChurchSearchQuery}
                          data-testid="input-search-churches"
                        />
                        <CommandList>
                          {churchSearchQuery.length < 2 ? (
                            <CommandEmpty>Type at least 2 characters to search...</CommandEmpty>
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
                                  data-testid={`option-church-${church.id}`}
                                >
                                  <Building2 className="w-4 h-4 mr-2" />
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">{church.name}</div>
                                    {(church.city || church.denomination) && (
                                      <div className="text-sm text-muted-foreground truncate">
                                        {[church.denomination, church.city, church.state]
                                          .filter(Boolean)
                                          .join(" • ")}
                                      </div>
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
              </div>
              <p className="text-sm text-muted-foreground">
                Tag a church to link your post to their profile
              </p>
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button
                type="submit"
                disabled={!extractPlainText(richContent).trim() || createPostMutation.isPending}
                data-testid="button-publish"
              >
                {createPostMutation.isPending ? "Publishing..." : "Publish Post"}
              </Button>
              <Button
                type="button"
                variant="outline"
                asChild
                data-testid="button-cancel"
              >
                <Link href={communityLink}>Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
