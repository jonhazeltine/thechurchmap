import { useEffect, useState, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, AlertTriangle, Play, RefreshCw, MapPin, Copy, Plus, Link2, MapPinOff } from "lucide-react";
import { IconBuildingChurch } from "@tabler/icons-react";

type ImportPhase = 'searching' | 'boundary_check' | 'deduplication' | 'inserting' | 'completed' | 'failed' | null;

interface ImportJob {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'interrupted';
  current_phase?: ImportPhase;
  grid_points_total: number;
  grid_points_completed: number;
  churches_found_raw: number;
  churches_in_boundaries: number;
  churches_outside_boundaries: number;
  duplicates_skipped: number;
  churches_inserted: number;
  churches_linked: number;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

interface ImportProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importJob: ImportJob | null;
  isLoading: boolean;
  onResume: () => void;
  onStartFresh: () => void;
  onClose: () => void;
}

export function ImportProgressDialog({
  open,
  onOpenChange,
  importJob,
  isLoading,
  onResume,
  onStartFresh,
  onClose,
}: ImportProgressDialogProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerStartRef = useRef<number | null>(null);
  const lastJobIdRef = useRef<string | null>(null);

  // Reset timer when dialog opens with a new job or closes
  useEffect(() => {
    if (!open) {
      timerStartRef.current = null;
      lastJobIdRef.current = null;
      setElapsedTime(0);
    }
  }, [open]);

  // Client-side timer that ticks independently of server updates
  useEffect(() => {
    if (!open || importJob?.status !== 'running') {
      return;
    }

    // If this is a new job, reset the timer start
    if (importJob.id !== lastJobIdRef.current) {
      timerStartRef.current = Date.now();
      lastJobIdRef.current = importJob.id;
      setElapsedTime(0);
    }

    // If we don't have a timer start yet, initialize it
    if (timerStartRef.current === null) {
      timerStartRef.current = Date.now();
    }
    
    const updateElapsed = () => {
      if (timerStartRef.current !== null) {
        setElapsedTime(Math.floor((Date.now() - timerStartRef.current) / 1000));
      }
    };
    
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [open, importJob?.status, importJob?.id]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = importJob 
    ? (importJob.grid_points_completed / Math.max(importJob.grid_points_total, 1)) * 100 
    : 0;

  const getStatusIcon = () => {
    if (isLoading && (!importJob || importJob.status !== 'running')) {
      return <Loader2 className="h-6 w-6 animate-spin text-blue-500" />;
    }
    switch (importJob?.status) {
      case 'running':
        return <Loader2 className="h-6 w-6 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-6 w-6 text-green-500" />;
      case 'failed':
        return <XCircle className="h-6 w-6 text-red-500" />;
      case 'interrupted':
        return <AlertTriangle className="h-6 w-6 text-amber-500" />;
      default:
        return <Loader2 className="h-6 w-6 animate-spin text-blue-500" />;
    }
  };

  const getStatusText = () => {
    if (isLoading && (!importJob || importJob.status !== 'running')) {
      return 'Starting import...';
    }
    switch (importJob?.status) {
      case 'running':
        return 'Import in progress';
      case 'completed':
        return 'Import complete';
      case 'failed':
        return 'Import failed';
      case 'interrupted':
        return 'Import interrupted';
      default:
        return 'Starting import...';
    }
  };

  const getStatusBadge = () => {
    if (isLoading && (!importJob || importJob.status !== 'running')) {
      return <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700">Starting</Badge>;
    }
    switch (importJob?.status) {
      case 'running':
        return <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700">Running</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700">Completed</Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700">Failed</Badge>;
      case 'interrupted':
        return <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">Interrupted</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getPhaseMessage = (): string | null => {
    if (importJob?.status !== 'running') return null;
    switch (importJob?.current_phase) {
      case 'searching':
        return 'Searching for churches...';
      case 'boundary_check':
        return 'Checking boundaries...';
      case 'deduplication':
        return 'Checking for duplicates...';
      case 'inserting':
        return 'Adding new churches...';
      default:
        return null;
    }
  };
  
  const phaseMessage = getPhaseMessage();

  const showRetryOptions = importJob?.status === 'failed' || importJob?.status === 'interrupted';
  const isComplete = importJob?.status === 'completed';
  const jobIsRunning = importJob?.status === 'running';
  const isRunning = jobIsRunning || (isLoading && !jobIsRunning);

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div>
              <DialogTitle data-testid="text-import-status">{getStatusText()}</DialogTitle>
              <div className="flex flex-col gap-1 mt-1">
                <div className="flex items-center gap-2">
                  {getStatusBadge()}
                  {isRunning && (
                    <span className="text-sm text-muted-foreground">
                      {formatTime(elapsedTime)} elapsed
                    </span>
                  )}
                </div>
                {phaseMessage && (
                  <span className="text-sm text-muted-foreground italic">
                    {phaseMessage}
                  </span>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                Areas searched
              </span>
              <span className="font-medium" data-testid="text-grid-progress">
                {importJob?.grid_points_completed || 0} / {importJob?.grid_points_total || 0}
              </span>
            </div>
            <Progress value={progress} className="h-2" data-testid="progress-import" />
          </div>

          {/* Stats grid - 3 columns */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2 rounded-lg bg-muted/50 space-y-0.5">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <IconBuildingChurch className="h-3 w-3" />
                Found
              </div>
              <p className="text-lg font-semibold" data-testid="text-churches-found">
                {importJob?.churches_found_raw || 0}
              </p>
            </div>
            
            <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20 space-y-0.5">
              <div className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                <MapPin className="h-3 w-3" />
                In bounds
              </div>
              <p className="text-lg font-semibold text-green-700 dark:text-green-400" data-testid="text-churches-in-bounds">
                {importJob?.churches_in_boundaries || 0}
              </p>
            </div>
            
            <div className="p-2 rounded-lg bg-muted/50 space-y-0.5">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPinOff className="h-3 w-3" />
                Out of bounds
              </div>
              <p className="text-lg font-semibold" data-testid="text-churches-out-bounds">
                {importJob?.churches_outside_boundaries || 0}
              </p>
            </div>
          </div>

          {/* Second row of stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2 rounded-lg bg-muted/50 space-y-0.5">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Copy className="h-3 w-3" />
                Duplicates
              </div>
              <p className="text-lg font-semibold" data-testid="text-duplicates-skipped">
                {importJob?.duplicates_skipped || 0}
              </p>
            </div>
            
            <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20 space-y-0.5">
              <div className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                <Plus className="h-3 w-3" />
                New
              </div>
              <p className="text-lg font-semibold text-green-700 dark:text-green-400" data-testid="text-churches-inserted">
                {importJob?.churches_inserted || 0}
              </p>
            </div>
            
            <div className="p-2 rounded-lg bg-muted/50 space-y-0.5">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Link2 className="h-3 w-3" />
                Linked
              </div>
              <p className="text-lg font-semibold" data-testid="text-churches-linked">
                {importJob?.churches_linked || 0}
              </p>
            </div>
          </div>

          {/* Error message */}
          {importJob?.error_message && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800">
              <p className="text-sm text-red-700 dark:text-red-400" data-testid="text-error-message">
                {importJob.error_message}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row justify-end gap-2">
          {showRetryOptions && !isLoading && (
            <>
              <Button
                variant="outline"
                onClick={onStartFresh}
                data-testid="button-dialog-start-fresh"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Start Fresh
              </Button>
              <Button
                onClick={onResume}
                data-testid="button-dialog-resume"
              >
                <Play className="h-4 w-4 mr-2" />
                Resume
              </Button>
            </>
          )}
          
          {isComplete && (
            <Button onClick={onClose} data-testid="button-dialog-close">
              Done
            </Button>
          )}
          
          {isRunning && (
            <>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  onClose();
                }}
                data-testid="button-dialog-pause"
              >
                Pause Import
              </Button>
              <p className="text-xs text-muted-foreground py-1">
                You can close this dialog — import continues in the background
              </p>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
