import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";

export interface ContractData {
  churchName: string;
  churchAddress: string;
  effectiveDate: string;
  signer1?: {
    name: string;
    title: string;
    date: string;
    signature: string;
  };
  signer2?: {
    name: string;
    title: string;
    date: string;
    signature: string;
  };
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

const BODY_FONT_SIZE = 10;
const HEADING_FONT_SIZE = 12;
const SECTION_TITLE_FONT_SIZE = 11;
const STATE_NAME_FONT_SIZE = 10;
const SIGNATURE_FONT_SIZE = 14;
const LINE_HEIGHT = 1.4;

interface PDFContext {
  doc: PDFDocument;
  helvetica: PDFFont;
  helveticaBold: PDFFont;
  timesItalic: PDFFont;
  currentPage: PDFPage;
  currentY: number;
  pageNumber: number;
}

function addNewPage(ctx: PDFContext): void {
  ctx.currentPage = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.currentY = PAGE_HEIGHT - MARGIN;
  ctx.pageNumber++;
}

function addPageNumber(ctx: PDFContext): void {
  const text = `Page ${ctx.pageNumber}`;
  const textWidth = ctx.helvetica.widthOfTextAtSize(text, 9);
  ctx.currentPage.drawText(text, {
    x: (PAGE_WIDTH - textWidth) / 2,
    y: 25,
    size: 9,
    font: ctx.helvetica,
    color: rgb(0.4, 0.4, 0.4),
  });
}

function checkPageBreak(ctx: PDFContext, neededHeight: number): void {
  if (ctx.currentY - neededHeight < MARGIN + 30) {
    addPageNumber(ctx);
    addNewPage(ctx);
  }
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);

