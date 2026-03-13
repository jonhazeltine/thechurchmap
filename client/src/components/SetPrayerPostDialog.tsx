import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown, Hand, AlertTriangle, Loader2, Info, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { AddChurchPrayerSection } from "@/components/AddChurchPrayerSection";
import { usePlatformContext } from "@/contexts/PlatformContext";
import type { ChurchSummary } from "@shared/schema";

interface SetPrayerPostDialogProps {
  postId: string;
  postTitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface ExistingPrayerPost {
  id: string;
  title: string;
  author?: {
    id: string;
    full_name: string;
  };
  created_at: string;
}

export function SetPrayerPostDialog({
  postId,
  postTitle,
  open,
  onOpenChange,
  onSuccess,
}: SetPrayerPostDialogProps) {
  const { toast } = useToast();
  const { platformId } = usePlatformContext();
  const [selectedChurch, setSelectedChurch] = useState<ChurchSummary | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [existingPost, setExistingPost] = useState<ExistingPrayerPost | null>(null);

  const { data: churches, isLoading: isLoadingChurches } = useQuery<ChurchSummary[]>({
    queryKey: ['/api/churches/search', searchQuery],
    queryFn: async () => {
      const response = await fetch(`/api/churches/search?q=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) throw new Error('Failed to search churches');
      return response.json();
    },
    enabled: open && searchQuery.length >= 2,
  });

  const { data: existingPrayerPostInfo, isLoading: isCheckingExisting } = useQuery<{
    exists: boolean;
    existingPost: ExistingPrayerPost | null;
  }>({
    queryKey: ['/api/posts', postId, 'set-prayer-post', selectedChurch?.id],
    queryFn: async () => {
      if (!selectedChurch) return { exists: false, existingPost: null };
      const response = await fetch(`/api/posts/${postId}/set-prayer-post?churchId=${selectedChurch.id}`);
      return response.json();
    },
    enabled: !!selectedChurch,
  });

  const setPrayerPostMutation = useMutation({
    mutationFn: async (confirmReplace: boolean) => {
      if (!selectedChurch) throw new Error('No church selected');
      return apiRequest('POST', `/api/posts/${postId}/set-prayer-post`, {
        churchId: selectedChurch.id,
        confirmReplace,
      });
    },
    onSuccess: (data: any) => {
      if (data.requiresConfirmation) {
        setExistingPost(data.existingPost);
        setShowConfirmDialog(true);
        return;
      }

      toast({
        title: "Prayer Post Set",
        description: data.message || `This post is now the prayer post for ${selectedChurch?.name}.`,
      });

      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/posts', postId] });

      onOpenChange(false);
      setSelectedChurch(null);
      onSuccess?.();
    },
    onError: (error: any) => {
      if (error.requiresConfirmation) {
        setExistingPost(error.existingPost);
        setShowConfirmDialog(true);
        return;
      }

      toast({
        title: "Error",
        description: error.message || "Failed to set prayer post",
        variant: "destructive",
      });
    },
  });

  const handleSetPrayerPost = () => {
    if (!selectedChurch) {
      toast({
        title: "Error",
        description: "Please select a church",
        variant: "destructive",
      });
      return;
    }
    setPrayerPostMutation.mutate(false);
  };

  const handleConfirmReplace = () => {
    setShowConfirmDialog(false);
    setPrayerPostMutation.mutate(true);
  };

  const handleClose = () => {
    onOpenChange(false);
    setSelectedChurch(null);
    setSearchQuery("");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Hand className="w-5 h-5 text-amber-500" />
              Set as Prayer Post
            </DialogTitle>
            <DialogDescription>
              Designate this post as the official prayer post for a church. All prayers and encouragements for that church will be gathered here.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {postTitle && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">Post:</p>
                <p className="text-sm text-muted-foreground line-clamp-2">{postTitle}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Select Church</Label>
              <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={searchOpen}
                    className="w-full justify-between"
                    data-testid="button-select-church"
                  >
                    {selectedChurch ? (
                      <span className="truncate">
                        {selectedChurch.name}
                        {selectedChurch.city && `, ${selectedChurch.city}`}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Search for a church...</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Type to search churches..."
                      value={searchQuery}
                      onValueChange={setSearchQuery}
                      data-testid="input-church-search"
                    />
                    <CommandList>
                      {searchQuery.length < 2 && (
                        <CommandEmpty>Type at least 2 characters to search...</CommandEmpty>
                      )}
                      {searchQuery.length >= 2 && isLoadingChurches && (
                        <CommandEmpty>Searching...</CommandEmpty>
                      )}
                      {searchQuery.length >= 2 && !isLoadingChurches && (!churches || churches.length === 0) && (
                        <CommandEmpty>No churches found.</CommandEmpty>
                      )}
                      <CommandGroup>
                        {churches?.map((church) => (
                          <CommandItem
                            key={church.id}
                            value={church.id}
                            onSelect={() => {
                              setSelectedChurch(church);
                              setSearchOpen(false);
                            }}
                            data-testid={`church-option-${church.id}`}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedChurch?.id === church.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col">
                              <span>{church.name}</span>
                              {church.city && (
                                <span className="text-xs text-muted-foreground">
                                  {church.city}, {church.state}
                                </span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {selectedChurch && existingPrayerPostInfo?.exists && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                <div className="flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      Existing Prayer Post Found
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      {selectedChurch.name} already has a prayer post: "{existingPrayerPostInfo.existingPost?.title}". 
                      Setting this post will replace the existing one.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex gap-2">
                <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    What happens when you set a prayer post:
                  </p>
                  <ul className="text-xs text-blue-700 dark:text-blue-300 list-disc list-inside space-y-0.5">
                    <li>All new prayers for this church will appear as comments here</li>
                    <li>Encouragement messages will be gathered on this post</li>
                    <li>This post will appear with amber/gold styling in the community feed</li>
                    <li>Activity will cause this post to rise in the feed</li>
                  </ul>
                </div>
              </div>
            </div>

            {selectedChurch && (
              <div className="pt-2 border-t border-border/50">
                <div className="flex items-center gap-2 mb-3">
                  <Megaphone className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                    Add Church Prayer Needs (Optional)
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Add specific prayer requests that will appear as mini-cards on the prayer post.
                </p>
                <AddChurchPrayerSection
                  churchId={selectedChurch.id}
                  churchName={selectedChurch.name}
                  cityPlatformId={platformId}
                  compact
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose} data-testid="button-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleSetPrayerPost}
              disabled={!selectedChurch || setPrayerPostMutation.isPending || isCheckingExisting}
              className="bg-amber-500 hover:bg-amber-600 text-white"
              data-testid="button-set-prayer-post"
            >
              {setPrayerPostMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Setting...
                </>
              ) : (
                <>
                  <Hand className="w-4 h-4 mr-2" />
                  Set as Prayer Post
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" />
              Replace Existing Prayer Post?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                <strong>{selectedChurch?.name}</strong> already has a prayer post:
              </p>
              <p className="p-2 bg-muted rounded text-foreground">
                "{existingPost?.title}"
              </p>
              <p>
                Setting this post as the new prayer post will remove the prayer post designation 
                from the existing post. The old post will remain as a regular community post, 
                but new prayers and encouragements will go to this post instead.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-replace">Keep Existing</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmReplace}
              className="bg-amber-500 hover:bg-amber-600 text-white"
              data-testid="button-confirm-replace"
            >
              Replace Prayer Post
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
