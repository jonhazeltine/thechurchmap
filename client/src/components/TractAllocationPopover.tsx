import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { X, Check, Loader2, Users, Shield } from "lucide-react";

interface TractAllocationPopoverProps {
  onClose: () => void;
  churchId: string;
  tractGeoid: string;
  tractLabel: string;
  population?: number;
  position: { x: number; y: number };
  onSaved?: () => void;
  defaultIncrement?: number;
}

interface ChurchCoverageData {
  budget: { church_id: string; daily_intercessor_count: number; total_budget_pct: number };
  allocations: Array<{ tract_geoid: string; allocation_pct: number; population?: number; coverage_pct?: number }>;
  total_allocation_pct: number;
  remaining_pct: number;
}

const R = 200;

function allocationToCoverage(allocationPct: number, intercessorCount: number, population: number): number {
  if (population <= 0 || intercessorCount <= 0) return 0;
  const intercessorsAssigned = intercessorCount * (allocationPct / 100);
  return (intercessorsAssigned * R / population) * 100;
}

function coverageToAllocation(coveragePct: number, intercessorCount: number, population: number): number {
  if (intercessorCount <= 0 || population <= 0) return 0;
  return (coveragePct / 100 * population) / (intercessorCount * R) * 100;
}

export function TractAllocationPopover({
  onClose,
  churchId,
  tractGeoid,
  tractLabel,
  population = 0,
  position,
  onSaved,
}: TractAllocationPopoverProps) {
  const { toast } = useToast();

  const { data: coverageData, isLoading } = useQuery<ChurchCoverageData>({
    queryKey: ['/api/prayer-coverage/church', churchId],
    enabled: !!churchId,
  });

  const { data: resolvedTractData } = useQuery<{ geoid: string; population: number }>({
    queryKey: [`/api/tracts/population?geoid=${tractGeoid}`],
    enabled: !!tractGeoid,
    staleTime: 5 * 60 * 1000,
  });

  const allAllocations = coverageData?.allocations ?? [];
  const intercessorCount = coverageData?.budget?.daily_intercessor_count ?? 0;
  const currentTract = allAllocations.find(a => a.tract_geoid === tractGeoid);
  const currentAllocationPct = currentTract?.allocation_pct ?? 0;
  const tractPopulation = currentTract?.population || resolvedTractData?.population || population;

  const otherAllocated = allAllocations
    .filter(a => a.tract_geoid !== tractGeoid)
    .reduce((sum, a) => sum + a.allocation_pct, 0);
  const maxAllocationPct = Math.max(0, 100 - otherAllocated);

  const [allocationPct, setAllocationPct] = useState(currentAllocationPct);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedPctRef = useRef(currentAllocationPct);
  const prevTractRef = useRef(tractGeoid);
  const prevIntercessorRef = useRef(intercessorCount);
  useEffect(() => {
    if (prevTractRef.current !== tractGeoid) {
      setAllocationPct(currentAllocationPct);
      lastSavedPctRef.current = currentAllocationPct;
      prevTractRef.current = tractGeoid;
    }
  }, [currentAllocationPct, tractGeoid]);

  useEffect(() => {
    if (prevIntercessorRef.current !== intercessorCount) {
      prevIntercessorRef.current = intercessorCount;
      setAllocationPct(prev => Math.min(prev, maxAllocationPct));
    }
  }, [intercessorCount, maxAllocationPct]);

  const derivedCoveragePct = allocationToCoverage(allocationPct, intercessorCount, tractPopulation);
  const maxCoveragePct = allocationToCoverage(maxAllocationPct, intercessorCount, tractPopulation);

  const previousCacheRef = useRef<any>(null);

  const saveMutation = useMutation({
    mutationFn: async (newAllocationPct: number) => {
      const updatedAllocations = allAllocations
        .filter((a) => a.tract_geoid !== tractGeoid)
        .map((a) => ({ tract_geoid: a.tract_geoid, allocation_pct: a.allocation_pct }));

      if (newAllocationPct > 0) {
        updatedAllocations.push({ tract_geoid: tractGeoid, allocation_pct: newAllocationPct });
      }

      await queryClient.cancelQueries({ queryKey: ["/api/prayer-coverage/church", churchId] });
      await queryClient.cancelQueries({ queryKey: ["/api/prayer-coverage"], exact: false });
      previousCacheRef.current = queryClient.getQueryData(["/api/prayer-coverage/church", churchId]);
      queryClient.setQueryData(
        ["/api/prayer-coverage/church", churchId],
        (old: any) => {
          if (!old) return old;
          const newAllocations = old.allocations
            .filter((a: any) => a.tract_geoid !== tractGeoid)
            .concat(newAllocationPct > 0 ? [{ tract_geoid: tractGeoid, allocation_pct: newAllocationPct }] : []);
          const newTotal = newAllocations.reduce((s: number, a: any) => s + a.allocation_pct, 0);
          return { ...old, allocations: newAllocations, total_allocation_pct: newTotal, remaining_pct: Math.max(0, 100 - newTotal) };
        }
      );

      queryClient.setQueriesData(
        { queryKey: ["/api/prayer-coverage"], exact: false },
        (old: any) => {
          if (!old?.tracts) return old;
          const updatedTracts = old.tracts
            .filter((t: any) => t.tract_geoid !== tractGeoid);
          if (newAllocationPct > 0) {
            const existing = old.tracts.find((t: any) => t.tract_geoid === tractGeoid);
            updatedTracts.push({
              ...(existing || { church_count: 1, population: 0 }),
              tract_geoid: tractGeoid,
              total_allocation_pct: newAllocationPct,
              effective_allocation_pct: newAllocationPct,
              coverage_pct: 0,
            });
          }
          return { ...old, tracts: updatedTracts };
        }
      );

      return apiRequest("PUT", `/api/churches/${churchId}/prayer-allocations`, {
        allocations: updatedAllocations,
      });
    },
    onSuccess: (_data, newPct) => {
      lastSavedPctRef.current = newPct;
      previousCacheRef.current = null;
      queryClient.invalidateQueries({ queryKey: ["/api/churches", churchId, "prayer-allocations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-coverage/church", churchId] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-coverage"], exact: false });
      setSaveStatus('saved');
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 1500);
      onSaved?.();
    },
    onError: () => {
      if (previousCacheRef.current) {
        queryClient.setQueryData(["/api/prayer-coverage/church", churchId], previousCacheRef.current);
        previousCacheRef.current = null;
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/prayer-coverage/church", churchId] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-coverage"], exact: false });
      setSaveStatus('idle');
      toast({
        title: "Error saving allocation",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const triggerSave = useCallback((pct: number) => {
    if (pct === lastSavedPctRef.current) return;
    setSaveStatus('saving');
    saveMutation.mutate(pct);
  }, [saveMutation]);

  useEffect(() => {
    if (allocationPct === lastSavedPctRef.current) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      triggerSave(allocationPct);
    }, 800);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [allocationPct, triggerSave]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const handleClose = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (allocationPct !== lastSavedPctRef.current) {
      triggerSave(allocationPct);
    }
    onClose();
  }, [allocationPct, triggerSave, onClose]);

  const handleAllocationSliderChange = ([val]: number[]) => {
    setAllocationPct(val);
  };

  const handleCoverageSliderChange = ([val]: number[]) => {
    const newAlloc = Math.min(maxAllocationPct, Math.max(0, Math.round(coverageToAllocation(val, intercessorCount, tractPopulation))));
    setAllocationPct(newAlloc);
  };

  if (isLoading) {
    return (
      <>
        <div
          className="fixed inset-0 z-[9998]"
          onMouseDown={onClose}
          onTouchEnd={onClose}
          data-testid="allocation-popover-backdrop"
        />
        <Card style={{
          position: "fixed",
          left: Math.min(position.x, window.innerWidth - 300),
          top: Math.min(position.y + 10, window.innerHeight - 350),
          zIndex: 9999,
          width: 280,
        }} className="shadow-xl"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      </>
    );
  }

  const displayCoverage = Math.round(derivedCoveragePct);

  const popoverStyle: React.CSSProperties = {
    position: "fixed",
    left: Math.min(position.x, window.innerWidth - 300),
    top: Math.min(position.y + 10, window.innerHeight - 350),
    zIndex: 9999,
    width: 280,
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[9998]"
        onMouseDown={handleClose}
        onTouchEnd={handleClose}
        data-testid="allocation-popover-backdrop"
      />
      <Card
        style={popoverStyle}
        className="shadow-xl"
        data-testid="card-tract-allocation"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Users className="w-4 h-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium tabular-nums" data-testid="text-tract-population">
                {tractPopulation > 0 ? tractPopulation.toLocaleString() : "?"}
              </span>
              <span className="text-xs text-muted-foreground">residents</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              data-testid="button-close-allocation"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">My allocation</span>
              <span className="text-sm font-medium tabular-nums" data-testid="badge-allocation-pct">
                {allocationPct}%
              </span>
            </div>
            <Slider
              value={[allocationPct]}
              onValueChange={handleAllocationSliderChange}
              min={0}
              max={maxAllocationPct || 1}
              step={1}
              disabled={maxAllocationPct === 0 && allocationPct === 0}
              data-testid="slider-allocation"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Shield className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Coverage</span>
              </div>
              <span className="text-sm font-medium tabular-nums" data-testid="text-coverage-pct">
                {displayCoverage}%
              </span>
            </div>
            <Slider
              value={[Math.min(displayCoverage, 100)]}
              onValueChange={handleCoverageSliderChange}
              min={0}
              max={100}
              step={1}
              disabled={intercessorCount <= 0 || tractPopulation <= 0}
              data-testid="slider-coverage"
            />
          </div>

          {saveStatus !== 'idle' && (
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground" data-testid="text-save-status">
              {saveStatus === 'saving' && (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Saving...</span>
                </>
              )}
              {saveStatus === 'saved' && (
                <>
                  <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
                  <span className="text-green-600 dark:text-green-400">Saved</span>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
