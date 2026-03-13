/**
 * Contract Field Configuration for Generous Giving Partnership Agreement
 * 
 * PDF Coordinates:
 * - Origin is bottom-left of page
 * - Letter size: 612 x 792 points
 * - All coordinates are in PDF points
 */

export type ContractFieldType = 'signature' | 'text' | 'date' | 'address';

export type AutoFillSource = 'church_name' | 'church_address' | 'effective_date';

export interface ContractFieldConfig {
  id: string;
  label: string;
  type: ContractFieldType;
  page: number; // 1-indexed
  x: number; // PDF x coordinate (from left)
  y: number; // PDF y coordinate (from bottom)
  width?: number; // Optional field width in points
  fontSize?: number; // Optional, default 10
  signer?: 1 | 2; // Which signer fills this field
  autoFill?: AutoFillSource; // Auto-populate from church data
}

/**
 * All fillable fields in the Generous Giving Contract PDF
 * 
 * Field positions are estimated and will need tuning when testing with actual PDF.
 * Standard signature blocks are typically in the lower half of signature pages.
 */
export const GENEROUS_GIVING_CONTRACT_FIELDS: ContractFieldConfig[] = [
  // =========================================================================
  // SIGNATURE PAGE - Charity Signer 1 (Page 5)
  // =========================================================================
  {
    id: 'signer1_signature',
    label: 'Authorized Signer 1 Signature',
    type: 'signature',
    page: 5,
    x: 72,
    y: 380,
    width: 200,
    fontSize: 12,
    signer: 1,
  },
  {
    id: 'signer1_name',
    label: 'Authorized Signer 1 Name',
    type: 'text',
    page: 5,
    x: 72,
    y: 350,
    width: 200,
    fontSize: 10,
    signer: 1,
  },
  {
    id: 'signer1_title',
    label: 'Authorized Signer 1 Title',
    type: 'text',
    page: 5,
    x: 72,
    y: 320,
    width: 200,
    fontSize: 10,
    signer: 1,
  },
  {
    id: 'signer1_date',
    label: 'Authorized Signer 1 Date',
    type: 'date',
    page: 5,
    x: 350,
    y: 380,
    width: 120,
    fontSize: 10,
    signer: 1,
  },
  {
    id: 'signer1_address',
    label: 'Authorized Signer 1 Address',
    type: 'address',
    page: 5,
    x: 72,
    y: 290,
    width: 300,
    fontSize: 10,
    signer: 1,
  },

  // =========================================================================
  // SIGNATURE PAGE - Charity Signer 2 (Page 5 or 6)
  // =========================================================================
  {
    id: 'signer2_signature',
    label: 'Authorized Signer 2 Signature',
    type: 'signature',
    page: 5,
    x: 72,
    y: 220,
    width: 200,
    fontSize: 12,
    signer: 2,
  },
  {
    id: 'signer2_name',
    label: 'Authorized Signer 2 Name',
    type: 'text',
    page: 5,
    x: 72,
    y: 190,
    width: 200,
    fontSize: 10,
    signer: 2,
  },
  {
    id: 'signer2_title',
    label: 'Authorized Signer 2 Title',
    type: 'text',
    page: 5,
    x: 72,
    y: 160,
    width: 200,
    fontSize: 10,
    signer: 2,
  },
  {
    id: 'signer2_date',
    label: 'Authorized Signer 2 Date',
    type: 'date',
    page: 5,
    x: 350,
    y: 220,
    width: 120,
    fontSize: 10,
    signer: 2,
  },
  {
    id: 'signer2_address',
    label: 'Authorized Signer 2 Address',
    type: 'address',
    page: 5,
    x: 72,
    y: 130,
    width: 300,
    fontSize: 10,
    signer: 2,
  },

  // =========================================================================
  // EXHIBIT A - Contract Details (Page 7)
  // =========================================================================
  {
    id: 'exhibit_effective_date',
    label: 'Effective Date',
    type: 'date',
    page: 7,
    x: 200,
    y: 700,
    width: 150,
    fontSize: 10,
    autoFill: 'effective_date',
  },
  {
    id: 'exhibit_charity_name_1',
    label: 'Charity Name (First Instance)',
    type: 'text',
    page: 7,
    x: 72,
    y: 650,
    width: 300,
    fontSize: 10,
    autoFill: 'church_name',
  },
  {
    id: 'exhibit_charity_name_2',
    label: 'Charity Name (Second Instance)',
    type: 'text',
    page: 7,
    x: 72,
    y: 500,
    width: 300,
    fontSize: 10,
    autoFill: 'church_name',
  },
  {
    id: 'exhibit_charity_address',
    label: 'Charity Address for Notices',
    type: 'address',
    page: 7,
    x: 72,
    y: 400,
    width: 350,
    fontSize: 10,
    autoFill: 'church_address',
  },

  // =========================================================================
  // ADDITIONAL CHARITY NAME INSTANCES (Throughout Document)
  // These may appear on multiple pages - adjust page numbers as needed
  // =========================================================================
  {
    id: 'page1_charity_name',
    label: 'Charity Name (Page 1 Header)',
    type: 'text',
    page: 1,
    x: 72,
    y: 720,
    width: 300,
    fontSize: 10,
    autoFill: 'church_name',
  },
  {
    id: 'page2_charity_name',
    label: 'Charity Name (Page 2)',
    type: 'text',
    page: 2,
    x: 72,
    y: 720,
    width: 300,
    fontSize: 10,
    autoFill: 'church_name',
  },
];

/**
 * Get all fields that should be filled by a specific signer
 * @param signerNumber - 1 or 2
 * @returns Array of ContractFieldConfig for that signer
 */
export function getFieldsForSigner(signerNumber: 1 | 2): ContractFieldConfig[] {
  return GENEROUS_GIVING_CONTRACT_FIELDS.filter(
    (field) => field.signer === signerNumber
  );
}

/**
 * Get all fields that can be auto-filled from church data
 * @returns Array of ContractFieldConfig with autoFill property
 */
export function getAutoFillFields(): ContractFieldConfig[] {
  return GENEROUS_GIVING_CONTRACT_FIELDS.filter(
    (field) => field.autoFill !== undefined
  );
}

/**
 * Get fields by type
 * @param type - The field type to filter by
 * @returns Array of ContractFieldConfig of that type
 */
export function getFieldsByType(type: ContractFieldType): ContractFieldConfig[] {
  return GENEROUS_GIVING_CONTRACT_FIELDS.filter(
    (field) => field.type === type
  );
}

/**
 * Get fields by page number
 * @param page - The page number (1-indexed)
 * @returns Array of ContractFieldConfig on that page
 */
export function getFieldsByPage(page: number): ContractFieldConfig[] {
  return GENEROUS_GIVING_CONTRACT_FIELDS.filter(
    (field) => field.page === page
  );
}

/**
 * Get a specific field by ID
 * @param id - The field ID
 * @returns ContractFieldConfig or undefined
 */
export function getFieldById(id: string): ContractFieldConfig | undefined {
  return GENEROUS_GIVING_CONTRACT_FIELDS.find((field) => field.id === id);
}

/**
 * PDF coordinate constants for reference
 */
export const PDF_CONSTANTS = {
  LETTER_WIDTH: 612,
  LETTER_HEIGHT: 792,
  DEFAULT_MARGIN: 72, // 1 inch = 72 points
  DEFAULT_FONT_SIZE: 10,
  SIGNATURE_FONT_SIZE: 12,
} as const;
