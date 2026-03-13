import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, FileText, Loader2, Download, PenLine } from "lucide-react";

const signatureFormSchema = z.object({
  signer_name: z.string().min(1, "Your name is required"),
  signer_email: z.string().email("Please enter a valid email").optional().or(z.literal("")),
  signature_text: z.string().min(1, "Please type your signature"),
});

type SignatureFormValues = z.infer<typeof signatureFormSchema>;

interface DocumentSignatureProps {
  documentName?: string;
  pdfUrl?: string;
  churchId?: string;
  onSignatureComplete?: (signatureId: string) => void;
}

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

export function DocumentSignature({
  documentName = "Document",
  pdfUrl,
  churchId,
  onSignatureComplete,
}: DocumentSignatureProps) {
  const { toast } = useToast();
  const [signedSignatureId, setSignedSignatureId] = useState<string | null>(null);

  const form = useForm<SignatureFormValues>({
    resolver: zodResolver(signatureFormSchema),
    defaultValues: {
      signer_name: "",
      signer_email: "",
      signature_text: "",
    },
  });

  const { data: signatureRecord, isLoading: isLoadingSignature } = useQuery<SignatureRecord>({
    queryKey: ["/api/signatures", signedSignatureId],
    queryFn: async () => {
      const response = await fetch(`/api/signatures/${signedSignatureId}`);
      if (!response.ok) throw new Error("Failed to fetch signature");
      return response.json();
    },
    enabled: !!signedSignatureId,
  });

  const signMutation = useMutation({
    mutationFn: async (values: SignatureFormValues) => {
      return apiRequest("POST", "/api/signatures", {
        document_name: documentName,
        signer_name: values.signer_name,
        signer_email: values.signer_email || undefined,
        signature_text: values.signature_text,
        original_pdf_url: pdfUrl,
        church_id: churchId,
      });
    },
    onSuccess: (data) => {
      setSignedSignatureId(data.signature.id);
      queryClient.invalidateQueries({ queryKey: ["/api/signatures"] });
      toast({
        title: "Document Signed",
        description: "Your signature has been recorded successfully.",
      });
      if (onSignatureComplete) {
        onSignatureComplete(data.signature.id);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to sign the document",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (values: SignatureFormValues) => {
    signMutation.mutate(values);
  };

  const handleCopySignature = () => {
    form.setValue("signature_text", form.getValues("signer_name"));
  };

  if (signedSignatureId && signatureRecord) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-6 w-6 text-green-600" />
            <CardTitle data-testid="text-signature-success">Document Signed Successfully</CardTitle>
          </div>
          <CardDescription>
            Your signature has been recorded and embedded into the document.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-muted p-4 space-y-2">
            <p className="text-sm">
              <strong>Document:</strong> {signatureRecord.document_name}
            </p>
            <p className="text-sm">
              <strong>Signed by:</strong> {signatureRecord.signer_name}
            </p>
            <p className="text-sm">
              <strong>Signature:</strong> "{signatureRecord.signature_text}"
            </p>
            <p className="text-sm">
              <strong>Signed at:</strong>{" "}
              {new Date(signatureRecord.signed_at).toLocaleString()}
            </p>
            {signatureRecord.signer_email && (
              <p className="text-sm">
                <strong>Email:</strong> {signatureRecord.signer_email}
              </p>
            )}
          </div>

          {signatureRecord.signed_pdf_url && (
            <Button asChild className="w-full">
              <a
                href={signatureRecord.signed_pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-download-signed-pdf"
              >
                <Download className="h-4 w-4 mr-2" />
                Download Signed Document
              </a>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6 text-muted-foreground" />
          <CardTitle data-testid="text-document-title">{documentName}</CardTitle>
        </div>
        <CardDescription>
          Please review the document and type your name to sign it electronically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {pdfUrl && (
          <div className="border rounded-md overflow-hidden">
            <iframe
              src={pdfUrl}
              className="w-full h-96"
              title="PDF Document"
              data-testid="iframe-pdf-viewer"
            />
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="signer_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Your Full Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter your full legal name"
                      {...field}
                      data-testid="input-signer-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="signer_email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="your@email.com"
                      {...field}
                      data-testid="input-signer-email"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="signature_text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type Your Signature</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input
                        placeholder="Type your name exactly as your signature"
                        className="font-serif italic text-lg"
                        {...field}
                        data-testid="input-signature-text"
                      />
                    </FormControl>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleCopySignature}
                      title="Copy name as signature"
                      data-testid="button-copy-name"
                    >
                      <PenLine className="h-4 w-4" />
                    </Button>
                  </div>
                  <FormMessage />
                  {field.value && (
                    <div className="mt-2 p-3 border-b-2 border-dashed border-muted-foreground/30">
                      <p
                        className="font-serif italic text-xl text-center"
                        data-testid="text-signature-preview"
                      >
                        {field.value}
                      </p>
                    </div>
                  )}
                </FormItem>
              )}
            />

            <div className="pt-4">
              <Button
                type="submit"
                className="w-full"
                disabled={signMutation.isPending}
                data-testid="button-sign-document"
              >
                {signMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Signing Document...
                  </>
                ) : (
                  <>
                    <PenLine className="h-4 w-4 mr-2" />
                    Sign Document
                  </>
                )}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              By clicking "Sign Document", you agree that your typed signature is legally
              binding and equivalent to a handwritten signature.
            </p>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
