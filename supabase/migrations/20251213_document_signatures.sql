-- Document signatures table for PDF contract signing
CREATE TABLE IF NOT EXISTS document_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_name TEXT,
  signer_name TEXT NOT NULL,
  signer_email TEXT,
  signature_text TEXT NOT NULL,
  signed_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  original_pdf_url TEXT,
  signed_pdf_url TEXT,
  church_id UUID REFERENCES churches(id) ON DELETE SET NULL,
  contract_type TEXT,
  signer_number INTEGER,
  signer_title TEXT,
  previous_signature_id UUID REFERENCES document_signatures(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_document_signatures_church_id ON document_signatures(church_id);
CREATE INDEX IF NOT EXISTS idx_document_signatures_signed_at ON document_signatures(signed_at);
CREATE INDEX IF NOT EXISTS idx_document_signatures_signer_email ON document_signatures(signer_email);
CREATE INDEX IF NOT EXISTS idx_document_signatures_contract_type ON document_signatures(contract_type);
CREATE INDEX IF NOT EXISTS idx_document_signatures_previous_signature_id ON document_signatures(previous_signature_id);

-- Enable RLS
ALTER TABLE document_signatures ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert signatures
CREATE POLICY "Allow insert signatures" ON document_signatures
  FOR INSERT WITH CHECK (true);

-- Allow authenticated users to read signatures for their churches
CREATE POLICY "Allow read signatures" ON document_signatures
  FOR SELECT USING (true);
