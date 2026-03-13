import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Check, Eye, Church, Target } from "lucide-react";

interface AllocationModeOverlayProps {
  churchId: string;
  churchName?: string;
  selectedIncrement: number;
  onIncrementChange: (increment: number) => void;
  onExit: () => void;
  coverageMode: "citywide" | "myChurch";
  onCoverageModeChange: (mode: "citywide" | "myChurch") => void;
}

const INCREMENT_OPTIONS = [5, 10, 20];

export function AllocationModeOverlay({
  churchId,
  churchName,
  selectedIncrement,
  onIncrementChange,
  onExit,
  coverageMode,
  onCoverageModeChange,
}: AllocationModeOverlayProps) {
  const { data: coverageData } = useQuery<{
    budget: { church_id: string; daily_intercessor_count: number; total_budget_pct: number };
    allocations: Array<{ tract_geoid: string; allocation_pct: number }>;
    total_allocation_pct: number;
    remaining_pct: number;
  }>({
    queryKey: ["/api/prayer-coverage/church", churchId],
    queryFn: async () => {
      const res = await fetch(`/api/prayer-coverage/church/${churchId}`);
      if (!res.ok) throw new Error("Failed to fetch coverage");
      return res.json();
    },
    staleTime: 0,
    refetchInterval: 30 * 1000,
  });

  const totalAllocated = Math.round(coverageData?.total_allocation_pct ?? 0);
  const remaining = Math.round(coverageData?.remaining_pct ?? 100);
  const isFullyAllocated = remaining <= 0;

  const shortName = churchName
    ? (churchName.length > 18 ? churchName.slice(0, 16) + "..." : churchName)
    : "My Church";

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-40 flex flex-col items-center gap-2 pointer-events-none pb-[max(1rem,env(safe-area-inset-bottom,1rem))] px-3 sm:px-4 sm:pb-4"
      data-testid="allocation-mode-overlay"
    >
      <div className="pointer-events-auto flex items-center gap-2">
        <p
          className="text-xs text-center px-3 py-1 rounded-md bg-background/80 dark:bg-background/80 backdrop-blur-sm border text-muted-foreground"
          data-testid="text-allocation-instructions"
        >
          <Target className="w-3 h-3 inline-block mr-1 -mt-px" />
          Tap to allocate, hold for custom amount
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onCoverageModeChange(coverageMode === "citywide" ? "myChurch" : "citywide")}
          className="text-xs bg-background/80 backdrop-blur-sm gap-1.5"
          data-testid="button-toggle-coverage-view"
        >
          {coverageMode === "citywide" ? (
            <>
              <Church className="w-3 h-3" />
              {shortName} only
            </>
          ) : (
            <>
              <Eye className="w-3 h-3" />
              All churches
            </>
          )}
        </Button>
      </div>

      <div
        className="pointer-events-auto w-full max-w-lg rounded-md border bg-background/95 dark:bg-background/95 backdrop-blur-sm shadow-lg px-3 py-2.5 sm:px-4 sm:py-3"
        data-testid="allocation-mode-bar"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <div className="flex-1 min-w-0 space-y-1" data-testid="allocation-budget-meter">
            <div className="flex items-center justify-between text-xs">
              <span
                className={
                  isFullyAllocated
                    ? "font-medium text-red-600 dark:text-red-400"
                    : "font-medium text-amber-600 dark:text-amber-400"
                }
                data-testid="text-allocated-pct"
              >
                {totalAllocated}% allocated
              </span>
              <span className="text-muted-foreground" data-testid="text-remaining-pct">
                {remaining}% remaining
              </span>
            </div>
            <Progress
              value={totalAllocated}
              className={`h-2 ${isFullyAllocated ? "[&>div]:bg-red-500" : "[&>div]:bg-amber-500"}`}
              data-testid="progress-allocation-budget"
            />
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-1 shrink-0">
            <div className="flex items-center gap-1" data-testid="allocation-increment-selector">
              {INCREMENT_OPTIONS.map((inc) => (
                <Button
                  key={inc}
                  variant={selectedIncrement === inc ? "default" : "outline"}
                  size="sm"
                  onClick={() => onIncrementChange(inc)}
                  className={
                    selectedIncrement === inc
                      ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500 no-default-hover-elevate"
                      : ""
                  }
                  data-testid={`button-increment-${inc}`}
                >
                  {inc}%
                </Button>
              ))}
            </div>

            <Button
              variant="default"
              size="sm"
              onClick={onExit}
              className="shrink-0 gap-1"
              data-testid="button-done-allocation"
            >
              <Check className="w-4 h-4" />
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
