import { supabaseServer } from "../lib/supabaseServer";
import fs from "fs";
import path from "path";

const BUCKET_NAME = "contract-templates";

async function ensureBucketExists() {
  const supabase = supabaseServer();
  const { data: buckets } = await supabase.storage.listBuckets();
  const bucketExists = buckets?.some((b) => b.name === BUCKET_NAME);

  if (!bucketExists) {
    const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ["application/pdf"],
    });
    if (error && !error.message.includes("already exists")) {
      console.error("Failed to create bucket:", error);
      throw new Error("Failed to initialize storage");
    }
    console.log("Created bucket:", BUCKET_NAME);
  } else {
    console.log("Bucket already exists:", BUCKET_NAME);
  }
}

async function uploadContractPdf() {
  const supabase = supabaseServer();
  
  await ensureBucketExists();
  
  const pdfPath = path.join(
    process.cwd(),
    "attached_assets/Generous_Giving_Contract_1765654440844.pdf"
  );
  
  if (!fs.existsSync(pdfPath)) {
    console.error("PDF file not found at:", pdfPath);
    process.exit(1);
  }
  
  const pdfBuffer = fs.readFileSync(pdfPath);
  const fileName = "generous-giving-partnership-contract.pdf";
  
  const { data: existingFile } = await supabase.storage
    .from(BUCKET_NAME)
    .list("", { search: fileName });
  
  if (existingFile && existingFile.length > 0) {
    await supabase.storage.from(BUCKET_NAME).remove([fileName]);
    console.log("Removed existing file");
  }
  
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) {
    console.error("Upload error:", error);
    process.exit(1);
  }

  const { data: publicUrlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(fileName);

  console.log("\n✅ PDF uploaded successfully!");
  console.log("Public URL:", publicUrlData.publicUrl);
  console.log("\nUpdate PLACEHOLDER_PDF_URL in ChurchContractSigning.tsx to:");
  console.log(`const PLACEHOLDER_PDF_URL = "${publicUrlData.publicUrl}";`);
}

uploadContractPdf().catch(console.error);
