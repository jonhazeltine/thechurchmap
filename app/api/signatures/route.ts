import type { Request, Response } from "express";
import { supabaseServer } from "../../../lib/supabaseServer";
import { z } from "zod";
import { sendContractCompletionEmail } from "../../../server/services/resend-email";
import { generateContractPdf, ContractData } from "../../../server/services/contract-pdf-generator";

const VALID_CONTRACT_TYPES = ["generous_giving"] as const;

const createSignatureSchema = z.object({
  document_name: z.string().optional(),
  signer_name: z.string().min(1, "Signer name is required"),
  signer_email: z.string().email().optional().or(z.literal("")),
  signature_text: z.string().min(1, "Signature text is required"),
  original_pdf_url: z.string().url().optional(),
  church_id: z.string().uuid().optional(),
  contract_type: z.enum(VALID_CONTRACT_TYPES).optional(),
  signer_number: z.union([z.literal(1), z.literal(2)]).optional(),
  signer_title: z.string().optional(),
  effective_date: z.string().optional(),
  previous_signature_id: z.string().uuid().optional(),
});

export async function POST(req: Request, res: Response) {
  try {
    const validationResult = createSignatureSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validationResult.error.errors,
      });
    }

    const {
      document_name,
      signer_name,
      signer_email,
      signature_text,
      original_pdf_url,
      church_id,
      contract_type,
      signer_number,
      signer_title,
      effective_date,
      previous_signature_id,
    } = validationResult.data;

    const ip_address =
      req.headers["x-forwarded-for"]?.toString().split(",")[0] ||
      req.socket.remoteAddress ||
      null;

    let verified_church_name = "";
    let verified_church_address = "";

    if (contract_type && church_id) {
      const { data: churchData, error: churchError } = await supabaseServer()
        .from("churches")
        .select("name, address, city, state, zip")
        .eq("id", church_id)
        .single();

      if (churchError || !churchData) {
        return res.status(400).json({ error: "Church not found" });
      }
      verified_church_name = churchData.name;
      verified_church_address = [churchData.address, churchData.city, churchData.state, churchData.zip]
        .filter(Boolean)
        .join(", ");
    }

    interface PreviousSignature {
      id: string;
      church_id: string | null;
      contract_type: string | null;
      signer_number: number | null;
      signed_pdf_url: string | null;
      signer_name: string;
      signer_email: string | null;
      signer_title: string | null;
      signature_text: string;
      signed_at: string;
    }
    let validatedPreviousSig: PreviousSignature | null = null;

    if (signer_number === 2 && previous_signature_id && contract_type && church_id) {
      const { data: prevSig, error: prevError } = await supabaseServer()
        .from("document_signatures")
        .select("id, church_id, contract_type, signer_number, signed_pdf_url, signer_name, signer_email, signer_title, signature_text, signed_at")
        .eq("id", previous_signature_id)
        .single();

      if (prevError || !prevSig) {
        return res.status(400).json({ error: "Invalid signing link. The first signature was not found." });
      }

      if (prevSig.church_id !== church_id) {
        return res.status(400).json({ error: "Invalid signing link. Church mismatch." });
      }

      if (prevSig.contract_type !== contract_type) {
        return res.status(400).json({ error: "Invalid signing link. Contract type mismatch." });
      }

      if (prevSig.signer_number !== 1) {
        return res.status(400).json({ error: "Invalid signing link. Expected first signer signature." });
      }

      validatedPreviousSig = prevSig as PreviousSignature;
    }

    let signed_pdf_url: string | null = null;

    if (contract_type && signer_number) {
      try {
        const currentDate = new Date().toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });

        const contractData: ContractData = {
          churchName: verified_church_name,
          churchAddress: verified_church_address,
          effectiveDate: effective_date || currentDate,
        };

        if (signer_number === 1) {
          contractData.signer1 = {
            name: signer_name,
            title: signer_title || "",
            date: currentDate,
            signature: signature_text,
          };
        } else if (signer_number === 2 && validatedPreviousSig) {
          const signer1Date = validatedPreviousSig.signed_at
            ? new Date(validatedPreviousSig.signed_at).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })
            : currentDate;

          contractData.signer1 = {
            name: validatedPreviousSig.signer_name,
            title: validatedPreviousSig.signer_title || "",
            date: signer1Date,
            signature: validatedPreviousSig.signature_text,
          };
          contractData.signer2 = {
            name: signer_name,
            title: signer_title || "",
            date: currentDate,
            signature: signature_text,
          };
        }

        console.log(`Generating contract PDF for signer ${signer_number}`);
        const pdfBytes = await generateContractPdf(contractData);
        console.log(`PDF generated: ${pdfBytes.length} bytes`);

        const fileName = `signed/${Date.now()}_${document_name || "document"}.pdf`;
        console.log(`Uploading signed PDF to Supabase: ${fileName}`);
        const { data: uploadData, error: uploadError } = await supabaseServer()
          .storage
          .from("contract-templates")
          .upload(fileName, pdfBytes, {
            contentType: "application/pdf",
            upsert: false,
          });

        if (uploadError) {
          console.error("Supabase upload error:", uploadError);
        }

        if (!uploadError && uploadData) {
          const { data: publicUrlData } = supabaseServer()
            .storage
            .from("contract-templates")
            .getPublicUrl(fileName);
          signed_pdf_url = publicUrlData.publicUrl;
          console.log(`Upload successful, URL: ${signed_pdf_url}`);
        }
      } catch (pdfError) {
        console.error("Error generating PDF:", pdfError);
      }
    }

    if (contract_type && !signed_pdf_url) {
      return res.status(400).json({
        error: "Failed to generate contract PDF. Please try again.",
      });
    }

    const { data: signature, error: dbError } = await supabaseServer()
      .from("document_signatures")
      .insert({
        document_name,
        signer_name,
        signer_email: signer_email || null,
        signature_text,
        ip_address,
        original_pdf_url,
        signed_pdf_url,
        church_id: church_id || null,
        contract_type: contract_type || null,
        signer_number: signer_number || null,
        signer_title: signer_title || null,
        previous_signature_id: previous_signature_id || null,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Error creating signature record:", dbError);
      return res.status(500).json({ error: "Failed to create signature record" });
    }

    if (contract_type && signer_number === 2 && signed_pdf_url && validatedPreviousSig) {
      sendContractCompletionEmail({
        churchName: verified_church_name,
        signedPdfUrl: signed_pdf_url,
        signer1Name: validatedPreviousSig.signer_name,
        signer1Email: validatedPreviousSig.signer_email || undefined,
        signer2Name: signer_name,
        signer2Email: signer_email || undefined,
      }).catch((err) => console.error("Email notification failed:", err));
    }

    return res.status(201).json({
      signature,
      message: "Document signed successfully",
    });
  } catch (error) {
    console.error("Error in POST /api/signatures:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

