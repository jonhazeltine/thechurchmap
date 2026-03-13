import { useState } from "react";
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

interface AddMinistryAreaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddMinistryAreaDialog({ open, onOpenChange }: AddMinistryAreaDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [type, setType] = useState<"neighborhood" | "corridor" | "church">("church");
  const [churchId, setChurchId] = useState<string | null>(null);
  const [callingType, setCallingType] = useState<"place" | "people" | "problem" | "purpose" | null>(null);

  const { data: churches = [] } = useQuery<ChurchWithCallings[]>({
    queryKey: ["/api/churches"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/ministry-areas", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ministry-areas"] });
      toast({
        title: "Ministry area created",
        description: "The ministry area has been added successfully.",
      });
      handleClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setName("");
    setType("church");
    setChurchId(null);
    setCallingType(null);
    onOpenChange(false);
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast({
        title: "Validation error",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate({
      name: name.trim(),
      type,
      church_id: churchId,
      calling_type: callingType,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-add-ministry-area">
        <DialogHeader>
          <DialogTitle>Add Ministry Area</DialogTitle>
          <DialogDescription>
            Create a new ministry area. You can add a map polygon later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="area-name">Name *</Label>
            <Input
              id="area-name"
              placeholder="e.g., Downtown, West Side, Youth Outreach"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-area-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="area-type">Type *</Label>
            <Select value={type} onValueChange={(v: any) => setType(v)}>
              <SelectTrigger id="area-type" data-testid="select-area-type">
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
            <Label htmlFor="calling-type">Calling Type (Optional)</Label>
            <Select value={callingType || "none"} onValueChange={(v) => setCallingType(v === "none" ? null : v as any)}>
              <SelectTrigger id="calling-type" data-testid="select-calling-type">
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
            <Label htmlFor="church">Assign to Church (Optional)</Label>
            <Select value={churchId || "none"} onValueChange={(v) => setChurchId(v === "none" ? null : v)}>
              <SelectTrigger id="church" data-testid="select-church">
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
          <Button variant="outline" onClick={handleClose} data-testid="button-cancel">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            data-testid="button-save-area"
          >
            {createMutation.isPending ? "Creating..." : "Create Area"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
