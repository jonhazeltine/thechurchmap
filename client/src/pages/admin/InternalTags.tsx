import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
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
import { type InternalTagWithUsage } from "@shared/schema";
import { 
  Plus, Pencil, Trash2, AlertTriangle, Eye, EyeOff, Tag
} from "lucide-react";

// Available icons for internal tags (matches MapView PIN_ICON_SVGS)
const AVAILABLE_ICONS: { id: string; label: string; svg: string }[] = [
  { id: "anchor", label: "Anchor", svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C10.34 2 9 3.34 9 5c0 1.1.6 2.05 1.5 2.56V9H8v2h2.5v7.92C7.36 18.47 5 15.97 5 13H3c0 4.42 4.03 8 9 8s9-3.58 9-8h-2c0 2.97-2.36 5.47-5.5 5.92V11H16V9h-2.5V7.56C14.4 7.05 15 6.1 15 5c0-1.66-1.34-3-3-3zm0 2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z"/></svg>` },
  { id: "handshake", label: "Handshake", svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.22 19.85c-.18.18-.5.21-.71 0L6.91 15.3a3.67 3.67 0 0 1 0-5.18l3.05-3.06a1.5 1.5 0 0 1 2.12 0l.35.35.35-.35a1.5 1.5 0 0 1 2.12 0l3.05 3.06a3.67 3.67 0 0 1 0 5.18l-4.6 4.55c-.21.21-.53.18-.71 0l-.42-.42z"/></svg>` },
  { id: "bridge", label: "Bridge", svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 14v-2c0-1.1.45-2.1 1.17-2.83A3.98 3.98 0 0 1 11 8h2c1.1 0 2.1.45 2.83 1.17A3.98 3.98 0 0 1 17 12v2h3V8a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v6h3zm-3 2v4h4v-4H4zm12 0v4h4v-4h-4zm-6 0v4h4v-4h-4z"/></svg>` },
  { id: "link", label: "Link", svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 7h-4v2h4c1.65 0 3 1.35 3 3s-1.35 3-3 3h-4v2h4c2.76 0 5-2.24 5-5s-2.24-5-5-5zm-6 8H7c-1.65 0-3-1.35-3-3s1.35-3 3-3h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-2zm-3-4h8v2H8z"/></svg>` },
  { id: "unity", label: "Unity (Circles)", svg: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="16" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>` },
  { id: "flame", label: "Flame", svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg>` },
  { id: "cross", label: "Cross", svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 2h4v8h8v4h-8v8h-4v-8H2v-4h8V2z"/></svg>` },
  { id: "church", label: "Church", svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3L4 9v12h5v-5c0-1.66 1.34-3 3-3s3 1.34 3 3v5h5V9l-8-6zm0 2.5l1 .75V8h-2V6.25l1-.75zM12 10a1.5 1.5 0 110 3 1.5 1.5 0 010-3z"/></svg>` },
  { id: "heart", label: "Heart", svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.248c-3.148-5.402-12-3.825-12 2.944 0 4.661 5.571 9.427 12 15.808 6.43-6.381 12-11.147 12-15.808 0-6.792-8.875-8.306-12-2.944z"/></svg>` },
  { id: "star", label: "Star", svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>` },
  { id: "shield", label: "Shield", svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>` },
  { id: "people", label: "People", svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>` },
  { id: "globe", label: "Globe", svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>` },
  { id: "book", label: "Book", svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>` },
  { id: "home", label: "Home", svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>` },
  { id: "dove", label: "Dove", svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-1.27 0-2.4.8-2.82 2H3v2h1.95L2 14c-.21 2 1.79 4 4 4h1v3h2v-3h2v3h2v-3h1c2.21 0 4.21-2 4-4l-2.95-7H17V5h-6.18C10.4 3.8 9.27 3 8 3h4z"/></svg>` },
  { id: "sun", label: "Sun", svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z"/></svg>` },
  { id: "crown", label: "Crown", svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/></svg>` },
  { id: "lamp", label: "Lamp", svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/></svg>` },
  { id: "food", label: "Food", svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.06 22.99h1.66c.84 0 1.53-.64 1.63-1.46L23 5.05l-5 2v6.06c0 .86-.78 1.48-1.62 1.28-1.25-.29-2.29-1.08-2.87-2.14-2.8 2.64-6.51 2.81-9.51.61V4.03h4c2.76 0 5 2.24 5 5v8.96c.68 1.11 1.4 2.23 2.06 3zm-9-13.96h-6v6h6v-6z"/></svg>` },
  { id: "medical", label: "Medical", svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>` },
  { id: "truck", label: "Truck", svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>` },
  { id: "water", label: "Water", svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8z"/></svg>` },
];

// Helper to render icon SVG for display
function IconPreview({ iconId, className = "" }: { iconId: string; className?: string }) {
  const icon = AVAILABLE_ICONS.find(i => i.id === iconId);
  if (!icon) return <Tag className={className} />;
  return <span className={className} dangerouslySetInnerHTML={{ __html: icon.svg }} />;
}

const PRESET_COLORS = [
  { hex: "#EF4444", label: "Red" },
  { hex: "#F97316", label: "Orange" },
  { hex: "#EAB308", label: "Yellow" },
  { hex: "#22C55E", label: "Green" },
  { hex: "#14B8A6", label: "Teal" },
  { hex: "#3B82F6", label: "Blue" },
  { hex: "#8B5CF6", label: "Purple" },
  { hex: "#EC4899", label: "Pink" },
  { hex: "#6B7280", label: "Gray" },
  { hex: "#1F2937", label: "Dark" },
];

export default function AdminInternalTags() {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<InternalTagWithUsage | null>(null);
  
  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [colorHex, setColorHex] = useState("#3B82F6");
  const [iconKey, setIconKey] = useState("cross");
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);

  // Fetch all internal tags with usage count
  const { data: tags = [], isLoading } = useQuery<InternalTagWithUsage[]>({
    queryKey: ["/api/admin/internal-tags"],
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: { 
      name: string; 
      slug: string; 
      description?: string; 
      color_hex: string; 
      icon_key: string;
      is_active: boolean;
      sort_order: number;
    }) => apiRequest("POST", "/api/admin/internal-tags", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/internal-tags"] });
      setCreateDialogOpen(false);
      resetForm();
      toast({
        title: "Success",
        description: "Internal tag created successfully",
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

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: { 
      id: string; 
      name: string; 
      slug: string;
      description?: string; 
      color_hex: string; 
      icon_key: string;
      is_active: boolean;
      sort_order: number;
    }) => apiRequest("PATCH", `/api/admin/internal-tags/${data.id}`, {
        name: data.name,
        slug: data.slug,
        description: data.description,
        color_hex: data.color_hex,
        icon_key: data.icon_key,
        is_active: data.is_active,
        sort_order: data.sort_order,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/internal-tags"] });
      setEditDialogOpen(false);
      setSelectedTag(null);
      resetForm();
      toast({
        title: "Success",
        description: "Internal tag updated successfully",
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

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/internal-tags/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/internal-tags"] });
      setDeleteDialogOpen(false);
      setSelectedTag(null);
      toast({
        title: "Success",
        description: "Internal tag deleted successfully",
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

  const resetForm = () => {
    setName("");
    setSlug("");
    setDescription("");
    setColorHex("#3B82F6");
    setIconKey("cross");
    setIsActive(true);
    setSortOrder(0);
  };

  const openEditDialog = (tag: InternalTagWithUsage) => {
    setSelectedTag(tag);
    setName(tag.name);
    setSlug(tag.slug);
    setDescription(tag.description || "");
    setColorHex(tag.color_hex);
    setIconKey(tag.icon_key);
    setIsActive(tag.is_active);
    setSortOrder(tag.sort_order);
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (tag: InternalTagWithUsage) => {
    setSelectedTag(tag);
    setDeleteDialogOpen(true);
  };

  const handleCreate = () => {
    createMutation.mutate({
      name,
      slug,
      description: description || undefined,
      color_hex: colorHex,
      icon_key: iconKey,
      is_active: isActive,
      sort_order: sortOrder,
    });
  };

  const handleUpdate = () => {
    if (!selectedTag) return;
    updateMutation.mutate({
      id: selectedTag.id,
      name,
      slug,
      description: description || undefined,
      color_hex: colorHex,
      icon_key: iconKey,
      is_active: isActive,
      sort_order: sortOrder,
    });
  };

  const handleDelete = () => {
    if (!selectedTag) return;
    deleteMutation.mutate(selectedTag.id);
  };

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    setName(value);
    // Only auto-generate slug if it hasn't been manually edited
    const generatedSlug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    setSlug(generatedSlug);
  };

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold" data-testid="text-page-title">Internal Tags</h1>
            <Button onClick={() => { resetForm(); setCreateDialogOpen(true); }} data-testid="button-create-tag" size="sm" className="shrink-0">
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Create Tag</span>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Invisible admin-only tags for internal church labeling. When filtered, they change map pin colors and icons.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : tags.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Tag className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No internal tags yet.</p>
            <p className="text-sm">Create your first tag to start labeling churches.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Icon</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-center">Usage</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Order</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tags.map((tag) => (
                  <TableRow key={tag.id} data-testid={`row-tag-${tag.id}`}>
                    <TableCell>
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: tag.color_hex }}
                      >
                        <IconPreview iconId={tag.icon_key} className="w-4 h-4 text-white [&>svg]:w-4 [&>svg]:h-4 [&>svg]:fill-white" />
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{tag.name}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{tag.slug}</code>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground text-sm">
                      {tag.description || "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{tag.usage_count}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {tag.is_active ? (
                        <Badge variant="default" className="bg-green-600">
                          <Eye className="w-3 h-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <EyeOff className="w-3 h-3 mr-1" />
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {tag.sort_order}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(tag)}
                          data-testid={`button-edit-tag-${tag.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDeleteDialog(tag)}
                          className="text-destructive hover:text-destructive"
                          data-testid={`button-delete-tag-${tag.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Create Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
            <DialogHeader className="pb-2">
              <DialogTitle>Create Internal Tag</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="name" className="text-xs">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Priority Partner"
                    className="h-8"
                    data-testid="input-tag-name"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="slug" className="text-xs">Slug</Label>
                  <Input
                    id="slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="priority-partner"
                    className="h-8"
                    data-testid="input-tag-slug"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="description" className="text-xs">Description (optional)</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this tag mean?"
                  className="h-8"
                  data-testid="input-tag-description"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Color</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color.hex}
                      type="button"
                      className={`w-5 h-5 rounded-full border-2 transition-all ${
                        colorHex === color.hex ? 'border-foreground scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color.hex }}
                      onClick={() => setColorHex(color.hex)}
                      title={color.label}
                      data-testid={`button-color-${color.hex}`}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Icon</Label>
                <div className="grid grid-cols-7 gap-1.5">
                  {AVAILABLE_ICONS.map((icon) => (
                    <button
                      key={icon.id}
                      type="button"
                      className={`w-7 h-7 rounded flex items-center justify-center border transition-all ${
                        iconKey === icon.id 
                          ? 'border-foreground bg-muted scale-105' 
                          : 'border-transparent hover:bg-muted/50'
                      }`}
                      onClick={() => setIconKey(icon.id)}
                      title={icon.label}
                      data-testid={`button-icon-${icon.id}`}
                    >
                      <span 
                        className="w-4 h-4 [&>svg]:w-4 [&>svg]:h-4 [&>svg]:fill-current" 
                        dangerouslySetInnerHTML={{ __html: icon.svg }} 
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Preview</Label>
                <div className="flex items-center gap-2">
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: colorHex }}
                  >
                    <IconPreview iconId={iconKey} className="w-4 h-4 [&>svg]:w-4 [&>svg]:h-4 [&>svg]:fill-white" />
                  </div>
                  <Badge className="text-xs" style={{ backgroundColor: colorHex, color: 'white' }}>
                    {name || "Tag"}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="space-y-1 w-20">
                  <Label htmlFor="sortOrder" className="text-xs">Order</Label>
                  <Input
                    id="sortOrder"
                    type="number"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
                    className="h-8"
                    data-testid="input-tag-order"
                  />
                </div>
                <div className="flex items-center gap-2 pt-4">
                  <Switch
                    checked={isActive}
                    onCheckedChange={setIsActive}
                    data-testid="switch-tag-active"
                  />
                  <span className="text-xs text-muted-foreground">
                    {isActive ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button variant="outline" size="sm" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                size="sm"
                onClick={handleCreate} 
                disabled={!name || !slug || createMutation.isPending}
                data-testid="button-save-tag"
              >
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
            <DialogHeader className="pb-2">
              <DialogTitle>Edit Internal Tag</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="edit-name" className="text-xs">Name</Label>
                  <Input
                    id="edit-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-8"
                    data-testid="input-edit-tag-name"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-slug" className="text-xs">Slug</Label>
                  <Input
                    id="edit-slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    className="h-8"
                    data-testid="input-edit-tag-slug"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-description" className="text-xs">Description (optional)</Label>
                <Input
                  id="edit-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this tag mean?"
                  className="h-8"
                  data-testid="input-edit-tag-description"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Color</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color.hex}
                      type="button"
                      className={`w-5 h-5 rounded-full border-2 transition-all ${
                        colorHex === color.hex ? 'border-foreground scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color.hex }}
                      onClick={() => setColorHex(color.hex)}
                      title={color.label}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Icon</Label>
                <div className="grid grid-cols-7 gap-1.5">
                  {AVAILABLE_ICONS.map((icon) => (
                    <button
                      key={icon.id}
                      type="button"
                      className={`w-7 h-7 rounded flex items-center justify-center border transition-all ${
                        iconKey === icon.id 
                          ? 'border-foreground bg-muted scale-105' 
                          : 'border-transparent hover:bg-muted/50'
                      }`}
                      onClick={() => setIconKey(icon.id)}
                      title={icon.label}
                    >
                      <span 
                        className="w-4 h-4 [&>svg]:w-4 [&>svg]:h-4 [&>svg]:fill-current" 
                        dangerouslySetInnerHTML={{ __html: icon.svg }} 
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Preview</Label>
                <div className="flex items-center gap-2">
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: colorHex }}
                  >
                    <IconPreview iconId={iconKey} className="w-4 h-4 [&>svg]:w-4 [&>svg]:h-4 [&>svg]:fill-white" />
                  </div>
                  <Badge className="text-xs" style={{ backgroundColor: colorHex, color: 'white' }}>
                    {name || "Tag"}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="space-y-1 w-20">
                  <Label htmlFor="edit-sortOrder" className="text-xs">Order</Label>
                  <Input
                    id="edit-sortOrder"
                    type="number"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
                    className="h-8"
                    data-testid="input-edit-tag-order"
                  />
                </div>
                <div className="flex items-center gap-2 pt-4">
                  <Switch
                    checked={isActive}
                    onCheckedChange={setIsActive}
                    data-testid="switch-edit-tag-active"
                  />
                  <span className="text-xs text-muted-foreground">
                    {isActive ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                size="sm"
                onClick={handleUpdate} 
                disabled={!name || !slug || updateMutation.isPending}
                data-testid="button-update-tag"
              >
                {updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Internal Tag</AlertDialogTitle>
              <AlertDialogDescription>
                {selectedTag && selectedTag.usage_count > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-amber-600">
                      <AlertTriangle className="w-5 h-5" />
                      <span className="font-medium">Warning: This tag is in use</span>
                    </div>
                    <p>
                      This tag is currently assigned to <strong>{selectedTag.usage_count}</strong> church(es).
                      Deleting it will remove all assignments.
                    </p>
                  </div>
                ) : (
                  <p>Are you sure you want to delete the tag "{selectedTag?.name}"? This action cannot be undone.</p>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete-tag"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete Tag"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
}
