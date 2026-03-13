import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, Heart, Users } from "lucide-react";

interface PrayerBudgetWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  churchId: string;
  churchName?: string;
  onComplete?: () => void;
}

export function PrayerBudgetWizard({
  open,
  onOpenChange,
  churchId,
  churchName,
  onComplete,
}: PrayerBudgetWizardProps) {
  const { toast } = useToast();
  const [dailyCount, setDailyCount] = useState<number>(0);
  const [fewTimesCount, setFewTimesCount] = useState<number>(0);
  const [weeklyCount, setWeeklyCount] = useState<number>(0);

  const { data: existingBudget } = useQuery<{ daily_intercessor_count: number; total_budget_pct: number }>({
    queryKey: [`/api/churches/${churchId}/prayer-budget`],
    enabled: open && !!churchId,
  });

  const isFirstTime = !existingBudget?.daily_intercessor_count;

  useEffect(() => {
    if (existingBudget?.daily_intercessor_count && open) {
      setDailyCount(existingBudget.daily_intercessor_count);
      setFewTimesCount(0);
      setWeeklyCount(0);
    }
  }, [existingBudget, open]);

  const totalDIE = useMemo(() => {
    const raw = (dailyCount * 1.0) + (fewTimesCount * 0.5) + (weeklyCount * 0.25);
    return Math.round(raw);
  }, [dailyCount, fewTimesCount, weeklyCount]);

  const saveBudgetMutation = useMutation({
    mutationFn: async (count: number) => {
      return apiRequest("POST", `/api/churches/${churchId}/prayer-budget`, {
        daily_intercessor_count: count,
        total_budget_pct: 100,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/churches/${churchId}/prayer-budget`] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-coverage/church", churchId] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-coverage"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/churches", churchId, "prayer-allocations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/churches", churchId, "prayer-budget"] });

      const adj = data?.allocation_adjustment;
      if (adj?.adjusted && adj.scaled_down) {
        toast({
          title: "Intercessors updated",
          description: `Allocations adjusted to fit ${totalDIE} intercessors. Total: ${Math.round(adj.new_total_pct)}%.`,
        });
      } else {
        toast({
          title: "Intercessors saved",
          description: `${totalDIE} daily intercessors committed.`,
        });
      }
      onComplete?.();
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error saving",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (totalDIE <= 0) {
      toast({
        title: "No intercessors entered",
        description: "Enter committed prayer people in at least one category.",
        variant: "destructive",
      });
      return;
    }
    saveBudgetMutation.mutate(totalDIE);
  };

  return (
    <Dialog open={open} onOpenChange={() => onOpenChange(false)}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-intercessor-calculator">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-amber-500" />
            Set Up Prayer Map
          </DialogTitle>
          <DialogDescription className="sr-only">
            Calculate your church's intercessors to set up prayer coverage.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {isFirstTime && (
            <div className="space-y-3 text-center py-2">
              <p className="text-sm font-medium">
                More intercessors = more coverage
              </p>
              <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 font-bold text-[10px]">1</span>
                  Calculate intercessors
                </span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/50" />
                <span className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 font-bold text-[10px]">2</span>
                  Allocate on map
                </span>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Indicate the number of people in your community who have committed to pray for The Church and Our City.</p>

            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-1">
                <Label htmlFor="daily-count" className="text-xs">
                  Daily (most days)
                  <span className="text-muted-foreground ml-1 font-normal">x 1.0</span>
                </Label>
                <Input
                  id="daily-count"
                  type="number"
                  min={0}
                  max={10000}
                  value={dailyCount || ""}
                  onChange={(e) => setDailyCount(parseInt(e.target.value) || 0)}
                  placeholder="0"
                  data-testid="input-daily-count"
                />
              </div>
              <div className="w-14 text-right pt-5">
                <span className="text-sm font-medium text-muted-foreground" data-testid="text-daily-die">{(dailyCount * 1.0).toFixed(1)}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-1">
                <Label htmlFor="few-times-count" className="text-xs">
                  3&#8211;4x / week
                  <span className="text-muted-foreground ml-1 font-normal">x 0.5</span>
                </Label>
                <Input
                  id="few-times-count"
                  type="number"
                  min={0}
                  max={10000}
                  value={fewTimesCount || ""}
                  onChange={(e) => setFewTimesCount(parseInt(e.target.value) || 0)}
                  placeholder="0"
                  data-testid="input-few-times-count"
                />
              </div>
              <div className="w-14 text-right pt-5">
                <span className="text-sm font-medium text-muted-foreground" data-testid="text-few-times-die">{(fewTimesCount * 0.5).toFixed(1)}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-1">
                <Label htmlFor="weekly-count" className="text-xs">
                  1&#8211;2x / week
                  <span className="text-muted-foreground ml-1 font-normal">x 0.25</span>
                </Label>
                <Input
                  id="weekly-count"
                  type="number"
                  min={0}
                  max={10000}
                  value={weeklyCount || ""}
                  onChange={(e) => setWeeklyCount(parseInt(e.target.value) || 0)}
                  placeholder="0"
                  data-testid="input-weekly-count"
                />
              </div>
              <div className="w-14 text-right pt-5">
                <span className="text-sm font-medium text-muted-foreground" data-testid="text-weekly-die">{(weeklyCount * 0.25).toFixed(1)}</span>
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between p-3 bg-amber-500/10 rounded-md">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-600" />
              <span className="text-sm font-medium">Daily Intercessors</span>
            </div>
            <span className="text-2xl font-bold text-amber-600 dark:text-amber-400" data-testid="text-total-die">
              {totalDIE}
            </span>
          </div>
        </div>

        <DialogFooter className="flex-row justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-calculator-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveBudgetMutation.isPending || totalDIE <= 0}
            data-testid="button-calculator-save"
          >
            {saveBudgetMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
