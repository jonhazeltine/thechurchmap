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
import { type Calling, type CallingType, callingTypes } from "@shared/schema";
import { Plus, Pencil, Trash2, AlertTriangle } from "lucide-react";

interface CallingWithUsage extends Calling {
  usage_count: number;
}

export default function AdminCallings() {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCalling, setSelectedCalling] = useState<CallingWithUsage | null>(null);
  
  // Form state
  const [name, setName] = useState("");
  const [type, setType] = useState<CallingType>("place");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#2E86AB");

  // Fetch all callings with usage count
  const { data: callings = [], isLoading } = useQuery<CallingWithUsage[]>({
    queryKey: ["/api/admin/callings"],
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: { name: string; type: CallingType; description: string; color: string }) =>
      apiRequest("POST", "/api/admin/callings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/callings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/callings"] });
      setCreateDialogOpen(false);
      resetForm();
      toast({
        title: "Success",
        description: "Calling created successfully",
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
    mutationFn: (data: { id: string; name: string; type: CallingType; description: string; color: string }) =>
      apiRequest("PATCH", `/api/admin/callings/${data.id}`, {
        name: data.name,
        type: data.type,
        description: data.description,
        color: data.color,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/callings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/callings"] });
      setEditDialogOpen(false);
      setSelectedCalling(null);
      resetForm();
      toast({
        title: "Success",
        description: "Calling updated successfully",
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
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/callings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/callings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/callings"] });
      setDeleteDialogOpen(false);
      setSelectedCalling(null);
      toast({
        title: "Success",
        description: "Calling deleted successfully",
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
    setType("place");
    setDescription("");
    setColor("#2E86AB");
  };

  const handleCreate = () => {
    if (!name.trim()) {
      toast({
        title: "Validation Error",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate({ name, type, description, color });
  };

  const handleEdit = (calling: CallingWithUsage) => {
    setSelectedCalling(calling);
    setName(calling.name);
    setType(calling.type);
    setDescription(calling.description || "");
    setColor(calling.color || "#2E86AB");
    setEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (!selectedCalling) return;
    if (!name.trim()) {
      toast({
        title: "Validation Error",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate({ id: selectedCalling.id, name, type, description, color });
  };

  const handleDelete = (calling: CallingWithUsage) => {
    setSelectedCalling(calling);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (!selectedCalling) return;
    deleteMutation.mutate(selectedCalling.id);
  };

  const getTypeLabel = (type: CallingType) => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const getTypeBadgeVariant = (type: CallingType) => {
    switch (type) {
      case "place": return "default";
      case "people": return "secondary";
      case "problem": return "outline";
      case "purpose": return "default";
      default: return "default";
    }
  };

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold" data-testid="text-page-title">Manage Callings</h1>
            <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-add-calling" size="sm" className="shrink-0">
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Add Calling</span>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Add, edit, or remove calling types and collaboration categories
          </p>
        </div>

        {isLoading ? (
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
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {callings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No callings found. Create your first calling to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  callings.map((calling) => (
                    <TableRow key={calling.id} data-testid={`row-calling-${calling.id}`}>
                      <TableCell className="font-medium">{calling.name}</TableCell>
                      <TableCell>
                        <Badge variant={getTypeBadgeVariant(calling.type)}>
                          {getTypeLabel(calling.type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-md truncate">
                        {calling.description || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded border"
                            style={{ backgroundColor: calling.color || "#94a3b8" }}
                          />
                          <span className="text-xs text-muted-foreground">
                            {calling.color || "Default"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{calling.usage_count}</span>
                          <span className="text-sm text-muted-foreground">
                            {calling.usage_count === 1 ? "church" : "churches"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(calling)}
                            data-testid={`button-edit-calling-${calling.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(calling)}
                            data-testid={`button-delete-calling-${calling.id}`}
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

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent data-testid="dialog-create-calling">
          <DialogHeader>
            <DialogTitle>Create New Calling</DialogTitle>
            <DialogDescription>
              Add a new calling type or collaboration category
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Name *</Label>
              <Input
                id="create-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Youth Ministry"
                data-testid="input-calling-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-type">Type *</Label>
              <Select value={type} onValueChange={(val) => setType(val as CallingType)}>
                <SelectTrigger id="create-type" data-testid="select-calling-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {callingTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {getTypeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-description">Description</Label>
              <Textarea
                id="create-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this calling"
                rows={3}
                data-testid="input-calling-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-color">Color</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="create-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-20 h-10 cursor-pointer"
                  data-testid="input-create-color"
                />
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#000000"
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateDialogOpen(false);
                resetForm();
              }}
              data-testid="button-cancel-create"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              data-testid="button-create-calling"
            >
              {createMutation.isPending ? "Creating..." : "Create Calling"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent data-testid="dialog-edit-calling">
          <DialogHeader>
            <DialogTitle>Edit Calling</DialogTitle>
            <DialogDescription>
              {selectedCalling && selectedCalling.usage_count > 0 && (
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500 mt-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>
                    This calling is used by {selectedCalling.usage_count}{" "}
                    {selectedCalling.usage_count === 1 ? "church" : "churches"}. Changes will affect all churches.
                  </span>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Youth Ministry"
                data-testid="input-edit-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-type">Type *</Label>
              <Select value={type} onValueChange={(val) => setType(val as CallingType)}>
                <SelectTrigger id="edit-type" data-testid="select-edit-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {callingTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {getTypeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this calling"
                rows={3}
                data-testid="input-edit-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-color">Color</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="edit-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-20 h-10 cursor-pointer"
                  data-testid="input-edit-color"
                />
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#000000"
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false);
                setSelectedCalling(null);
                resetForm();
              }}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending}
              data-testid="button-update-calling"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent data-testid="dialog-delete-calling">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Calling</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedCalling && selectedCalling.usage_count > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 text-destructive">
                    <AlertTriangle className="w-5 h-5 mt-0.5" />
                    <div>
                      <p className="font-semibold">Warning: This calling is in use!</p>
                      <p className="mt-1">
                        This calling is currently used by {selectedCalling.usage_count}{" "}
                        {selectedCalling.usage_count === 1 ? "church" : "churches"}.
                      </p>
                    </div>
                  </div>
                  <p className="text-foreground">
                    Deleting it will remove it from all churches. This action cannot be undone.
                  </p>
                </div>
              ) : (
                "Are you sure you want to delete this calling? This action cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