    if (width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
}

function drawText(
  ctx: PDFContext,
  text: string,
  font: PDFFont,
  fontSize: number,
  options: { indent?: number; maxWidth?: number } = {}
): void {
  const indent = options.indent || 0;
  const maxWidth = options.maxWidth || CONTENT_WIDTH - indent;
  const lines = wrapText(text, font, fontSize, maxWidth);
  const lineHeight = fontSize * LINE_HEIGHT;

  for (const line of lines) {
    checkPageBreak(ctx, lineHeight);
    ctx.currentPage.drawText(line, {
      x: MARGIN + indent,
      y: ctx.currentY,
      size: fontSize,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    ctx.currentY -= lineHeight;
  }
}

function drawParagraph(
  ctx: PDFContext,
  text: string,
  font: PDFFont,
  fontSize: number,
  options: { indent?: number; spacingAfter?: number } = {}
): void {
  drawText(ctx, text, font, fontSize, options);
  ctx.currentY -= options.spacingAfter ?? fontSize * 0.8;
}

function drawHeading(ctx: PDFContext, text: string, centered: boolean = false): void {
  checkPageBreak(ctx, HEADING_FONT_SIZE * 2);
  
  if (centered) {
    const textWidth = ctx.helveticaBold.widthOfTextAtSize(text, HEADING_FONT_SIZE);
    ctx.currentPage.drawText(text, {
      x: (PAGE_WIDTH - textWidth) / 2,
      y: ctx.currentY,
      size: HEADING_FONT_SIZE,
      font: ctx.helveticaBold,
      color: rgb(0.1, 0.1, 0.1),
    });
  } else {
    ctx.currentPage.drawText(text, {
      x: MARGIN,
      y: ctx.currentY,
      size: HEADING_FONT_SIZE,
      font: ctx.helveticaBold,
      color: rgb(0.1, 0.1, 0.1),
    });
  }
  ctx.currentY -= HEADING_FONT_SIZE * 1.8;
}

function drawSectionTitle(ctx: PDFContext, text: string): void {
  checkPageBreak(ctx, SECTION_TITLE_FONT_SIZE * 2.5);
  ctx.currentY -= 8;
  ctx.currentPage.drawText(text, {
    x: MARGIN,
    y: ctx.currentY,
    size: SECTION_TITLE_FONT_SIZE,
    font: ctx.helveticaBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  ctx.currentY -= SECTION_TITLE_FONT_SIZE * 1.6;
}

function drawStateName(ctx: PDFContext, text: string): void {
  checkPageBreak(ctx, STATE_NAME_FONT_SIZE * 2);
  ctx.currentY -= 4;
  ctx.currentPage.drawText(text, {
    x: MARGIN,
    y: ctx.currentY,
    size: STATE_NAME_FONT_SIZE,
    font: ctx.helveticaBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  ctx.currentY -= STATE_NAME_FONT_SIZE * 1.4;
}

function drawNumberedItem(ctx: PDFContext, number: string, text: string, indent: number = 20): void {
  const numberWidth = ctx.helvetica.widthOfTextAtSize(number, BODY_FONT_SIZE);
  
  checkPageBreak(ctx, BODY_FONT_SIZE * LINE_HEIGHT);
  ctx.currentPage.drawText(number, {
    x: MARGIN + indent,
    y: ctx.currentY,
    size: BODY_FONT_SIZE,
    font: ctx.helvetica,
    color: rgb(0.1, 0.1, 0.1),
  });

  const textIndent = indent + numberWidth + 4;
  const lines = wrapText(text, ctx.helvetica, BODY_FONT_SIZE, CONTENT_WIDTH - textIndent);
  const lineHeight = BODY_FONT_SIZE * LINE_HEIGHT;

  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      checkPageBreak(ctx, lineHeight);
    }
    ctx.currentPage.drawText(lines[i], {
      x: MARGIN + textIndent,
      y: ctx.currentY,
      size: BODY_FONT_SIZE,
      font: ctx.helvetica,
      color: rgb(0.1, 0.1, 0.1),
    });
    ctx.currentY -= lineHeight;
  }
  ctx.currentY -= BODY_FONT_SIZE * 0.3;
}

function drawLetteredItem(ctx: PDFContext, letter: string, text: string): void {
  drawNumberedItem(ctx, letter, text, 40);
}

function drawSignatureBlock(
  ctx: PDFContext,
  label: string,
  signerData?: { name: string; title: string; date: string; signature: string }
): void {
  const blockHeight = 80;
  checkPageBreak(ctx, blockHeight);

  ctx.currentPage.drawText(label, {
    x: MARGIN,
    y: ctx.currentY,
    size: BODY_FONT_SIZE,
    font: ctx.helveticaBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  ctx.currentY -= BODY_FONT_SIZE * 1.5;

  if (signerData?.signature) {
    ctx.currentPage.drawText("DIGITALLY SIGNED", {
      x: MARGIN,
      y: ctx.currentY,
      size: 8,
      font: ctx.helveticaBold,
      color: rgb(0.2, 0.5, 0.2),
    });
    ctx.currentY -= 12;

    ctx.currentPage.drawText(signerData.signature, {
      x: MARGIN,
      y: ctx.currentY,
      size: SIGNATURE_FONT_SIZE,
      font: ctx.timesItalic,
      color: rgb(0.1, 0.1, 0.4),
    });
  }
  ctx.currentY -= 20;

  ctx.currentPage.drawLine({
    start: { x: MARGIN, y: ctx.currentY },
    end: { x: MARGIN + 200, y: ctx.currentY },
    thickness: 0.5,
    color: rgb(0.4, 0.4, 0.4),
  });
  ctx.currentY -= BODY_FONT_SIZE * 1.2;

  const nameText = signerData?.name || "Name: ________________";
  const titleText = signerData?.title || "Title: ________________";
  const dateText = signerData?.date ? `Date: ${signerData.date}` : "Date: ________________";

  ctx.currentPage.drawText(nameText, {
    x: MARGIN,
    y: ctx.currentY,
    size: BODY_FONT_SIZE,
    font: ctx.helvetica,
    color: rgb(0.1, 0.1, 0.1),
  });
  ctx.currentY -= BODY_FONT_SIZE * 1.4;

  ctx.currentPage.drawText(titleText, {
    x: MARGIN,
    y: ctx.currentY,
    size: BODY_FONT_SIZE,
    font: ctx.helvetica,
    color: rgb(0.1, 0.1, 0.1),
  });
  ctx.currentY -= BODY_FONT_SIZE * 1.4;

  ctx.currentPage.drawText(dateText, {
    x: MARGIN,
    y: ctx.currentY,
    size: BODY_FONT_SIZE,
    font: ctx.helvetica,
    color: rgb(0.1, 0.1, 0.1),
  });
  ctx.currentY -= BODY_FONT_SIZE * 2;
}

function drawTableRow(
  ctx: PDFContext,
  cols: string[],
  colWidths: number[],
  font: PDFFont,
  isHeader: boolean = false
): void {
  const rowHeight = BODY_FONT_SIZE * 1.8;
  checkPageBreak(ctx, rowHeight);

  let x = MARGIN;
  for (let i = 0; i < cols.length; i++) {
    ctx.currentPage.drawRectangle({
      x,
      y: ctx.currentY - rowHeight + 4,
      width: colWidths[i],
      height: rowHeight,
      borderColor: rgb(0.6, 0.6, 0.6),
      borderWidth: 0.5,
      color: isHeader ? rgb(0.95, 0.95, 0.95) : undefined,
    });

    ctx.currentPage.drawText(cols[i], {
      x: x + 4,
      y: ctx.currentY - rowHeight + 8,
      size: BODY_FONT_SIZE,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    x += colWidths[i];
  }
  ctx.currentY -= rowHeight;
}

export async function generateContractPdf(data: ContractData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const timesItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);

  const ctx: PDFContext = {
    doc,
    helvetica,
    helveticaBold,
    timesItalic,
    currentPage: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    currentY: PAGE_HEIGHT - MARGIN,
    pageNumber: 1,
  };

  drawHeading(ctx, "CHARITABLE SALES PROMOTION & CO-VENTURE AND LICENSING AGREEMENT", true);
  ctx.currentY -= 10;

  const preamble = `This Charitable Sales Promotion & Co-Venture and Licensing Agreement (the "Agreement") is entered into on the Effective Date (as set forth on Exhibit A), by and between ${data.churchName}, a nonprofit 501(c)(3) corporation, ${data.churchAddress || "[Location]"} ("Charity"), and Andrew Arroyo Real Estate Inc. dba AARE ("Company") as set forth on Exhibit A. This Agreement is designed to clarify the two parties' responsibilities for regulatory compliance with state charitable sales promotions and commercial co-venture laws and regulations. Any capitalized term used in this Agreement without definition shall have the meaning ascribed to it in Exhibit A attached hereto, as completed in conjunction with the execution of this Agreement.`;
  drawParagraph(ctx, preamble, helvetica, BODY_FONT_SIZE);

  drawSectionTitle(ctx, "I. PURPOSE");
  drawParagraph(ctx, `The purpose of this Agreement is to benefit Charity and advance its not-for-profit mission. The Company desires to support Charity to carry out its mission and agrees to provide the support described in this Agreement. The Company understands that as a not-for-profit charitable organization, Charity cannot promote or endorse the Company's products or services. Charity acknowledges that the Promotion as set forth herein does not constitute any such impermissible promotion or endorsement.`, helvetica, BODY_FONT_SIZE);

  drawSectionTitle(ctx, "II. NATURE AND TERM OF PROMOTION");
  drawParagraph(ctx, `The Company shall conduct a charitable sales promotion (the "Promotion") in which it shall make a donation to Charity for each sale by the Company of certain products or services as described in Exhibit A (the "Promotion Service") as long as this Agreement remains effective (the "Promotion Period"). The Company shall provide to Charity a total donation equal to the amount as calculated based on the formula indicated on Exhibit A (the "Promotion Amount"). The geographic area of the Promotion shall be as indicated on Exhibit A (the "Geographic Location").`, helvetica, BODY_FONT_SIZE);

  drawSectionTitle(ctx, "III. USE OF INTELLECTUAL PROPERTY");
  drawParagraph(ctx, `Charity hereby grants the Company a limited, non-exclusive worldwide license (without the right to sublicense) to use Charity's trademark, attached as Exhibit B (the "Mark"), for the duration of this Agreement, for the sole purpose of manufacturing, distributing, marketing, promoting and selling the Promotion Service embodying the Mark. The Company shall use the Mark only as permitted under this Agreement. Any designs incorporating the Mark must be approved by Charity prior to production.`, helvetica, BODY_FONT_SIZE);
  drawParagraph(ctx, `Nothing in this Agreement shall be deemed to constitute or result in an assignment of the Mark to the Company or to give the Company any right, title or interest in or to the Mark other than the right to use the Mark in accordance with this Agreement. The Company shall not register or apply to register the Mark, or any confusingly similar mark, or represent that it owns the Mark. The Company will not attack or challenge in any court of law, or in any other manner, the title of Charity to the Mark or Charity's ownership of any copyrights in or distinctive features of the Mark, or the validity or enforceability of the Mark.`, helvetica, BODY_FONT_SIZE);

  drawSectionTitle(ctx, "IV. TERMINATION");
  drawParagraph(ctx, `Either Party may terminate this Agreement upon 14 days written notice to the other Party. Upon termination, the Company's right to use the Mark shall cease, and the Company shall immediately and permanently discontinue all use thereof and shall cease using the Charity name in any promotional activities. Within ninety (90) days following the termination of this Agreement, the Company shall provide Charity with final donations and accounting as described in Section V below. All obligations to comply with state laws and regulations under Section VIII of this Agreement shall survive the expiration or termination of this Agreement.`, helvetica, BODY_FONT_SIZE);

  drawSectionTitle(ctx, "V. PAYMENT AND ACCOUNTING");
  drawParagraph(ctx, `When and if the Company earns revenue attributable to its provision of the Promotion Service, it shall make donations to Charity as follows: The first donation, in the amount stated in Exhibit E based on sales of the Promotion Service, shall be made no later than 90 days following the start of the Promotion Period or 15 days following the receipt by the Company of the Promotion Service fee, whichever comes later. The Company shall make further donations to Charity, in the amount stated in Exhibit E based on sales of the Promotion Service (if any), on every 90-day anniversary of the start of the Promotion Period based on Promotion Service fees earned during such 90-day period, through expiration or termination of this Agreement. The Company shall provide Charity with a final accounting within 90 days following the end of the Promotion Period of the total donation made to Charity based on sales of the Promotion Service and shall retain the final accounting and make it available to the Charity for a period of three (3) years following completion of the Promotion.`, helvetica, BODY_FONT_SIZE);
  drawParagraph(ctx, `The Charity donation is deemed to occur contemporaneously with the successful close of an escrow during the Promotion Period from the purchase or sale of a residential or commercial property that benefited from the Promotion Service. All Charity donations shall be held in trust by the Company for the benefit of Charity until the donation is paid or delivered to Charity.`, helvetica, BODY_FONT_SIZE);

  drawSectionTitle(ctx, "VI. DISCLOSURE OF DONATION");
  drawParagraph(ctx, `Materials that inform the consumer of the donation being made to Charity must clearly state the amount or percentage of the Charity donation that shall result from the purchase of the Promotion Service, the time period during which purchase shall result in a donation to Charity.`, helvetica, BODY_FONT_SIZE);

  drawSectionTitle(ctx, "VII. CO-VENTURE STATEMENT OF RELATIONSHIP");
  drawParagraph(ctx, `Whenever the Company offers a Promotion Service for purchase to the public or promotes or advertises a Promotion Service, the following statement of relationship or a similarly-worded statement of relationship must be included on the advertisement and offer for sale: "The Company is proud to support Charity. For every purchase of PROMOTION SERVICE during PROMOTION PERIOD, the Company will donate PROMOTION AMOUNT to the Charity."`, helvetica, BODY_FONT_SIZE);

  drawSectionTitle(ctx, "VIII. COMPLIANCE WITH STATE LAWS");
  drawParagraph(ctx, `In conducting this promotion, both Charity and the Company agree to comply in a timely manner with the requirements of state laws and regulations applicable to each respective party with respect to the performance of its obligations hereunder. The parties further acknowledge and agree that the Promotion set out in this Agreement is subject to the requirements of the various state charitable solicitation laws. The Company and Charity acknowledge that some states impose registration requirements on co-venturers. The Company agrees that it has and will continue to comply with all registration requirements for co-venturers, including but not limited to the applicable requirements set forth in Exhibit C, in all states in which the Company intends to participate in the Promotion. Charity represents and warrants that it has complied with all federal and state laws allowing it to solicit funds. Charity agrees that it has and will continue to comply with all necessary registration requirements to validate the co-venturer relationship, including but not limited to the applicable requirements as may be set forth in Exhibit D.`, helvetica, BODY_FONT_SIZE);

  drawSectionTitle(ctx, "IX. RESOLUTION OF CONFLICTS");
  drawParagraph(ctx, `The Parties agree in good faith to make every effort to resolve disputes that arise in the performance of this Agreement. Each Party shall make its best efforts to resolve any disputes informally or through a mutually agreed-upon mediator. However, in the event that mediation or informal resolution fails, the Parties will bring their claims arising under this Agreement in a court in the Southern District of California, and this Agreement shall then be governed by the laws of the state of California.`, helvetica, BODY_FONT_SIZE);

  drawSectionTitle(ctx, "X. LIABILITY AND INDEMNIFICATION");
  drawParagraph(ctx, `The Company and Charity agree that each party is responsible for its own business activities and will not be held liable for the activities of the other party, except that the Company agrees to indemnify and hold harmless Charity, and its employees, representatives, and agents from any and all liability, loss, damage, cost or expense, including reasonable counsel fees and expenses, paid or incurred in connection with the Company's operation of the Promotion or sale of any products or services, or by reason of the Company's intentional or negligent conduct relating to performance of this Agreement. Charity assumes no liability to third parties with respect to the provision of any goods or services and/or any use of the Mark by the Company. The Company shall not be required to indemnify, defend or hold Charity harmless against claims asserting that the Mark infringes any trademark, copyright or other proprietary rights.`, helvetica, BODY_FONT_SIZE);

  drawSectionTitle(ctx, "XI. NOTICE");
  drawParagraph(ctx, `All notices pertaining to this Agreement shall be in writing and shall be transmitted either by personal hand delivery, by overnight delivery, through the United States Postal Service by registered or certified mail, return receipt requested, or by electronic mail. Notices shall be sent to the following addresses for the respective parties unless written notice of a change of address is given:`, helvetica, BODY_FONT_SIZE);

  drawParagraph(ctx, "For Charity:", helveticaBold, BODY_FONT_SIZE, { spacingAfter: 2 });
  drawParagraph(ctx, data.churchName, helvetica, BODY_FONT_SIZE, { spacingAfter: 2 });
  drawParagraph(ctx, data.churchAddress || "[Address to be provided]", helvetica, BODY_FONT_SIZE);

  drawParagraph(ctx, "For the Company, the address set forth on Exhibit A, with a copy, not constituting notice, to:", helveticaBold, BODY_FONT_SIZE, { spacingAfter: 2 });
  drawParagraph(ctx, "CKR Law", helvetica, BODY_FONT_SIZE, { spacingAfter: 2 });
  drawParagraph(ctx, "Attn: Ross Meador", helvetica, BODY_FONT_SIZE, { spacingAfter: 2 });
  drawParagraph(ctx, "5151 California Ave., Suite 100, Irvine, CA 92612", helvetica, BODY_FONT_SIZE);

  drawSectionTitle(ctx, "XII. MISCELLANEOUS PROVISIONS");
  drawParagraph(ctx, "A. Waiver: No failure of any Party to exercise or enforce any of its rights under this Agreement will act as a waiver of such rights.", helvetica, BODY_FONT_SIZE, { spacingAfter: 4 });
  drawParagraph(ctx, "B. Severability: If any provision of this Agreement is found invalid or unenforceable, that provision will be enforced to the maximum extent permissible, and the other provisions of this Agreement will remain in force.", helvetica, BODY_FONT_SIZE, { spacingAfter: 4 });
  drawParagraph(ctx, "C. Entire Agreement: This Agreement and its exhibits are the complete and exclusive agreement between the Parties with respect to the subject matter hereof, superseding and replacing any and all prior agreements, communications, and understandings, both written and oral, regarding such subject matter.", helvetica, BODY_FONT_SIZE, { spacingAfter: 4 });
  drawParagraph(ctx, "D. Modification: This Agreement may only be modified, or any rights under it waived, by a written document executed by all Parties.", helvetica, BODY_FONT_SIZE, { spacingAfter: 4 });
  drawParagraph(ctx, "E. Execution: This Agreement may be executed in any number of counterparts, all of which taken together will constitute a single instrument. Execution and delivery of this Agreement may be evidenced by facsimile transmission.", helvetica, BODY_FONT_SIZE);

  ctx.currentY -= 10;
  drawParagraph(ctx, "IN WITNESS WHEREOF, the Parties have caused this Agreement to be executed by their duly authorized representatives as of the date first written above.", helveticaBold, BODY_FONT_SIZE);

  ctx.currentY -= 10;
  drawHeading(ctx, "SIGNATURES");

  drawParagraph(ctx, "CHARITY", helveticaBold, BODY_FONT_SIZE, { spacingAfter: 2 });
  drawParagraph(ctx, "(Two signatures from charity required.)", helvetica, BODY_FONT_SIZE - 1, { spacingAfter: 2 });
  drawParagraph(ctx, data.churchName, helvetica, BODY_FONT_SIZE);

  ctx.currentY -= 5;
  drawSignatureBlock(ctx, "Authorized Signer 1:", data.signer1);
  drawSignatureBlock(ctx, "Authorized Signer 2:", data.signer2);

  ctx.currentY -= 10;
  drawParagraph(ctx, "COMPANY", helveticaBold, BODY_FONT_SIZE, { spacingAfter: 2 });
  drawParagraph(ctx, "Andrew Arroyo Real Estate Inc. dba AARE", helvetica, BODY_FONT_SIZE);
  ctx.currentY -= 5;
  drawSignatureBlock(ctx, "Authorized Representative:");

  addPageNumber(ctx);
  addNewPage(ctx);

  drawHeading(ctx, "EXHIBIT A - INFORMATION SHEET AND DEFINITIONS");
  drawParagraph(ctx, "TO THE CHARITABLE SALES PROMOTION & CO-VENTURE AND LICENSING AGREEMENT", helveticaBold, BODY_FONT_SIZE);

  ctx.currentY -= 5;
  drawParagraph(ctx, `Effective Date: ${data.effectiveDate}`, helvetica, BODY_FONT_SIZE, { spacingAfter: 4 });
  drawParagraph(ctx, "Company: Legal Name: Andrew Arroyo Real Estate Inc. dba AARE", helvetica, BODY_FONT_SIZE, { spacingAfter: 4 });
  drawParagraph(ctx, "Type of Entity: Corporation", helvetica, BODY_FONT_SIZE, { spacingAfter: 4 });
  drawParagraph(ctx, "Address: 12636 High Bluff Drive Suite 400, San Diego, CA 92130", helvetica, BODY_FONT_SIZE, { spacingAfter: 4 });
  drawParagraph(ctx, "Federal EIN: 80-0107820", helvetica, BODY_FONT_SIZE, { spacingAfter: 4 });
  drawParagraph(ctx, "Website: www.aare.org", helvetica, BODY_FONT_SIZE, { spacingAfter: 4 });
  drawParagraph(ctx, "Telephone: 888-32-AGENT", helvetica, BODY_FONT_SIZE, { spacingAfter: 4 });
  drawParagraph(ctx, "Email Address: ama@aare.org", helvetica, BODY_FONT_SIZE, { spacingAfter: 4 });
  drawParagraph(ctx, "Fax: 858-720-1166", helvetica, BODY_FONT_SIZE);

  ctx.currentY -= 8;
  drawParagraph(ctx, "Promotion Period: On-going, without end until termination by one party of this agreement", helvetica, BODY_FONT_SIZE);
  drawParagraph(ctx, "Promotion Service: Residential and commercial real estate sales resulting in a commission paid to the Company and specifically earmarked for the Charity. This promotion is limited to individuals who specifically select the Charity as a beneficiary before conducting the transaction and during the Promotion Period. Other sales, not related to the Charity, will not be included in the Promotion or subject to any donation.", helvetica, BODY_FONT_SIZE);
  drawParagraph(ctx, "Promotion Location: Nationwide, United States of America and Worldwide", helvetica, BODY_FONT_SIZE);
  drawParagraph(ctx, "Promotion Amount: 10-40% percent of the gross commissions from sales of the Promotion Services purchased during the Promotion Period. See Exhibit E for details.", helvetica, BODY_FONT_SIZE);

  addPageNumber(ctx);
  addNewPage(ctx);

  drawHeading(ctx, "EXHIBIT B - CHARITY TRADEMARKS");
  drawParagraph(ctx, `[Charity logos and trademarks to be provided by ${data.churchName}]`, helvetica, BODY_FONT_SIZE);

  addPageNumber(ctx);
  addNewPage(ctx);

  drawHeading(ctx, "EXHIBIT C - STATE COMPLIANCE – CO-VENTURER OBLIGATIONS");

  const coVenturerStates = [
    {
      name: "Alabama",
      items: [
        "The Company shall register, or, if applicable, renew its registration, with the Alabama Attorney General as a commercial co-venturer. Applications for registration and renewal shall be in writing, under oath, in the form prescribed by the Alabama Attorney General, and shall be accompanied by an annual fee in the amount of one hundred dollars ($100).",
        "The Company shall file with, and have approved by the Alabama Attorney General, a bond in which the applicant shall be the principal obligor in the sum of ten thousand dollars ($10,000) with one or more sureties whose liability in the aggregate as sureties will at least equal that sum.",
        "The Company must file a copy of the Agreement with the Alabama Attorney General within 10 days after the Agreement is executed.",
        "As required by Alabama Code § 13A-9-71(i), the Company must, within 90 days of the termination of the Agreement, file a closing statement with the Alabama Attorney General disclosing gross receipts and all expenditures incurred in the performance of the contract.",
      ],
    },
    {
      name: "Arkansas",
      items: [
        "The Company shall keep the final accounting for the Promotion for three (3) years after the final accounting date, and the accounting shall be available to the Arkansas Attorney General upon reasonable request.",
        "The Company shall disclose in each advertisement for the Promotion the amount per unit of goods or services purchased or used that is to benefit the charitable organization or purpose. Such amount may be expressed as a dollar amount or as a percentage of the value of the goods or services purchased or used.",
      ],
    },
    {
      name: "California",
      items: [
        "Unless exempt under Government Code section 12599.2)(c), the Company shall file an annual registration with the California Office of the Attorney General, and shall be accompanied by an annual fee in the amount of three hundred fifty dollars ($350).",
        "As required by California Government Code § 12599.2(c), the Company shall file an annual financial report with the California Attorney General's Registry of Charitable Trusts on behalf of Charity for all donations solicited during the preceding calendar year, no later than 30 days after the close of the preceding calendar year.",
      ],
      note: "Note: Registration and annual reports in California are not required if the co venturer (1) has a written contract with Charity signed by two officers of Charity, (2) makes transfers to Charity every 90 days following the initial representation that a purchase will benefit Charity of all funds received as a result of the representations, and (3) provides a written accounting to Charity with each transfer of all funds received sufficient to enable Charity to determine that public representations were accurate and to prepare required periodic reports.",
    },
    {
      name: "Connecticut",
      items: [
        "The Company shall keep the final accounting for the Promotion for three (3) years after the final accounting date, and the accounting shall be available to the Connecticut Department of Consumer Protection upon request.",
      ],
    },
    {
      name: "Hawaii",
      items: [
        "As required by Hawaii Rev. Stat. § 467B-5.5, the Company shall file a copy of a Written Consent Form describing the nature of the Co-Venture relationship with the Hawaii Department of the Attorney General/Tax Division.",
      ],
    },
    {
      name: "Illinois",
      intro: "The Company must comply with one of the following:",
      items: [
        "Register as a trustee for holding the charitable donations on Form CO-1, prescribed by the Illinois Attorney General;",
        "Ensure prompt delivery of donations to Charity such that the Company does not hold more than $4,000 in charitable funds held in trust for the Charity at any given time; or",
        "File a copy of a written instrument providing for the title, powers, and duties as a trustee of property solicited for a charitable purpose in Illinois pursuant to 760 Ill. Comp. Stat. § 55/2, 55/3, and 55/6.",
      ],
    },
    {
      name: "Massachusetts",
      items: [
        "As required by M.G.L.c. 68. S. 22, the Company must file a copy of the Agreement with the Director of the Massachusetts Charities Division within 10 days after the Agreement is executed.",
      ],
    },
    {
      name: "Mississippi",
      items: [
        "The Company shall file with the Mississippi Secretary of State notice of the Promotion no less than seven (7) days prior to the start of the Promotion. Such notice must include a copy of the Agreement.",
        "The Company shall file a financial accounting of the charitable sales promotion no later than thirty (30) days after the conclusion of the Promotion if the Promotion is less than one (1) year. If the promotion period is greater than one (1) year, the Company shall file an annual financial accounting each year of the Promotion no later than thirty (30) days after the anniversary date of the first notice of the Promotion filing, and shall file a final financial accounting of the Promotion no later than thirty (30) days after the conclusion of said Promotion.",
      ],
      subItems: [
        "The number of units of goods or services sold in Mississippi;",
        "The amount of gross sales in Mississippi;",
        "The amount of those gross sales paid by the Company to Charity; and",
        "In the case of a multi-state, national or international campaign, the percentage of total sales in Mississippi paid to Charity",
      ],
    },
    {
      name: "New Hampshire",
      items: [
        "The Company shall sign and assist with filing a Notice of Charitable Sales Promotion on behalf of Charity with the New Hampshire Attorney General prior to the commencement of the Promotion.",
      ],
    },
    {
      name: "New Jersey",
      items: [
        "The Company shall provide to Charity a certification from an officer or principal of the Company attesting to the gross amount of income received by the Company attributable to the Promotion;",
      ],
    },
    {
      name: "New York",
      items: [
        "New York law requires that written agreements for co-venture sales promotions conducted in the State of New York must include the following provision: that the charitable organization may cancel this contract without cost, penalty, or liability for a period of fifteen (15) days following the date on which the contract is filed with the New York Attorney General, if required.",
      ],
    },
    {
      name: "North Carolina",
      items: [
        "The Company shall keep the final accounting for the Promotion for three (3) years after the final accounting date, and the accounting shall be available to the North Carolina Department of the Secretary of State within ten (10) days of receipt of request.",
      ],
    },
    {
      name: "Oregon",
      items: [
        "The Company shall keep the final accounting for the Promotion for three (3) years after the final accounting date, and the accounting shall be available to the Oregon Attorney General or any nonprofit beneficiary within twenty (20) days of receipt of request.",
      ],
    },
    {
      name: "South Carolina",
      items: [
        "Annual Registration: The Company must file a Registration Application for a Commercial Co-Venturer with the South Carolina Secretary of State's Office on an annual basis. A registration fee of $50 must be included with the form. The registration process must be completed prior to any solicitation activity.",
        "Notice of Solicitation Forms and Contracts: The Company must file a Notice of Solicitation-CCV and a copy of the Agreement. These should be filed at least ten days prior to any solicitation activity. There is no fee associated with this filing.",
        "Joint Financial Reports: The Company must submit a Joint Financial Report for Commercial Co-Venturer for a Promotion within 90 days after the Promotion has ended. In the result that Promotion runs for more than one year, the financial report is to be submitted within 90 days after the anniversary of the Promotion. There is no fee associated with this filing.",
      ],
    },
  ];

  for (const state of coVenturerStates) {
    drawStateName(ctx, state.name);
    if (state.intro) {
      drawParagraph(ctx, state.intro, helvetica, BODY_FONT_SIZE, { spacingAfter: 4 });
    }
    for (let i = 0; i < state.items.length; i++) {
      drawNumberedItem(ctx, `${i + 1}.`, state.items[i]);
    }
    if (state.subItems) {
      for (let i = 0; i < state.subItems.length; i++) {
        const letter = String.fromCharCode(97 + i);
        drawLetteredItem(ctx, `${letter}.`, state.subItems[i]);
      }
    }
    if (state.note) {
      drawParagraph(ctx, state.note, helvetica, BODY_FONT_SIZE - 1, { indent: 20 });
    }
    ctx.currentY -= 6;
  }

  addPageNumber(ctx);
  addNewPage(ctx);

  drawHeading(ctx, "EXHIBIT D - STATE COMPLIANCE – CHARITY OBLIGATIONS FOR CO-VENTURE");

  const charityStates = [
    {
      name: "Arkansas",
      items: [
        "As required by Arkansas Code Annotated § 4-28-408, Charity shall file a copy of the Agreement and a completed Notice of Sales Promotion with Commercial Coventurer (Form CR-04) with the Arkansas Attorney General prior to the commencement of the Promotion, via email to Charities@ArkansasAG.gov.",
      ],
    },
    {
      name: "California",
      items: [
        "Charity shall, as reasonably requested by the Company, verify and assist the Company in completing its annual financial report with the California Attorney General's Registry of Charitable Trusts for all donations solicited on behalf of Charity during the preceding calendar year.",
      ],
    },
    {
      name: "Connecticut",
      items: [
        "As required by Connecticut General Statute § 21a-190g, Charity shall file a copy of the Agreement with the Connecticut Department of Consumer Protection not less than ten days prior to the commencement of the Promotion within Connecticut, via email at ctCharityHelp@ct.gov.",
      ],
    },
    {
      name: "New Hampshire",
      items: [
        "Charity shall file a Notice of Charitable Sales Promotion, with the New Hampshire Attorney General prior to the commencement of the Promotion.",
      ],
    },
    {
      name: "New Jersey",
      items: [
        "Charity shall file the Agreement with the New Jersey Attorney General at least 10 business days prior to the initiation of the Promotion.",
        "At the conclusion of the Promotion, Charity shall file in writing on forms prescribed by the Attorney General:",
      ],
      subItems: [
        "A certification from an officer or principal of the Company attesting to the gross amount of income received by the Company attributable to the Promotion;",
        "The amount of money or other contribution remitted to Charity covering each Promotion;",
        "A copy of each advertisement, publication, solicitation or other material used as part of the Promotion to directly or indirectly induce a contribution.",
      ],
    },
  ];

  for (const state of charityStates) {
    drawStateName(ctx, state.name);
    for (let i = 0; i < state.items.length; i++) {
      drawNumberedItem(ctx, `${i + 1}.`, state.items[i]);
    }
    if (state.subItems) {
      for (let i = 0; i < state.subItems.length; i++) {
        const letter = String.fromCharCode(97 + i);
        drawLetteredItem(ctx, `${letter}.`, state.subItems[i]);
      }
    }
    ctx.currentY -= 6;
  }

  addPageNumber(ctx);
  addNewPage(ctx);

  drawHeading(ctx, "EXHIBIT E - PROMOTION SERVICE DONATION CHART");
  ctx.currentY -= 5;

  const colWidths = [60, 180, 80, 180];
  drawTableRow(ctx, ["Level", "Price Range", "% Donated", "Donation Range"], colWidths, helveticaBold, true);

  const tableData = [
    ["7", "$10,000,000 - $100,000,000", "40%", "$100,000 - $1,000,000"],
    ["6", "$5,000,000 - $10,000,000", "35%", "$50,000 - $100,000"],
    ["5", "$1,000,000 - $5,000,000", "30%", "$7,500 - $50,000"],
    ["4", "$750,000 - $999,999", "25%", "$4,500 - $6,000"],
    ["3", "$400,000 - $749,999", "20%", "$2,000 - $4,000"],
    ["2", "$250,000 - $399,999", "15%", "$1,000 - $1,500"],
    ["1", "$0 - $249,999", "10%", "$250 - $1,000"],
  ];

  for (const row of tableData) {
    drawTableRow(ctx, row, colWidths, helvetica);
  }

  ctx.currentY -= 10;
  drawParagraph(
    ctx,
    "The chart serves as a general guideline of the approximate donation that will be given. However, prices and commission rates and other forms of compensation are negotiable by law, so the actual donation per transaction may be more or less than the percentage or dollar amounts projected on the chart, based on the good faith determination to the extent to which the earnings of the Company on the transaction were impacted by such variables. The Company will provide the Charity complete transparency by issuing a final reconciliation with respect to each transaction for which the Company is entitled to receive compensation. This reconciliation will be provided to the Charity by the Company at the conclusion of the transaction showing the final sales price or value of the transaction and the actual compensation earned. The relevant donation will be sent to Charity by law within 90 days; however, the Company's goal is to send the donation within 14 business days from the conclusion of any transaction.",
    helvetica,
    BODY_FONT_SIZE - 1
  );

  ctx.currentY -= 15;
  drawHeading(ctx, "CA LEGAL DISCLAIMER");
  drawParagraph(
    ctx,
    "Business and Professions Code Section 10137 makes it unlawful for a real estate broker to employ or compensate, directly or indirectly, any unlicensed person for performing licensed acts. This program in no way compensates any person, directly or indirectly, for referrals. Any referral made to AARE must be voluntary without any form of compensation, tax benefit or any other type of benefit to the referring party.",
    helvetica,
    BODY_FONT_SIZE - 1
  );

  addPageNumber(ctx);

  const pdfBytes = await doc.save();
  return pdfBytes;
}
