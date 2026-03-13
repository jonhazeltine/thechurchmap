import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, XCircle, Upload, MapPin, Building2, Copy, FileSpreadsheet, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import * as XLSX from "xlsx";

interface SpreadsheetChurch {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  id: string;
}

interface MatchedDbChurch {
  id: string;
  name: string;
  address: string | null;
  matchReason: string;
  similarity: number;
  distance: number;
}

interface ComparisonResult {
  spreadsheetChurch: SpreadsheetChurch;
  status: "matched" | "missing";
  matchedDbChurch?: MatchedDbChurch;
}

interface InternalDuplicate {
  original: SpreadsheetChurch;
  duplicates: SpreadsheetChurch[];
}

interface ComparisonResponse {
  summary: {
    totalSpreadsheet: number;
    uniqueSpreadsheet: number;
    internalDuplicatesRemoved: number;
    totalDatabase: number;
    matched: number;
    missing: number;
  };
  internalDuplicates: InternalDuplicate[];
  matched: ComparisonResult[];
  missing: ComparisonResult[];
}

export default function SpreadsheetCompare() {
  const { toast } = useToast();
  const [selectedMissing, setSelectedMissing] = useState<Set<string>>(new Set());
  const [showMatched, setShowMatched] = useState(false);
  const [uploadedData, setUploadedData] = useState<SpreadsheetChurch[] | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, error, refetch } = useQuery<ComparisonResponse>({
    queryKey: ["/api/admin/spreadsheet-compare", uploadedData ? "custom" : "default"],
    queryFn: async () => {
      if (uploadedData) {
        const res = await apiRequest("POST", "/api/admin/spreadsheet-compare/analyze", {
          churches: uploadedData,
          platformId: "6a51f189-5c96-4883-b7f9-adb185d53916",
        });
        return res as ComparisonResponse;
      }
      // Use apiRequest to include auth headers
      const res = await apiRequest("GET", "/api/admin/spreadsheet-compare");
      return res as ComparisonResponse;
    },
  });

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];

      // Find the column names (case-insensitive)
      const findColumn = (row: Record<string, any>, patterns: string[]): string | undefined => {
        const keys = Object.keys(row);
        for (const pattern of patterns) {
          const found = keys.find(k => k.toLowerCase().includes(pattern.toLowerCase()));
          if (found) return row[found];
        }
        return undefined;
      };

      const parsed: SpreadsheetChurch[] = [];
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const name = findColumn(row, ["name", "church", "organization"]);
        const address = findColumn(row, ["address", "location", "street"]);
        const lat = findColumn(row, ["lat", "latitude"]);
        const lng = findColumn(row, ["lng", "lon", "longitude"]);

        if (name && address && lat && lng) {
          parsed.push({
            id: `upload-${i}`,
            name: String(name).trim(),
            address: String(address).trim(),
            latitude: parseFloat(String(lat)),
            longitude: parseFloat(String(lng)),
          });
        }
      }

      if (parsed.length === 0) {
        toast({
          title: "No valid data found",
          description: "Make sure your spreadsheet has columns for name, address, latitude, and longitude",
          variant: "destructive",
        });
        return;
      }

      setUploadedData(parsed);
      toast({
        title: "File uploaded",
        description: `Found ${parsed.length} churches in the spreadsheet`,
      });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Failed to parse spreadsheet",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [toast]);

  const handleClearUpload = () => {
    setUploadedData(null);
    setSelectedMissing(new Set());
  };

  const importMutation = useMutation({
    mutationFn: async (churches: SpreadsheetChurch[]) => {
      return apiRequest("POST", "/api/admin/spreadsheet-compare", {
        churches,
        platformId: "6a51f189-5c96-4883-b7f9-adb185d53916",
      });
    },
    onSuccess: (result: any) => {
      toast({
        title: "Import Complete",
        description: `Successfully imported ${result.imported} churches. ${result.errors} errors.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/churches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/spreadsheet-compare"] });
      setSelectedMissing(new Set());
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSelectAll = () => {
    if (!data?.missing) return;
    const allIds = new Set(data.missing.map((r) => r.spreadsheetChurch.id));
    setSelectedMissing(allIds);
  };

  const handleSelectNone = () => {
    setSelectedMissing(new Set());
  };

  const handleToggle = (id: string) => {
    const newSet = new Set(selectedMissing);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedMissing(newSet);
  };

  const handleImport = () => {
    if (!data?.missing || selectedMissing.size === 0) return;
    const toImport = data.missing
      .filter((r) => selectedMissing.has(r.spreadsheetChurch.id))
      .map((r) => r.spreadsheetChurch);
    importMutation.mutate(toImport);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-6xl mx-auto">
          <Card>
            <CardContent className="pt-6">
              <p className="text-destructive">Error loading comparison: {(error as Error).message}</p>
              <Button onClick={() => refetch()} className="mt-4">
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/admin">
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-semibold">Spreadsheet Comparison</h1>
                <p className="text-sm text-muted-foreground">
                  {uploadedData 
                    ? `Comparing ${uploadedData.length} uploaded churches`
                    : "Find and import missing churches from your spreadsheet"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
                data-testid="input-file-upload"
              />
              {uploadedData ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearUpload}
                  data-testid="button-clear-upload"
                >
                  Clear Upload
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                data-testid="button-upload-spreadsheet"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Upload Spreadsheet
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{data.summary.totalSpreadsheet}</div>
                  <p className="text-sm text-muted-foreground">In Spreadsheet</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-purple-600">{data.summary.internalDuplicatesRemoved}</div>
                  <p className="text-sm text-muted-foreground">Internal Dupes</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{data.summary.totalDatabase}</div>
                  <p className="text-sm text-muted-foreground">In Database</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-green-600">{data.summary.matched}</div>
                  <p className="text-sm text-muted-foreground">Already Matched</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-amber-600">{data.summary.missing}</div>
                  <p className="text-sm text-muted-foreground">Missing (Need Import)</p>
                </CardContent>
              </Card>
            </div>

            {data.internalDuplicates && data.internalDuplicates.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Copy className="h-5 w-5 text-purple-600" />
                    Internal Duplicates in Spreadsheet ({data.internalDuplicates.length} groups)
                  </CardTitle>
                  <CardDescription>
                    These entries in your spreadsheet are duplicates of each other (same location within 100m)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[250px]">
                    <div className="space-y-3">
                      {data.internalDuplicates.map((group, idx) => (
                        <div key={idx} className="p-3 border rounded-lg bg-purple-50 dark:bg-purple-950/20">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="bg-purple-100 dark:bg-purple-900">Kept</Badge>
                            <span className="font-medium">{group.original.name}</span>
                            <span className="text-sm text-muted-foreground">- {group.original.address}</span>
                          </div>
                          <div className="pl-4 space-y-1">
                            {group.duplicates.map((dup) => (
                              <div key={dup.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Badge variant="secondary" className="text-xs">Removed</Badge>
                                <span>{dup.name}</span>
                                <span>- {dup.address}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-amber-600" />
                      Missing Churches ({data.missing.length})
                    </CardTitle>
                    <CardDescription>
                      These churches from your spreadsheet were not found in the database
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleSelectAll} data-testid="button-select-all">
                      Select All
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleSelectNone} data-testid="button-select-none">
                      Select None
                    </Button>
                    <Button
                      onClick={handleImport}
                      disabled={selectedMissing.size === 0 || importMutation.isPending}
                      data-testid="button-import"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Import Selected ({selectedMissing.size})
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {data.missing.map((result) => (
                      <div
                        key={result.spreadsheetChurch.id}
                        className="flex items-center gap-3 p-3 border rounded-lg hover-elevate"
                      >
                        <Checkbox
                          checked={selectedMissing.has(result.spreadsheetChurch.id)}
                          onCheckedChange={() => handleToggle(result.spreadsheetChurch.id)}
                          data-testid={`checkbox-church-${result.spreadsheetChurch.id}`}
                        />
                        <Building2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{result.spreadsheetChurch.name}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {result.spreadsheetChurch.address}
                          </p>
                        </div>
                        <Badge variant="outline" className="flex-shrink-0">
                          <MapPin className="h-3 w-3 mr-1" />
                          {result.spreadsheetChurch.latitude.toFixed(4)},{" "}
                          {result.spreadsheetChurch.longitude.toFixed(4)}
                        </Badge>
                      </div>
                    ))}
                    {data.missing.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-600" />
                        <p>All churches from your spreadsheet are already in the database!</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      Matched Churches ({data.matched.length})
                    </CardTitle>
                    <CardDescription>
                      These churches from your spreadsheet were found in the database
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowMatched(!showMatched)}
                    data-testid="button-toggle-matched"
                  >
                    {showMatched ? "Hide" : "Show"} Details
                  </Button>
                </div>
              </CardHeader>
              {showMatched && (
                <CardContent>
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-2">
                      {data.matched.map((result) => (
                        <div
                          key={result.spreadsheetChurch.id}
                          className="flex items-start gap-3 p-3 border rounded-lg"
                        >
                          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0 grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Spreadsheet</p>
                              <p className="font-medium truncate">{result.spreadsheetChurch.name}</p>
                              <p className="text-sm text-muted-foreground truncate">
                                {result.spreadsheetChurch.address}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Database Match</p>
                              <p className="font-medium truncate">{result.matchedDbChurch?.name}</p>
                              <p className="text-sm text-muted-foreground truncate">
                                {result.matchedDbChurch?.address}
                              </p>
                              <p className="text-xs text-green-600 mt-1">
                                {result.matchedDbChurch?.matchReason}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              )}
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
