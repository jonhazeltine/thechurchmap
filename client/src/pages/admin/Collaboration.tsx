import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type CollaborationTagWithUsage,
  insertCollaborationTagSchema,
  updateCollaborationTagSchema,
} from "@shared/schema";
import { Plus, Pencil, Trash2, AlertTriangle, Save, X } from "lucide-react";

export default function AdminCollaboration() {
  const { toast } = useToast();

  // Tag state
  const [createTagDialogOpen, setCreateTagDialogOpen] = useState(false);
  const [editTagDialogOpen, setEditTagDialogOpen] = useState(false);
  const [deleteTagDialogOpen, setDeleteTagDialogOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<CollaborationTagWithUsage | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagLabel, setEditingTagLabel] = useState("");
  const [tagSearchTerm, setTagSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");

  // Tag form state
  const [tagSlug, setTagSlug] = useState("");
  const [tagLabel, setTagLabel] = useState("");
  const [tagDescription, setTagDescription] = useState("");
  const [tagSortOrder, setTagSortOrder] = useState(0);

  // Fetch tags
  const { data: allTags = [], isLoading: tagsLoading } = useQuery<CollaborationTagWithUsage[]>({
    queryKey: ["/api/admin/collaboration/tags"],
  });

  // Filter tags by search term and active status
  const tags = allTags.filter(tag => {
    const matchesSearch = tagSearchTerm === "" || 
      tag.label.toLowerCase().includes(tagSearchTerm.toLowerCase()) ||
      tag.slug.toLowerCase().includes(tagSearchTerm.toLowerCase());
    const matchesActive = activeFilter === "all" || 
      (activeFilter === "active" && tag.is_active) ||
      (activeFilter === "inactive" && !tag.is_active);
    return matchesSearch && matchesActive;
  });

  // ============= TAG MUTATIONS =============

  const createTagMutation = useMutation({
    mutationFn: (data: { slug: string; label: string; description?: string; sort_order: number }) =>
      apiRequest("POST", "/api/admin/collaboration/tags", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collaboration/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration-taxonomy"] });
      setCreateTagDialogOpen(false);
      resetTagForm();
      toast({
        title: "Success",
        description: "Tag created successfully",
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

  const updateTagMutation = useMutation({
    mutationFn: (data: { id: string; label?: string; description?: string; sort_order?: number }) =>
      apiRequest("PATCH", `/api/admin/collaboration/tags/${data.id}`, {
        label: data.label,
        description: data.description,
        sort_order: data.sort_order,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collaboration/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration-taxonomy"] });
      setEditTagDialogOpen(false);
      setEditingTagId(null);
      setSelectedTag(null);
      resetTagForm();
      toast({
        title: "Success",
        description: "Tag updated successfully",
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

  const toggleTagActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      apiRequest("PATCH", `/api/admin/collaboration/tags/${id}`, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collaboration/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration-taxonomy"] });
      toast({
        title: "Success",
        description: "Tag status updated successfully",
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

  const deleteTagMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/collaboration/tags/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collaboration/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration-taxonomy"] });
      setDeleteTagDialogOpen(false);
      setSelectedTag(null);
      toast({
        title: "Success",
        description: "Tag archived successfully",
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

  // ============= TAG HANDLERS =============

  const resetTagForm = () => {
    setTagSlug("");
    setTagLabel("");
    setTagDescription("");
    setTagSortOrder(0);
  };

  const handleCreateTag = () => {
    try {
      const validatedData = insertCollaborationTagSchema.parse({
        slug: tagSlug,
        label: tagLabel,
        description: tagDescription || undefined,
        sort_order: tagSortOrder,
      });
      createTagMutation.mutate(validatedData);
    } catch (error: any) {
      toast({
        title: "Validation Error",
        description: error.errors?.[0]?.message || "Invalid form data",
        variant: "destructive",
      });
    }
  };

  const handleEditTag = (tag: CollaborationTagWithUsage) => {
    setSelectedTag(tag);
    setTagSlug(tag.slug);
    setTagLabel(tag.label);
    setTagDescription(tag.description || "");
    setTagSortOrder(tag.sort_order);
    setEditTagDialogOpen(true);
  };

  const handleUpdateTag = () => {
    if (!selectedTag) return;
    try {
      const validatedData = updateCollaborationTagSchema.parse({
        label: tagLabel,
        description: tagDescription || undefined,
        sort_order: tagSortOrder,
      });
      updateTagMutation.mutate({ id: selectedTag.id, ...validatedData });
    } catch (error: any) {
      toast({
        title: "Validation Error",
        description: error.errors?.[0]?.message || "Invalid form data",
        variant: "destructive",
      });
    }
  };

  const handleToggleTagActive = (tag: CollaborationTagWithUsage) => {
    toggleTagActiveMutation.mutate({
      id: tag.id,
      is_active: !tag.is_active,
    });
  };

  const handleDeleteTag = (tag: CollaborationTagWithUsage) => {
    setSelectedTag(tag);
    setDeleteTagDialogOpen(true);
  };

  const confirmDeleteTag = () => {
    if (!selectedTag) return;
    deleteTagMutation.mutate(selectedTag.id);
  };

  const startEditTagLabel = (tag: CollaborationTagWithUsage) => {
    setEditingTagId(tag.id);
    setEditingTagLabel(tag.label);
  };

  const saveInlineTagLabel = () => {
    if (!editingTagId) return;
    updateTagMutation.mutate({
      id: editingTagId,
      label: editingTagLabel,
    });
  };

  const cancelInlineTagEdit = () => {
    setEditingTagId(null);
    setEditingTagLabel("");
  };

  return (
    <AdminLayout>
      <div className="p-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Manage Collaboration Tags</h1>
          <p className="text-muted-foreground mt-1">
            Configure collaboration tags for church profiles (used in both "We Offer" and "We Need" sections)
          </p>
        </div>

        {/* TAGS LIST */}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 flex-wrap flex-1">
              <p className="text-sm text-muted-foreground">
                {tags.length} {tags.length === 1 ? "tag" : "tags"}
              </p>
              <div className="flex-1 min-w-64 max-w-md">
                <Input
                  placeholder="Search tags..."
                  value={tagSearchTerm}
                  onChange={(e) => setTagSearchTerm(e.target.value)}
                  data-testid="input-tag-search"
                />
              </div>
              <Select value={activeFilter} onValueChange={setActiveFilter}>
                <SelectTrigger className="w-48" data-testid="select-active-filter">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tags</SelectItem>
                  <SelectItem value="active">Active Only</SelectItem>
                  <SelectItem value="inactive">Inactive Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => setCreateTagDialogOpen(true)} data-testid="button-create-tag">
              <Plus className="w-4 h-4 mr-2" />
              Create Tag
            </Button>
          </div>

          {tagsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Sort Order</TableHead>
                    <TableHead>Usage Count</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tags.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No tags found. Create your first tag to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    tags.map((tag) => (
                      <TableRow key={tag.id} data-testid={`row-tag-${tag.slug}`}>
                        <TableCell className="font-medium">
                          {editingTagId === tag.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={editingTagLabel}
                                onChange={(e) => setEditingTagLabel(e.target.value)}
                                className="h-8"
                                data-testid="input-inline-tag-label"
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={saveInlineTagLabel}
                                data-testid="button-save-inline-tag"
                              >
                                <Save className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={cancelInlineTagEdit}
                                data-testid="button-cancel-inline-tag"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <div
                              className="cursor-pointer hover:underline"
                              onClick={() => startEditTagLabel(tag)}
                              data-testid={`text-tag-label-${tag.slug}`}
                            >
                              {tag.label}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{tag.sort_order}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" data-testid={`badge-tag-usage-${tag.slug}`}>
                            {tag.usage_count}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={tag.is_active ? "default" : "outline"}
                            className="cursor-pointer hover-elevate"
                            onClick={() => handleToggleTagActive(tag)}
                            data-testid={`badge-tag-status-${tag.slug}`}
                          >
                            {tag.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditTag(tag)}
                              data-testid={`button-edit-tag-${tag.slug}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteTag(tag)}
                              data-testid={`button-delete-tag-${tag.slug}`}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* CREATE TAG DIALOG */}
      <Dialog open={createTagDialogOpen} onOpenChange={setCreateTagDialogOpen}>
        <DialogContent data-testid="dialog-create-tag">
          <DialogHeader>
            <DialogTitle>Create New Tag</DialogTitle>
            <DialogDescription>
              Add a new collaboration tag (used in both "We Offer" and "We Need" sections)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-tag-label">Label *</Label>
              <Input
                id="create-tag-label"
                value={tagLabel}
                onChange={(e) => setTagLabel(e.target.value)}
                placeholder="e.g., Youth / Students"
                data-testid="input-tag-label"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-tag-slug">Slug *</Label>
              <Input
                id="create-tag-slug"
                value={tagSlug}
                onChange={(e) => setTagSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="e.g., youth_students"
                data-testid="input-tag-slug"
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, and underscores only
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-tag-description">Description</Label>
              <Textarea
                id="create-tag-description"
                value={tagDescription}
                onChange={(e) => setTagDescription(e.target.value)}
                placeholder="Optional description"
                data-testid="textarea-tag-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-tag-sort-order">Sort Order</Label>
              <Input
                id="create-tag-sort-order"
                type="number"
                value={tagSortOrder}
                onChange={(e) => setTagSortOrder(parseInt(e.target.value) || 0)}
                data-testid="input-tag-sort-order"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateTagDialogOpen(false)}
              data-testid="button-cancel-create-tag"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateTag}
              disabled={createTagMutation.isPending}
              data-testid="button-submit-create-tag"
            >
              {createTagMutation.isPending ? "Creating..." : "Create Tag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDIT TAG DIALOG */}
      <Dialog open={editTagDialogOpen} onOpenChange={setEditTagDialogOpen}>
        <DialogContent data-testid="dialog-edit-tag">
          <DialogHeader>
            <DialogTitle>Edit Tag</DialogTitle>
            <DialogDescription>
              Update tag details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-tag-label">Label *</Label>
              <Input
                id="edit-tag-label"
                value={tagLabel}
                onChange={(e) => setTagLabel(e.target.value)}
                data-testid="input-edit-tag-label"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-tag-slug">Slug</Label>
              <Input
                id="edit-tag-slug"
                value={tagSlug}
                disabled
                className="bg-muted"
                data-testid="input-edit-tag-slug"
              />
              <p className="text-xs text-muted-foreground">
                Slug cannot be changed after creation
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-tag-description">Description</Label>
              <Textarea
                id="edit-tag-description"
                value={tagDescription}
                onChange={(e) => setTagDescription(e.target.value)}
                data-testid="textarea-edit-tag-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-tag-sort-order">Sort Order</Label>
              <Input
                id="edit-tag-sort-order"
                type="number"
                value={tagSortOrder}
                onChange={(e) => setTagSortOrder(parseInt(e.target.value) || 0)}
                data-testid="input-edit-tag-sort-order"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditTagDialogOpen(false)}
              data-testid="button-cancel-edit-tag"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateTag}
              disabled={updateTagMutation.isPending}
              data-testid="button-submit-edit-tag"
            >
              {updateTagMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE TAG DIALOG */}
      <AlertDialog open={deleteTagDialogOpen} onOpenChange={setDeleteTagDialogOpen}>
        <AlertDialogContent data-testid="dialog-delete-tag">
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Tag</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedTag && selectedTag.usage_count > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-orange-600">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="font-semibold">Warning: Tag is in use</span>
                  </div>
                  <p>
                    This tag is used by <strong>{selectedTag.usage_count}</strong> church(es).
                  </p>
                  <p className="font-semibold">
                    This will affect BOTH "We Offer" and "We Need" selections for all churches.
                  </p>
                  <p>
                    Archiving it will hide it from new selections but preserve existing data.
                  </p>
                </div>
              ) : (
                <p>
                  This tag will be marked as inactive and hidden from new selections.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-tag">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteTag}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-tag"
            >
              Archive Tag
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
