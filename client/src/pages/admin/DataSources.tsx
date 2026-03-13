import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type DataSourceConfig,
  type DataSourceDashboard,
  type IngestionRun,
  type DataSourceType,
  type DataSourceRunStatus,
} from "@shared/schema";
import {
  Database,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  History,
  Search,
  Clock,
  AlertTriangle,
  Activity,
  Settings,
  Map,
  Upload,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

interface DataSourcesResponse {
  data_sources: DataSourceConfig[];
}

interface RunHistoryResponse {
  data_source: {
    id: string;
    source_key: string;
    source_name: string;
  };
  runs: IngestionRun[];
  total: number;
  limit: number;
  offset: number;
}

const DATA_SOURCE_TYPES: DataSourceType[] = ['crime', 'health', 'demographics', 'boundaries', 'churches'];

function getStatusBadge(status: DataSourceRunStatus | null | undefined, sourceId?: string) {
  const idSuffix = sourceId ? `-${sourceId}` : '';
  switch (status) {
    case 'running':
      return <Badge variant="default" className="bg-blue-600" data-testid={`badge-status-running${idSuffix}`}><Loader2 className="w-3 h-3 mr-1 animate-spin" />Running</Badge>;
    case 'success':
      return <Badge variant="default" className="bg-green-600" data-testid={`badge-status-success${idSuffix}`}><CheckCircle className="w-3 h-3 mr-1" />Success</Badge>;
    case 'failed':
      return <Badge variant="destructive" data-testid={`badge-status-failed${idSuffix}`}><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    case 'pending':
      return <Badge variant="secondary" data-testid={`badge-status-pending${idSuffix}`}><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    default:
      return <Badge variant="outline" data-testid={`badge-status-never-run${idSuffix}`}>Never Run</Badge>;
  }
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function formatRecords(count: number | null | undefined): string {
  if (count === null || count === undefined) return '-';
  return count.toLocaleString();
}

export default function AdminDataSources() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<DataSourceConfig | null>(null);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [editFrequencyLabel, setEditFrequencyLabel] = useState<string>("");
  
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [tilesetGenerating, setTilesetGenerating] = useState(false);
  const [geojsonRefreshing, setGeojsonRefreshing] = useState(false);
  const [tilesetResult, setTilesetResult] = useState<{ success: boolean; message: string; churchCount?: number } | null>(null);
  
  const handleTableWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const container = tableScrollRef.current;
    if (!container) return;
    
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      e.preventDefault();
      e.stopPropagation();
      container.scrollLeft += e.deltaX;
    }
  }, []);
  
  const handleTableTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
  }, []);

  const { data: dashboard, isLoading: dashboardLoading } = useQuery<DataSourceDashboard>({
    queryKey: ["/api/admin/data-sources/dashboard"],
  });

  const { data: sourcesResponse, isLoading: sourcesLoading } = useQuery<DataSourcesResponse>({
    queryKey: ["/api/admin/data-sources"],
  });

  const sources = sourcesResponse?.data_sources || [];

  const { data: historyResponse, isLoading: historyLoading } = useQuery<RunHistoryResponse>({
    queryKey: ["/api/admin/data-sources", selectedSource?.id, "runs", { offset: historyOffset }],
    enabled: !!selectedSource && historyDialogOpen,
  });

  const { data: tilesetStatus, refetch: refetchTilesetStatus } = useQuery<{
    tileset: string;
    recentUploads: Array<{ id: string; created: string; stage: string }>;
  }>({
    queryKey: ["/api/admin/tileset"],
  });

  const handleRegenerateTileset = async () => {
    setTilesetGenerating(true);
    setTilesetResult(null);
    try {
      const result = await apiRequest("POST", "/api/admin/tileset");
      setTilesetResult({
        success: true,
        message: `Tileset upload initiated with ${result?.churchCount?.toLocaleString() || 0} churches`,
        churchCount: result?.churchCount,
      });
      refetchTilesetStatus();
    } catch (error: any) {
      setTilesetResult({
        success: false,
        message: error.message || "Failed to generate tileset",
      });
    } finally {
      setTilesetGenerating(false);
    }
  };

  const handleRefreshSampledGeoJSON = async () => {
    setGeojsonRefreshing(true);
    try {
      await apiRequest("PUT", "/api/admin/tileset");
      toast({
        title: "Success",
        description: "Sampled GeoJSON updated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update sampled GeoJSON",
        variant: "destructive",
      });
    } finally {
      setGeojsonRefreshing(false);
    }
  };

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiRequest("PATCH", `/api/admin/data-sources/${id}`, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/data-sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/data-sources/dashboard"] });
      toast({
        title: "Success",
        description: "Data source updated successfully",
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

  const triggerMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/admin/data-sources/${id}/trigger`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/data-sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/data-sources/dashboard"] });
      toast({
        title: "Success",
        description: "Data source refresh triggered successfully",
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

  const updateMutation = useMutation({
    mutationFn: ({ id, frequency_label }: { id: string; frequency_label: string }) =>
      apiRequest("PATCH", `/api/admin/data-sources/${id}`, { frequency_label }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/data-sources"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/data-sources/dashboard"] });
      setEditDialogOpen(false);
      toast({
        title: "Success",
        description: "Data source settings updated",
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

  const filteredSources = sources.filter((source) => {
    if (searchQuery && !source.source_name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !source.source_key.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (typeFilter !== "all" && source.source_type !== typeFilter) {
      return false;
    }
    if (statusFilter === "enabled" && !source.enabled) {
      return false;
    }
    if (statusFilter === "disabled" && source.enabled) {
      return false;
    }
    return true;
  });

  const handleViewHistory = (source: DataSourceConfig) => {
    setSelectedSource(source);
    setHistoryOffset(0);
    setHistoryDialogOpen(true);
  };

  const handleEdit = (source: DataSourceConfig) => {
    setSelectedSource(source);
    setEditFrequencyLabel(source.frequency_label || "Daily");
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (selectedSource && editFrequencyLabel) {
      updateMutation.mutate({ id: selectedSource.id, frequency_label: editFrequencyLabel });
    }
  };

  const handleToggle = (source: DataSourceConfig) => {
    toggleMutation.mutate({ id: source.id, enabled: !source.enabled });
  };

  const handleTrigger = (source: DataSourceConfig) => {
    triggerMutation.mutate(source.id);
  };

  const runningCount = sources.filter(s => s.last_run_status === 'running').length;
  const failedCount = sources.filter(s => s.last_run_status === 'failed' || s.consecutive_failures > 0).length;

  const statCards = [
    {
      title: "Total Sources",
      value: dashboard?.total_sources ?? sources.length,
      icon: Database,
      color: "text-blue-600",
    },
    {
      title: "Enabled",
      value: dashboard?.enabled_sources ?? sources.filter(s => s.enabled).length,
      icon: CheckCircle,
      color: "text-green-600",
    },
    {
      title: "Failed",
      value: failedCount,
      icon: AlertTriangle,
      color: "text-red-600",
    },
    {
      title: "Running",
      value: runningCount,
      icon: Activity,
      color: "text-blue-500",
    },
  ];

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Data Sources Management</h1>
          <p className="text-muted-foreground mt-1">
            Monitor and manage all data ingestion sources
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title} data-testid={`card-stat-${card.title.toLowerCase().replace(/\s+/g, '-')}`}>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {card.title}
                  </CardTitle>
                  <Icon className={`h-4 w-4 ${card.color} shrink-0`} />
                </CardHeader>
                <CardContent>
                  {dashboardLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div className="text-2xl font-bold" data-testid={`text-stat-value-${card.title.toLowerCase().replace(/\s+/g, '-')}`}>{card.value}</div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* National Map Tileset Management */}
        <Card data-testid="card-tileset-management">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <div>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Map className="h-5 w-5 text-red-600" />
                National Church Tileset
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Regenerate the Mapbox tileset for the national "All Churches" map layer (~240K churches)
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handleRegenerateTileset}
                disabled={tilesetGenerating}
                data-testid="button-regenerate-tileset"
              >
                {tilesetGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Regenerate Tileset
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleRefreshSampledGeoJSON}
                disabled={geojsonRefreshing}
                data-testid="button-refresh-geojson"
              >
                {geojsonRefreshing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {geojsonRefreshing ? "Refreshing..." : "Refresh Sampled GeoJSON"}
              </Button>
            </div>
            
            {tilesetResult && (
              <div
                className={`p-3 rounded-md text-sm ${
                  tilesetResult.success
                    ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                    : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                }`}
                data-testid="text-tileset-result"
              >
                {tilesetResult.success ? (
                  <CheckCircle className="h-4 w-4 inline mr-2" />
                ) : (
                  <XCircle className="h-4 w-4 inline mr-2" />
                )}
                {tilesetResult.message}
              </div>
            )}

            {tilesetStatus?.recentUploads && tilesetStatus.recentUploads.length > 0 && (
              <div className="text-sm text-muted-foreground">
                <div className="font-medium mb-1">Recent Uploads:</div>
                <ul className="space-y-1">
                  {tilesetStatus.recentUploads.slice(0, 3).map((upload) => (
                    <li key={upload.id} className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {upload.stage}
                      </Badge>
                      <span>{formatDistanceToNow(new Date(upload.created), { addSuffix: true })}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or key..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-sources"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-type-filter">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="select-item-type-all">All Types</SelectItem>
              {DATA_SOURCE_TYPES.map((type) => (
                <SelectItem key={type} value={type} data-testid={`select-item-type-${type}`}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-status-filter">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="select-item-status-all">All Status</SelectItem>
              <SelectItem value="enabled" data-testid="select-item-status-enabled">Enabled</SelectItem>
              <SelectItem value="disabled" data-testid="select-item-status-disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {sourcesLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <div 
            ref={tableScrollRef}
            onWheel={handleTableWheel}
            onTouchMove={handleTableTouchMove}
            className="border rounded-lg overflow-x-auto min-w-0 max-w-full touch-pan-x"
          >
            <Table className="min-w-[1000px]" data-testid="table-data-sources">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead>Next Run</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSources.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      {sources.length === 0
                        ? "No data sources configured yet."
                        : "No data sources match your filters."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSources.map((source) => (
                    <TableRow key={source.id} data-testid={`row-source-${source.id}`}>
                      <TableCell>
                        <div>
                          <div className="font-medium" data-testid={`text-source-name-${source.id}`}>{source.source_name}</div>
                          <div className="text-xs text-muted-foreground" data-testid={`text-source-key-${source.id}`}>{source.source_key}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" data-testid={`badge-type-${source.id}`}>
                          {source.source_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {source.source_category ? (
                          <Badge variant="secondary" data-testid={`badge-category-${source.id}`}>
                            {source.source_category}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(source.last_run_status, source.id)}
                        {source.consecutive_failures > 0 && (
                          <div className="text-xs text-destructive mt-1">
                            {source.consecutive_failures} failures
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {source.last_run_at ? (
                          <div>
                            <div className="text-sm">
                              {formatDistanceToNow(new Date(source.last_run_at), { addSuffix: true })}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDuration(source.last_run_duration_ms)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {source.next_run_at ? (
                          <div className="text-sm">
                            {formatDistanceToNow(new Date(source.next_run_at), { addSuffix: true })}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell data-testid={`text-record-count-${source.id}`}>
                        {formatRecords(source.record_count)}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={source.enabled}
                          onCheckedChange={() => handleToggle(source)}
                          disabled={toggleMutation.isPending}
                          data-testid={`switch-enabled-${source.id}`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(source)}
                            data-testid={`button-edit-${source.id}`}
                            title="Edit settings"
                          >
                            <Settings className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleTrigger(source)}
                            disabled={triggerMutation.isPending || source.last_run_status === 'running'}
                            data-testid={`button-trigger-${source.id}`}
                            title="Trigger refresh"
                          >
                            {triggerMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleViewHistory(source)}
                            data-testid={`button-history-${source.id}`}
                            title="View run history"
                          >
                            <History className="w-4 h-4" />
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

      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col" data-testid="dialog-run-history">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">Run History</DialogTitle>
            <DialogDescription data-testid="text-dialog-description">
              {selectedSource?.source_name} ({selectedSource?.source_key})
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {historyLoading ? (
              <div className="space-y-4 p-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : !historyResponse?.runs?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                No run history available for this data source.
              </div>
            ) : (
              <Table data-testid="table-run-history">
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Ended</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Fetched</TableHead>
                    <TableHead>Inserted</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Skipped</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyResponse?.runs?.map((run) => (
                    <TableRow key={run.id} data-testid={`row-run-${run.id}`}>
                      <TableCell>
                        <div className="text-sm" data-testid={`text-run-started-${run.id}`}>
                          {format(new Date(run.started_at), 'MMM d, yyyy')}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(run.started_at), 'h:mm a')}
                        </div>
                      </TableCell>
                      <TableCell>
                        {run.completed_at ? (
                          <div>
                            <div className="text-sm" data-testid={`text-run-ended-${run.id}`}>
                              {format(new Date(run.completed_at), 'MMM d, yyyy')}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(run.completed_at), 'h:mm a')}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {run.completed_at ? (
                          <span data-testid={`text-run-duration-${run.id}`}>
                            {formatDuration(
                              new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">In progress...</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(run.status, run.id)}
                        {run.error_message && (
                          <div className="text-xs text-destructive mt-1 max-w-[200px] truncate" title={run.error_message}>
                            {run.error_message}
                          </div>
                        )}
                      </TableCell>
                      <TableCell data-testid={`text-run-fetched-${run.id}`}>{formatRecords(run.features_fetched)}</TableCell>
                      <TableCell data-testid={`text-run-inserted-${run.id}`}>{formatRecords(run.features_inserted)}</TableCell>
                      <TableCell data-testid={`text-run-updated-${run.id}`}>{formatRecords(run.features_updated)}</TableCell>
                      <TableCell data-testid={`text-run-skipped-${run.id}`}>{formatRecords(run.features_skipped)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          {historyResponse && historyResponse.total > historyResponse.limit && (
            <div className="flex items-center justify-between pt-4 border-t" data-testid="pagination-container">
              <div className="text-sm text-muted-foreground" data-testid="text-pagination-info">
                Showing {historyResponse.offset + 1} - {Math.min(historyResponse.offset + historyResponse.limit, historyResponse.total)} of {historyResponse.total}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setHistoryOffset(Math.max(0, historyOffset - historyResponse.limit))}
                  disabled={historyOffset === 0}
                  data-testid="button-prev-page"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setHistoryOffset(historyOffset + historyResponse.limit)}
                  disabled={historyOffset + historyResponse.limit >= historyResponse.total}
                  data-testid="button-next-page"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-edit-source">
          <DialogHeader>
            <DialogTitle data-testid="text-edit-dialog-title">Edit Data Source</DialogTitle>
            <DialogDescription data-testid="text-edit-dialog-description">
              {selectedSource?.source_name}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="frequency">Refresh Frequency</Label>
              <Select value={editFrequencyLabel} onValueChange={setEditFrequencyLabel}>
                <SelectTrigger id="frequency" data-testid="select-edit-frequency">
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent className="z-[200]">
                  <SelectItem value="Hourly" data-testid="select-item-freq-hourly">Hourly</SelectItem>
                  <SelectItem value="Daily" data-testid="select-item-freq-daily">Daily</SelectItem>
                  <SelectItem value="Weekly" data-testid="select-item-freq-weekly">Weekly</SelectItem>
                  <SelectItem value="Monthly" data-testid="select-item-freq-monthly">Monthly</SelectItem>
                  <SelectItem value="Quarterly" data-testid="select-item-freq-quarterly">Quarterly</SelectItem>
                  <SelectItem value="Yearly" data-testid="select-item-freq-yearly">Yearly</SelectItem>
                  <SelectItem value="Manual" data-testid="select-item-freq-manual">Manual Only</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                How often this data source should automatically refresh
              </p>
            </div>
            {selectedSource?.frequency_label && (
              <div className="text-sm text-muted-foreground">
                Current: <span className="font-medium">{selectedSource.frequency_label}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
