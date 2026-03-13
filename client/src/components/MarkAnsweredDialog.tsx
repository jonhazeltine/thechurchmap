import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PartyPopper } from "lucide-react";

const markAnsweredSchema = z.object({
  answered_note: z.string().max(2000).optional(),
});

type MarkAnsweredFormData = z.infer<typeof markAnsweredSchema>;

interface MarkAnsweredDialogProps {
  prayerId: string;
  prayerTitle: string;
  onMarkAnswered: (prayerId: string, note?: string) => void;
  isProcessing?: boolean;
  triggerVariant?: "default" | "outline" | "ghost";
  triggerSize?: "default" | "sm" | "lg" | "icon";
}

export function MarkAnsweredDialog({
  prayerId,
  prayerTitle,
  onMarkAnswered,
  isProcessing = false,
  triggerVariant = "outline",
  triggerSize = "sm",
}: MarkAnsweredDialogProps) {
  const [open, setOpen] = useState(false);

  const form = useForm<MarkAnsweredFormData>({
    resolver: zodResolver(markAnsweredSchema),
    defaultValues: {
      answered_note: "",
    },
  });

  const handleSubmit = (data: MarkAnsweredFormData) => {
    onMarkAnswered(prayerId, data.answered_note || undefined);
    setOpen(false);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={triggerVariant}
          size={triggerSize}
          data-testid={`button-mark-answered-${prayerId}`}
          disabled={isProcessing}
        >
          <PartyPopper className="h-4 w-4 mr-1" />
          {isProcessing ? "..." : "Mark Answered"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PartyPopper className="h-5 w-5 text-yellow-500" />
            Mark Prayer as Answered
          </DialogTitle>
          <DialogDescription>
            Celebrate that God answered this prayer! Add an optional testimony or note about how it was answered.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Prayer</Label>
            <p className="text-sm font-medium">{prayerTitle}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="answered_note">Testimony / Note (optional)</Label>
            <Textarea
              id="answered_note"
              placeholder="Share how God answered this prayer..."
              {...form.register("answered_note")}
              rows={4}
              data-testid="textarea-answered-note"
            />
            <p className="text-xs text-muted-foreground">
              This will be visible when viewing the answered prayer.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              data-testid="button-cancel-mark-answered"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isProcessing}
              data-testid="button-confirm-mark-answered"
            >
              <PartyPopper className="h-4 w-4 mr-1" />
              {isProcessing ? "Marking..." : "Mark as Answered"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
