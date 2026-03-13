import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import type { ChurchWithCallings } from "@shared/schema";

interface EditMinistryAreaDialogProps {
  area: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditMinistryAreaDialog({ area, open, onOpenChange }: EditMinistryAreaDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState(area.name);
  const [type, setType] = useState<"neighborhood" | "corridor" | "church">(area.type);
  const [churchId, setChurchId] = useState<string | null>(area.church_id || null);
  const [callingType, setCallingType] = useState<"place" | "people" | "problem" | "purpose" | null>(
    area.calling_type || null
  );

  const { data: churches = [] } = useQuery<ChurchWithCallings[]>({
    queryKey: ["/api/churches"],
  });

  // Update form when area changes
  useEffect(() => {
    setName(area.name);
    setType(area.type);
    setChurchId(area.church_id || null);
    setCallingType(area.calling_type || null);
  }, [area]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PUT", `/api/ministry-areas/${area.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ministry-areas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ministry-areas", area.id] });
      toast({
        title: "Ministry area updated",
        description: "The ministry area has been updated successfully.",
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!name.trim()) {
      toast({
        title: "Validation error",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }

    updateMutation.mutate({
      name: name.trim(),
      type,
      church_id: churchId,
      calling_type: callingType,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-edit-ministry-area">
        <DialogHeader>
          <DialogTitle>Edit Ministry Area</DialogTitle>
          <DialogDescription>
            Update the ministry area details.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-area-name">Name *</Label>
            <Input
              id="edit-area-name"
              placeholder="e.g., Downtown, West Side, Youth Outreach"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-edit-area-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-area-type">Type *</Label>
            <Select value={type} onValueChange={(v: any) => setType(v)}>
              <SelectTrigger id="edit-area-type" data-testid="select-edit-area-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="church">Church Ministry Area</SelectItem>
                <SelectItem value="neighborhood">Neighborhood</SelectItem>
                <SelectItem value="corridor">Corridor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-calling-type">Calling Type (Optional)</Label>
            <Select value={callingType || "none"} onValueChange={(v) => setCallingType(v === "none" ? null : v as any)}>
              <SelectTrigger id="edit-calling-type" data-testid="select-edit-calling-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="place">Place</SelectItem>
                <SelectItem value="people">People</SelectItem>
                <SelectItem value="problem">Problem</SelectItem>
                <SelectItem value="purpose">Purpose</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-church">Assign to Church (Optional)</Label>
            <Select value={churchId || "none"} onValueChange={(v) => setChurchId(v === "none" ? null : v)}>
              <SelectTrigger id="edit-church" data-testid="select-edit-church">
                <SelectValue placeholder="Select a church..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No church</SelectItem>
                {churches.map((church) => (
                  <SelectItem key={church.id} value={church.id}>
                    {church.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-edit">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={updateMutation.isPending}
            data-testid="button-save-edit"
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
