import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Search, 
  CheckCircle2, 
  FileText, 
  Download, 
  Calendar,
  User,
  Mail,
  ChevronLeft,
  AlertCircle
} from "lucide-react";

interface SignatureRecord {
  id: string;
  document_name: string | null;
  signer_name: string;
  signer_email: string | null;
  signature_text: string;
  signed_at: string;
  ip_address: string | null;
  original_pdf_url: string | null;
  signed_pdf_url: string | null;
  church_id: string | null;
  created_at: string;
}

export default function SignatureVerification() {
  const searchParams = useSearch();
  const urlParams = new URLSearchParams(searchParams);
  const initialId = urlParams.get("id") || "";
  
  const [searchType, setSearchType] = useState<"id" | "email">(initialId ? "id" : "id");
  const [searchValue, setSearchValue] = useState(initialId);
  const [activeSearch, setActiveSearch] = useState<{ type: "id" | "email"; value: string } | null>(
    initialId ? { type: "id", value: initialId } : null
  );

  const { data, isLoading, error } = useQuery<{ signatures: SignatureRecord[] }>({
    queryKey: ["/api/signatures/search", activeSearch],
    queryFn: async () => {
      if (!activeSearch) return { signatures: [] };
      const param = activeSearch.type === "id" ? `id=${activeSearch.value}` : `email=${encodeURIComponent(activeSearch.value)}`;
      const response = await fetch(`/api/signatures/search?${param}`);
      if (!response.ok) throw new Error("Failed to search signatures");
      return response.json();
    },
    enabled: !!activeSearch?.value,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      setActiveSearch({ type: searchType, value: searchValue.trim() });
    }
  };

  const signatures = data?.signatures || [];

  return (
    <AppLayout>
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back-home">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Home
            </Button>
          </Link>
        </div>

        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
            Signature Verification
          </h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            We want to help you support the mission of your church!
          </p>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Search Signatures
            </CardTitle>
            <CardDescription>
              Enter a signature ID or email address to find signed documents.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={searchType} onValueChange={(v) => setSearchType(v as "id" | "email")}>
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="id" data-testid="tab-search-id">
                  <FileText className="w-4 h-4 mr-2" />
                  Signature ID
                </TabsTrigger>
                <TabsTrigger value="email" data-testid="tab-search-email">
                  <Mail className="w-4 h-4 mr-2" />
                  Email Address
                </TabsTrigger>
              </TabsList>

              <form onSubmit={handleSearch} className="space-y-4">
                <TabsContent value="id" className="mt-0">
                  <div className="space-y-2">
                    <Label htmlFor="signature-id">Signature ID</Label>
                    <Input
                      id="signature-id"
                      placeholder="e.g., a1b2c3d4-e5f6-7890-abcd-ef1234567890"
                      value={searchValue}
                      onChange={(e) => setSearchValue(e.target.value)}
                      data-testid="input-signature-id"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="email" className="mt-0">
                  <div className="space-y-2">
                    <Label htmlFor="signer-email">Signer's Email</Label>
                    <Input
                      id="signer-email"
                      type="email"
                      placeholder="signer@example.com"
                      value={searchValue}
                      onChange={(e) => setSearchValue(e.target.value)}
                      data-testid="input-signer-email"
                    />
                  </div>
                </TabsContent>

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={!searchValue.trim() || isLoading}
                  data-testid="button-search"
                >
                  {isLoading ? (
                    <>Searching...</>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Search
                    </>
                  )}
                </Button>
              </form>
            </Tabs>
          </CardContent>
        </Card>

        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {error && (
          <Card className="border-destructive">
            <CardContent className="py-8 text-center">
              <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
              <p className="text-destructive font-medium">Error searching signatures</p>
              <p className="text-sm text-muted-foreground mt-2">
                Please try again or contact support if the problem persists.
              </p>
            </CardContent>
          </Card>
        )}

        {activeSearch && !isLoading && !error && signatures.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No signatures found</h3>
              <p className="text-sm text-muted-foreground">
                {searchType === "id" 
                  ? "No signature matches this ID. Please check and try again."
                  : "No signatures found for this email address."}
              </p>
            </CardContent>
          </Card>
        )}

        {signatures.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              {signatures.length === 1 ? "Signature Found" : `${signatures.length} Signatures Found`}
            </h2>

            {signatures.map((signature) => (
              <Card key={signature.id} data-testid={`card-signature-${signature.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
                        <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                        <span className="truncate">{signature.document_name || "Untitled Document"}</span>
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Verified
                        </Badge>
                      </CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4 text-sm">
                    <div className="flex items-start gap-2">
                      <User className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="font-medium">Signed By</p>
                        <p className="text-muted-foreground">{signature.signer_name}</p>
                      </div>
                    </div>

                    {signature.signer_email && (
                      <div className="flex items-start gap-2">
                        <Mail className="w-4 h-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="font-medium">Email</p>
                          <p className="text-muted-foreground">{signature.signer_email}</p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-start gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="font-medium">Signed At</p>
                        <p className="text-muted-foreground">
                          {new Date(signature.signed_at).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="font-medium">Signature</p>
                        <p className="text-muted-foreground font-serif italic">"{signature.signature_text}"</p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t flex flex-wrap gap-2">
                    <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                      ID: {signature.id}
                    </code>
                  </div>

                  {signature.signed_pdf_url && (
                    <Button asChild className="w-full sm:w-auto">
                      <a
                        href={signature.signed_pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`link-download-${signature.id}`}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download Signed Document
                      </a>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
