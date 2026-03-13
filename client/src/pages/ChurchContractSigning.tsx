import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  Loader2,
  Download,
  PenLine,
  CheckCircle,
  ChevronLeft,
  Copy,
  Link as LinkIcon,
  Calendar,
  MapPin,
  User,
  Mail,
  Briefcase,
} from "lucide-react";
import { IconBuildingChurch } from "@tabler/icons-react";
import { Link } from "wouter";
import type { Church as ChurchType } from "@shared/schema";

const PLACEHOLDER_PDF_URL = "https://tqxcauuaaipghxvwjyis.supabase.co/storage/v1/object/public/contract-templates/generous-giving-partnership-contract.pdf";

function ContractText({
  churchName,
  churchAddress,
  effectiveDate,
}: {
  churchName: string;
  churchAddress: string;
  effectiveDate: string;
}) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none" data-testid="contract-text-container">
      <div className="text-center mb-8">
        <h2 className="text-xl font-bold mb-2">CHARITABLE SALES PROMOTION & CO-VENTURE AND LICENSING AGREEMENT</h2>
      </div>

      <section className="mb-6">
        <p className="mb-4">
          This Charitable Sales Promotion & Co-Venture and Licensing Agreement (the "Agreement") is entered into on the Effective Date (as set forth on Exhibit A), by and between <span data-testid="contract-church-name"><strong>{churchName}</strong></span>, a nonprofit 501(c)(3) corporation, <span data-testid="contract-church-address">{churchAddress || "[Location]"}</span> ("Charity"), and Andrew Arroyo Real Estate Inc. dba AARE ("Company") as set forth on Exhibit A. This Agreement is designed to clarify the two parties' responsibilities for regulatory compliance with state charitable sales promotions and commercial co-venture laws and regulations. Any capitalized term used in this Agreement without definition shall have the meaning ascribed to it in Exhibit A attached hereto, as completed in conjunction with the execution of this Agreement.
        </p>
      </section>

      <section className="mb-6">
        <h3 className="text-lg font-semibold mb-3">I. PURPOSE</h3>
        <p className="mb-4">
          The purpose of this Agreement is to benefit Charity and advance its not-for-profit mission. The Company desires to support Charity to carry out its mission and agrees to provide the support described in this Agreement. The Company understands that as a not-for-profit charitable organization, Charity cannot promote or endorse the Company's products or services. Charity acknowledges that the Promotion as set forth herein does not constitute any such impermissible promotion or endorsement.
        </p>
      </section>

      <section className="mb-6">
        <h3 className="text-lg font-semibold mb-3">II. NATURE AND TERM OF PROMOTION</h3>
        <p className="mb-4">
          The Company shall conduct a charitable sales promotion (the "Promotion") in which it shall make a donation to Charity for each sale by the Company of certain products or services as described in Exhibit A (the "Promotion Service") as long as this Agreement remains effective (the "Promotion Period"). The Company shall provide to Charity a total donation equal to the amount as calculated based on the formula indicated on Exhibit A (the "Promotion Amount"). The geographic area of the Promotion shall be as indicated on Exhibit A (the "Geographic Location").
        </p>
      </section>

      <section className="mb-6">
        <h3 className="text-lg font-semibold mb-3">III. USE OF INTELLECTUAL PROPERTY</h3>
        <p className="mb-4">
          Charity hereby grants the Company a limited, non-exclusive worldwide license (without the right to sublicense) to use Charity's trademark, attached as Exhibit B (the "Mark"), for the duration of this Agreement, for the sole purpose of manufacturing, distributing, marketing, promoting and selling the Promotion Service embodying the Mark. The Company shall use the Mark only as permitted under this Agreement. Any designs incorporating the Mark must be approved by Charity prior to production.
        </p>
        <p className="mb-4">
          Nothing in this Agreement shall be deemed to constitute or result in an assignment of the Mark to the Company or to give the Company any right, title or interest in or to the Mark other than the right to use the Mark in accordance with this Agreement. The Company shall not register or apply to register the Mark, or any confusingly similar mark, or represent that it owns the Mark. The Company will not attack or challenge in any court of law, or in any other manner, the title of Charity to the Mark or Charity's ownership of any copyrights in or distinctive features of the Mark, or the validity or enforceability of the Mark.
        </p>
      </section>

      <section className="mb-6">
        <h3 className="text-lg font-semibold mb-3">IV. TERMINATION</h3>
        <p className="mb-4">
          Either Party may terminate this Agreement upon 14 days written notice to the other Party. Upon termination, the Company's right to use the Mark shall cease, and the Company shall immediately and permanently discontinue all use thereof and shall cease using the Charity name in any promotional activities. Within ninety (90) days following the termination of this Agreement, the Company shall provide Charity with final donations and accounting as described in Section V below. All obligations to comply with state laws and regulations under Section VIII of this Agreement shall survive the expiration or termination of this Agreement.
        </p>
      </section>

      <section className="mb-6">
        <h3 className="text-lg font-semibold mb-3">V. PAYMENT AND ACCOUNTING</h3>
        <p className="mb-4">
          When and if the Company earns revenue attributable to its provision of the Promotion Service, it shall make donations to Charity as follows: The first donation, in the amount stated in Exhibit E based on sales of the Promotion Service, shall be made no later than 90 days following the start of the Promotion Period or 15 days following the receipt by the Company of the Promotion Service fee, whichever comes later. The Company shall make further donations to Charity, in the amount stated in Exhibit E based on sales of the Promotion Service (if any), on every 90-day anniversary of the start of the Promotion Period based on Promotion Service fees earned during such 90-day period, through expiration or termination of this Agreement. The Company shall provide Charity with a final accounting within 90 days following the end of the Promotion Period of the total donation made to Charity based on sales of the Promotion Service and shall retain the final accounting and make it available to the Charity for a period of three (3) years following completion of the Promotion.
        </p>
        <p className="mb-4">
          The Charity donation is deemed to occur contemporaneously with the successful close of an escrow during the Promotion Period from the purchase or sale of a residential or commercial property that benefited from the Promotion Service. All Charity donations shall be held in trust by the Company for the benefit of Charity until the donation is paid or delivered to Charity.
        </p>
      </section>

      <section className="mb-6">
        <h3 className="text-lg font-semibold mb-3">VI. DISCLOSURE OF DONATION</h3>
        <p className="mb-4">
          Materials that inform the consumer of the donation being made to Charity must clearly state the amount or percentage of the Charity donation that shall result from the purchase of the Promotion Service, the time period during which purchase shall result in a donation to Charity.
        </p>
      </section>

      <section className="mb-6">
        <h3 className="text-lg font-semibold mb-3">VII. CO-VENTURE STATEMENT OF RELATIONSHIP</h3>
        <p className="mb-4">
          Whenever the Company offers a Promotion Service for purchase to the public or promotes or advertises a Promotion Service, the following statement of relationship or a similarly-worded statement of relationship must be included on the advertisement and offer for sale: "The Company is proud to support Charity. For every purchase of PROMOTION SERVICE during PROMOTION PERIOD, the Company will donate PROMOTION AMOUNT to the Charity."
        </p>
      </section>

      <section className="mb-6">
        <h3 className="text-lg font-semibold mb-3">VIII. COMPLIANCE WITH STATE LAWS</h3>
        <p className="mb-4">
          In conducting this promotion, both Charity and the Company agree to comply in a timely manner with the requirements of state laws and regulations applicable to each respective party with respect to the performance of its obligations hereunder. The parties further acknowledge and agree that the Promotion set out in this Agreement is subject to the requirements of the various state charitable solicitation laws. The Company and Charity acknowledge that some states impose registration requirements on co-venturers. The Company agrees that it has and will continue to comply with all registration requirements for co-venturers, including but not limited to the applicable requirements set forth in Exhibit C, in all states in which the Company intends to participate in the Promotion. Charity represents and warrants that it has complied with all federal and state laws allowing it to solicit funds. Charity agrees that it has and will continue to comply with all necessary registration requirements to validate the co-venturer relationship, including but not limited to the applicable requirements as may be set forth in Exhibit D.
        </p>
      </section>

      <section className="mb-6">
        <h3 className="text-lg font-semibold mb-3">IX. RESOLUTION OF CONFLICTS</h3>
        <p className="mb-4">
          The Parties agree in good faith to make every effort to resolve disputes that arise in the performance of this Agreement. Each Party shall make its best efforts to resolve any disputes informally or through a mutually agreed-upon mediator. However, in the event that mediation or informal resolution fails, the Parties will bring their claims arising under this Agreement in a court in the Southern District of California, and this Agreement shall then be governed by the laws of the state of California.
        </p>
      </section>

      <section className="mb-6">
        <h3 className="text-lg font-semibold mb-3">X. LIABILITY AND INDEMNIFICATION</h3>
        <p className="mb-4">
          The Company and Charity agree that each party is responsible for its own business activities and will not be held liable for the activities of the other party, except that the Company agrees to indemnify and hold harmless Charity, and its employees, representatives, and agents from any and all liability, loss, damage, cost or expense, including reasonable counsel fees and expenses, paid or incurred in connection with the Company's operation of the Promotion or sale of any products or services, or by reason of the Company's intentional or negligent conduct relating to performance of this Agreement. Charity assumes no liability to third parties with respect to the provision of any goods or services and/or any use of the Mark by the Company. The Company shall not be required to indemnify, defend or hold Charity harmless against claims asserting that the Mark infringes any trademark, copyright or other proprietary rights.
        </p>
      </section>

      <section className="mb-6">
        <h3 className="text-lg font-semibold mb-3">XI. NOTICE</h3>
        <p className="mb-4">
          All notices pertaining to this Agreement shall be in writing and shall be transmitted either by personal hand delivery, by overnight delivery, through the United States Postal Service by registered or certified mail, return receipt requested, or by electronic mail. Notices shall be sent to the following addresses for the respective parties unless written notice of a change of address is given:
        </p>
        <p className="mb-2"><strong>For Charity:</strong></p>
        <p className="mb-1">{churchName}</p>
        <p className="mb-4">{churchAddress || "[Address to be provided]"}</p>
        <p className="mb-2"><strong>For the Company, the address set forth on Exhibit A, with a copy, not constituting notice, to:</strong></p>
        <p className="mb-1">CKR Law</p>
        <p className="mb-1">Attn: Ross Meador</p>
        <p className="mb-4">5151 California Ave., Suite 100, Irvine, CA 92612</p>
      </section>

      <section className="mb-6">
        <h3 className="text-lg font-semibold mb-3">XII. MISCELLANEOUS PROVISIONS</h3>
        <p className="mb-3">
          <strong>A. Waiver:</strong> No failure of any Party to exercise or enforce any of its rights under this Agreement will act as a waiver of such rights.
        </p>
        <p className="mb-3">
          <strong>B. Severability:</strong> If any provision of this Agreement is found invalid or unenforceable, that provision will be enforced to the maximum extent permissible, and the other provisions of this Agreement will remain in force.
        </p>
        <p className="mb-3">
          <strong>C. Entire Agreement:</strong> This Agreement and its exhibits are the complete and exclusive agreement between the Parties with respect to the subject matter hereof, superseding and replacing any and all prior agreements, communications, and understandings, both written and oral, regarding such subject matter.
        </p>
        <p className="mb-3">
          <strong>D. Modification:</strong> This Agreement may only be modified, or any rights under it waived, by a written document executed by all Parties.
        </p>
        <p className="mb-4">
          <strong>E. Execution:</strong> This Agreement may be executed in any number of counterparts, all of which taken together will constitute a single instrument. Execution and delivery of this Agreement may be evidenced by facsimile transmission.
        </p>
      </section>

      <section className="mb-6">
        <p className="mb-4 font-medium">
          IN WITNESS WHEREOF, the Parties have caused this Agreement to be executed by their duly authorized representatives as of the date first written above.
        </p>
      </section>

      <section className="border-t pt-6">
        <h3 className="text-lg font-semibold mb-4">SIGNATURES</h3>
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="border rounded-md p-4 bg-muted/30">
            <p className="font-medium mb-2">CHARITY</p>
            <p className="text-sm text-muted-foreground mb-2">(Two signatures from charity required.)</p>
            <p className="text-sm">{churchName}</p>
            <div className="mt-4 pt-4 border-t border-dashed">
              <p className="text-xs text-muted-foreground">Authorized Signer 1</p>
              <div className="h-8 border-b border-muted-foreground/30 mt-2"></div>
              <p className="text-xs text-muted-foreground mt-2">Name / Title / Date</p>
            </div>
            <div className="mt-4 pt-4 border-t border-dashed">
              <p className="text-xs text-muted-foreground">Authorized Signer 2</p>
              <div className="h-8 border-b border-muted-foreground/30 mt-2"></div>
              <p className="text-xs text-muted-foreground mt-2">Name / Title / Date</p>
            </div>
          </div>
          <div className="border rounded-md p-4 bg-muted/30">
            <p className="font-medium mb-2">COMPANY</p>
            <p className="text-sm mb-2">Andrew Arroyo Real Estate Inc. dba AARE</p>
            <div className="mt-4 pt-4 border-t border-dashed">
              <p className="text-xs text-muted-foreground">Authorized Representative</p>
              <div className="h-8 border-b border-muted-foreground/30 mt-2"></div>
              <p className="text-xs text-muted-foreground mt-2">Name / Title / Date</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t pt-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">EXHIBIT A - INFORMATION SHEET AND DEFINITIONS</h3>
        <p className="mb-4 font-medium">TO THE CHARITABLE SALES PROMOTION & CO-VENTURE AND LICENSING AGREEMENT</p>
        
        <div className="space-y-2 text-sm">
          <p><strong>Effective Date:</strong> {effectiveDate}</p>
          <p><strong>Company:</strong> Legal Name: Andrew Arroyo Real Estate Inc. dba AARE</p>
          <p><strong>Type of Entity:</strong> Corporation</p>
          <p><strong>Address:</strong> 12636 High Bluff Drive Suite 400, San Diego, CA 92130</p>
          <p><strong>Federal EIN:</strong> 80-0107820</p>
          <p><strong>Website:</strong> www.aare.org</p>
          <p><strong>Telephone:</strong> 888-32-AGENT</p>
          <p><strong>Email Address:</strong> ama@aare.org</p>
          <p><strong>Fax:</strong> 858-720-1166</p>
          <p className="mt-4"><strong>Promotion Period:</strong> On-going, without end until termination by one party of this agreement</p>
          <p className="mt-2"><strong>Promotion Service:</strong> Residential and commercial real estate sales resulting in a commission paid to the Company and specifically earmarked for the Charity. This promotion is limited to individuals who specifically select the Charity as a beneficiary before conducting the transaction and during the Promotion Period. Other sales, not related to the Charity, will not be included in the Promotion or subject to any donation.</p>
          <p className="mt-2"><strong>Promotion Location:</strong> Nationwide, United States of America and Worldwide</p>
          <p className="mt-2"><strong>Promotion Amount:</strong> 10-40% percent of the gross commissions from sales of the Promotion Services purchased during the Promotion Period. See Exhibit E for details.</p>
        </div>
      </section>

      <section className="border-t pt-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">EXHIBIT B - CHARITY TRADEMARKS</h3>
        <p className="text-sm text-muted-foreground mb-4">
          [Charity logos and trademarks to be provided by {churchName}]
        </p>
      </section>

      <section className="border-t pt-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">EXHIBIT C - STATE COMPLIANCE – CO-VENTURER OBLIGATIONS</h3>
        
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-semibold">Alabama</p>
            <ol className="list-decimal pl-6 space-y-1">
              <li>The Company shall register, or, if applicable, renew its registration, with the Alabama Attorney General as a commercial co-venturer. Applications for registration and renewal shall be in writing, under oath, in the form prescribed by the Alabama Attorney General, and shall be accompanied by an annual fee in the amount of one hundred dollars ($100).</li>
              <li>The Company shall file with, and have approved by the Alabama Attorney General, a bond in which the applicant shall be the principal obligor in the sum of ten thousand dollars ($10,000) with one or more sureties whose liability in the aggregate as sureties will at least equal that sum.</li>
              <li>The Company must file a copy of the Agreement with the Alabama Attorney General within 10 days after the Agreement is executed.</li>
              <li>As required by Alabama Code § 13A-9-71(i), the Company must, within 90 days of the termination of the Agreement, file a closing statement with the Alabama Attorney General disclosing gross receipts and all expenditures incurred in the performance of the contract.</li>
            </ol>
          </div>

          <div>
            <p className="font-semibold">Arkansas</p>
            <ol className="list-decimal pl-6 space-y-1">
              <li>The Company shall keep the final accounting for the Promotion for three (3) years after the final accounting date, and the accounting shall be available to the Arkansas Attorney General upon reasonable request.</li>
              <li>The Company shall disclose in each advertisement for the Promotion the amount per unit of goods or services purchased or used that is to benefit the charitable organization or purpose. Such amount may be expressed as a dollar amount or as a percentage of the value of the goods or services purchased or used.</li>
            </ol>
          </div>

          <div>
            <p className="font-semibold">California</p>
            <ol className="list-decimal pl-6 space-y-1">
              <li>Unless exempt under Government Code section 12599.2)(c), the Company shall file an annual registration with the California Office of the Attorney General, and shall be accompanied by an annual fee in the amount of three hundred fifty dollars ($350).</li>
              <li>As required by California Government Code § 12599.2(c), the Company shall file an annual financial report with the California Attorney General's Registry of Charitable Trusts on behalf of Charity for all donations solicited during the preceding calendar year, no later than 30 days after the close of the preceding calendar year.</li>
            </ol>
            <p className="text-xs text-muted-foreground mt-2">Note: Registration and annual reports in California are not required if the co venturer (1) has a written contract with Charity signed by two officers of Charity, (2) makes transfers to Charity every 90 days following the initial representation that a purchase will benefit Charity of all funds received as a result of the representations, and (3) provides a written accounting to Charity with each transfer of all funds received sufficient to enable Charity to determine that public representations were accurate and to prepare required periodic reports.</p>
          </div>

          <div>
            <p className="font-semibold">Connecticut</p>
            <ol className="list-decimal pl-6 space-y-1">
              <li>The Company shall keep the final accounting for the Promotion for three (3) years after the final accounting date, and the accounting shall be available to the Connecticut Department of Consumer Protection upon request.</li>
            </ol>
          </div>

          <div>
            <p className="font-semibold">Hawaii</p>
            <ol className="list-decimal pl-6 space-y-1">
              <li>As required by Hawaii Rev. Stat. § 467B-5.5, the Company shall file a copy of a Written Consent Form describing the nature of the Co-Venture relationship with the Hawaii Department of the Attorney General/Tax Division.</li>
            </ol>
          </div>

          <div>
            <p className="font-semibold">Illinois</p>
            <p className="mb-1">The Company must comply with one of the following:</p>
            <ol className="list-decimal pl-6 space-y-1">
              <li>Register as a trustee for holding the charitable donations on Form CO-1, prescribed by the Illinois Attorney General;</li>
              <li>Ensure prompt delivery of donations to Charity such that the Company does not hold more than $4,000 in charitable funds held in trust for the Charity at any given time; or</li>
              <li>File a copy of a written instrument providing for the title, powers, and duties as a trustee of property solicited for a charitable purpose in Illinois pursuant to 760 Ill. Comp. Stat. § 55/2, 55/3, and 55/6.</li>
            </ol>
          </div>

          <div>
            <p className="font-semibold">Massachusetts</p>
            <ol className="list-decimal pl-6 space-y-1">
              <li>As required by M.G.L.c. 68. S. 22, the Company must file a copy of the Agreement with the Director of the Massachusetts Charities Division within 10 days after the Agreement is executed.</li>
            </ol>
          </div>

          <div>
            <p className="font-semibold">Mississippi</p>
            <ol className="list-decimal pl-6 space-y-1">
              <li>The Company shall file with the Mississippi Secretary of State notice of the Promotion no less than seven (7) days prior to the start of the Promotion. Such notice must include a copy of the Agreement.</li>
              <li>The Company shall file a financial accounting of the charitable sales promotion no later than thirty (30) days after the conclusion of the Promotion if the Promotion is less than one (1) year. If the promotion period is greater than one (1) year, the Company shall file an annual financial accounting each year of the Promotion no later than thirty (30) days after the anniversary date of the first notice of the Promotion filing, and shall file a final financial accounting of the Promotion no later than thirty (30) days after the conclusion of said Promotion. The accounting, annual accounting or final accounting shall include the following:
                <ol className="list-[lower-alpha] pl-6 mt-1 space-y-1">
                  <li>The number of units of goods or services sold in Mississippi;</li>
                  <li>The amount of gross sales in Mississippi;</li>
                  <li>The amount of those gross sales paid by the Company to Charity; and</li>
                  <li>In the case of a multi-state, national or international campaign, the percentage of total sales in Mississippi paid to Charity</li>
                </ol>
              </li>
            </ol>
          </div>

          <div>
            <p className="font-semibold">New Hampshire</p>
            <ol className="list-decimal pl-6 space-y-1">
              <li>The Company shall sign and assist with filing a Notice of Charitable Sales Promotion on behalf of Charity with the New Hampshire Attorney General prior to the commencement of the Promotion.</li>
            </ol>
          </div>

          <div>
            <p className="font-semibold">New Jersey</p>
            <ol className="list-decimal pl-6 space-y-1">
              <li>The Company shall provide to Charity a certification from an officer or principal of the Company attesting to the gross amount of income received by the Company attributable to the Promotion;</li>
            </ol>
          </div>

          <div>
            <p className="font-semibold">New York</p>
            <ol className="list-decimal pl-6 space-y-1">
              <li>New York law requires that written agreements for co-venture sales promotions conducted in the State of New York must include the following provision: that the charitable organization may cancel this contract without cost, penalty, or liability for a period of fifteen (15) days following the date on which the contract is filed with the New York Attorney General, if required.</li>
            </ol>
          </div>

          <div>
            <p className="font-semibold">North Carolina</p>
            <ol className="list-decimal pl-6 space-y-1">
              <li>The Company shall keep the final accounting for the Promotion for three (3) years after the final accounting date, and the accounting shall be available to the North Carolina Department of the Secretary of State within ten (10) days of receipt of request.</li>
            </ol>
          </div>

          <div>
            <p className="font-semibold">Oregon</p>
            <ol className="list-decimal pl-6 space-y-1">
              <li>The Company shall keep the final accounting for the Promotion for three (3) years after the final accounting date, and the accounting shall be available to the Oregon Attorney General or any nonprofit beneficiary within twenty (20) days of receipt of request.</li>
            </ol>
          </div>

          <div>
            <p className="font-semibold">South Carolina</p>
            <ol className="list-decimal pl-6 space-y-1">
              <li><strong>Annual Registration:</strong> The Company must file a Registration Application for a Commercial Co-Venturer with the South Carolina Secretary of State's Office on an annual basis. A registration fee of $50 must be included with the form. The registration process must be completed prior to any solicitation activity.</li>
              <li><strong>Notice of Solicitation Forms and Contracts:</strong> The Company must file a Notice of Solicitation-CCV and a copy of the Agreement. These should be filed at least ten days prior to any solicitation activity. There is no fee associated with this filing.</li>
              <li><strong>Joint Financial Reports:</strong> The Company must submit a Joint Financial Report for Commercial Co-Venturer for a Promotion within 90 days after the Promotion has ended. In the result that Promotion runs for more than one year, the financial report is to be submitted within 90 days after the anniversary of the Promotion. There is no fee associated with this filing.</li>
            </ol>
          </div>
        </div>
      </section>

      <section className="border-t pt-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">EXHIBIT D - STATE COMPLIANCE – CHARITY OBLIGATIONS FOR CO-VENTURE</h3>
        
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-semibold">Arkansas</p>
            <ol className="list-decimal pl-6 space-y-1">
              <li>As required by Arkansas Code Annotated § 4-28-408, Charity shall file a copy of the Agreement and a completed Notice of Sales Promotion with Commercial Coventurer (Form CR-04) with the Arkansas Attorney General prior to the commencement of the Promotion, via email to Charities@ArkansasAG.gov.</li>
            </ol>
          </div>

          <div>
            <p className="font-semibold">California</p>
            <ol className="list-decimal pl-6 space-y-1">
              <li>Charity shall, as reasonably requested by the Company, verify and assist the Company in completing its annual financial report with the California Attorney General's Registry of Charitable Trusts for all donations solicited on behalf of Charity during the preceding calendar year.</li>
            </ol>
          </div>

          <div>
            <p className="font-semibold">Connecticut</p>
            <ol className="list-decimal pl-6 space-y-1">
              <li>As required by Connecticut General Statute § 21a-190g, Charity shall file a copy of the Agreement with the Connecticut Department of Consumer Protection not less than ten days prior to the commencement of the Promotion within Connecticut, via email at ctCharityHelp@ct.gov.</li>
            </ol>
          </div>

          <div>
            <p className="font-semibold">New Hampshire</p>
            <ol className="list-decimal pl-6 space-y-1">
              <li>Charity shall file a Notice of Charitable Sales Promotion, with the New Hampshire Attorney General prior to the commencement of the Promotion.</li>
            </ol>
          </div>

          <div>
            <p className="font-semibold">New Jersey</p>
            <ol className="list-decimal pl-6 space-y-1">
              <li>Charity shall file the Agreement with the New Jersey Attorney General at least 10 business days prior to the initiation of the Promotion.</li>
              <li>At the conclusion of the Promotion, Charity shall file in writing on forms prescribed by the Attorney General:
                <ol className="list-[lower-alpha] pl-6 mt-1 space-y-1">
                  <li>A certification from an officer or principal of the Company attesting to the gross amount of income received by the Company attributable to the Promotion;</li>
                  <li>The amount of money or other contribution remitted to Charity covering each Promotion;</li>
                  <li>A copy of each advertisement, publication, solicitation or other material used as part of the Promotion to directly or indirectly induce a contribution.</li>
                </ol>
              </li>
            </ol>
          </div>
        </div>
      </section>

      <section className="border-t pt-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">EXHIBIT E - PROMOTION SERVICE DONATION CHART</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Level</th>
                <th className="text-left p-2">Price Range</th>
                <th className="text-left p-2">% Donated</th>
                <th className="text-left p-2">Donation Range</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b"><td className="p-2">7</td><td className="p-2">$10,000,000 - $100,000,000</td><td className="p-2">40%</td><td className="p-2">$100,000 - $1,000,000</td></tr>
              <tr className="border-b"><td className="p-2">6</td><td className="p-2">$5,000,000 - $10,000,000</td><td className="p-2">35%</td><td className="p-2">$50,000 - $100,000</td></tr>
              <tr className="border-b"><td className="p-2">5</td><td className="p-2">$1,000,000 - $5,000,000</td><td className="p-2">30%</td><td className="p-2">$7,500 - $50,000</td></tr>
              <tr className="border-b"><td className="p-2">4</td><td className="p-2">$750,000 - $999,999</td><td className="p-2">25%</td><td className="p-2">$4,500 - $6,000</td></tr>
              <tr className="border-b"><td className="p-2">3</td><td className="p-2">$400,000 - $749,999</td><td className="p-2">20%</td><td className="p-2">$2,000 - $4,000</td></tr>
              <tr className="border-b"><td className="p-2">2</td><td className="p-2">$250,000 - $399,999</td><td className="p-2">15%</td><td className="p-2">$1,000 - $1,500</td></tr>
              <tr className="border-b"><td className="p-2">1</td><td className="p-2">$0 - $249,999</td><td className="p-2">10%</td><td className="p-2">$250 - $1,000</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          The chart serves as a general guideline of the approximate donation that will be given. However, prices and commission rates and other forms of compensation are negotiable by law, so the actual donation per transaction may be more or less than the percentage or dollar amounts projected on the chart, based on the good faith determination to the extent to which the earnings of the Company on the transaction were impacted by such variables. The Company will provide the Charity complete transparency by issuing a final reconciliation with respect to each transaction for which the Company is entitled to receive compensation. This reconciliation will be provided to the Charity by the Company at the conclusion of the transaction showing the final sales price or value of the transaction and the actual compensation earned. The relevant donation will be sent to Charity by law within 90 days; however, the Company's goal is to send the donation within 14 business days from the conclusion of any transaction.
        </p>
      </section>

      <section className="border-t pt-6">
        <h3 className="text-lg font-semibold mb-4">CA LEGAL DISCLAIMER</h3>
        <p className="text-xs text-muted-foreground">
          Business and Professions Code Section 10137 makes it unlawful for a real estate broker to employ or compensate, directly or indirectly, any unlicensed person for performing licensed acts. This program in no way compensates any person, directly or indirectly, for referrals. Any referral made to AARE must be voluntary without any form of compensation, tax benefit or any other type of benefit to the referring party.
        </p>
      </section>
    </div>
  );
}

const signerFormSchema = z.object({
  signer_name: z.string().min(1, "Your full name is required"),
  signer_title: z.string().min(1, "Your title/role is required"),
  signer_email: z.string().email("Please enter a valid email"),
  signature_text: z.string().min(1, "Please type your signature"),
  legal_agreement: z.literal(true, {
    errorMap: () => ({ message: "You must agree to the legal terms" }),
  }),
});

type SignerFormValues = z.infer<typeof signerFormSchema>;

interface SignatureRecord {
  id: string;
  document_name: string | null;
  signer_name: string;
  signer_email: string | null;
  signature_text: string;
  signed_at: string;
  signed_pdf_url: string | null;
  church_id: string | null;
  signer_number: number | null;
  signer_title: string | null;
}

const STEPS = [
  { id: 1, label: "Review Contract" },
  { id: 2, label: "First Signer" },
  { id: 3, label: "Second Signer" },
  { id: 4, label: "Complete" },
];

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8" data-testid="step-indicator">
      {STEPS.map((step, index) => (
        <div key={step.id} className="flex items-center">
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
              currentStep >= step.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
            data-testid={`step-indicator-${step.id}`}
          >
            {currentStep > step.id ? <CheckCircle className="w-4 h-4" /> : step.id}
          </div>
          {index < STEPS.length - 1 && (
            <div
              className={`w-12 h-0.5 mx-2 ${
                currentStep > step.id ? "bg-primary" : "bg-muted"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function SignerForm({
  signerNumber,
  churchId,
  churchName,
  churchAddress,
  effectiveDate,
  previousSignatureId,
  onSuccess,
  initialName = "",
  initialTitle = "",
  initialEmail = "",
}: {
  signerNumber: 1 | 2;
  churchId: string;
  churchName: string;
  churchAddress: string;
  effectiveDate: string;
  previousSignatureId?: string;
  onSuccess: (signatureId: string, signedPdfUrl?: string) => void;
  initialName?: string;
  initialTitle?: string;
  initialEmail?: string;
}) {
  const { toast } = useToast();

  const form = useForm<SignerFormValues>({
    resolver: zodResolver(signerFormSchema),
    defaultValues: {
      signer_name: initialName,
      signer_title: initialTitle,
      signer_email: initialEmail,
      signature_text: "",
      legal_agreement: undefined,
    },
  });

  const signMutation = useMutation({
    mutationFn: async (values: SignerFormValues) => {
      return apiRequest("POST", "/api/signatures", {
        document_name: "Generous Giving Partnership Contract",
        signer_name: values.signer_name,
        signer_email: values.signer_email,
        signature_text: values.signature_text,
        signer_title: values.signer_title,
        church_id: churchId,
        contract_type: "generous_giving",
        signer_number: signerNumber,
        church_name: churchName,
        church_address: churchAddress,
        effective_date: effectiveDate,
        original_pdf_url: signerNumber === 1 ? PLACEHOLDER_PDF_URL : undefined,
        previous_signature_id: previousSignatureId,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/signatures"] });
      toast({
        title: "Document Signed",
        description: `Authorized Signer ${signerNumber} signature recorded successfully.`,
      });
      onSuccess(data.signature.id, data.signature.signed_pdf_url);
    },
    onError: (error: Error) => {
      toast({
        title: "Signing Failed",
        description: error.message || "Failed to sign the document. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCopyName = () => {
    form.setValue("signature_text", form.getValues("signer_name"));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <User className="h-5 w-5 text-muted-foreground" />
          <CardTitle data-testid={`text-signer-${signerNumber}-title`}>
            Authorized Signer {signerNumber}
          </CardTitle>
        </div>
        <CardDescription>
          {signerNumber === 1
            ? "As the first authorized signer, please complete the form below to sign the contract."
            : "As the second authorized signer, please review and sign to complete the contract execution."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => signMutation.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="signer_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Enter your full legal name"
                        className="pl-10"
                        {...field}
                        data-testid={`input-signer-${signerNumber}-name`}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="signer_title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title / Role at Church</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="e.g., Senior Pastor, Board Chair"
                        className="pl-10"
                        {...field}
                        data-testid={`input-signer-${signerNumber}-title`}
                      />
                    </div>
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
                  <FormLabel>Email Address</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="email"
                        placeholder="your@email.com"
                        className="pl-10"
                        {...field}
                        data-testid={`input-signer-${signerNumber}-email`}
                      />
                    </div>
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
                        data-testid={`input-signer-${signerNumber}-signature`}
                      />
                    </FormControl>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleCopyName}
                      title="Copy name as signature"
                      data-testid={`button-copy-name-${signerNumber}`}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <FormMessage />
                  {field.value && (
                    <div className="mt-2 p-3 border-b-2 border-dashed border-muted-foreground/30">
                      <p
                        className="font-serif italic text-xl text-center"
                        data-testid={`text-signature-preview-${signerNumber}`}
                      >
                        {field.value}
                      </p>
                    </div>
                  )}
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="legal_agreement"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid={`checkbox-legal-agreement-${signerNumber}`}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="cursor-pointer">
                      I confirm I am authorized to sign on behalf of this church and agree that my
                      typed signature is legally binding and equivalent to a handwritten signature.
                    </FormLabel>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />

            <div className="pt-4">
              <Button
                type="submit"
                className="w-full"
                disabled={signMutation.isPending}
                data-testid={`button-sign-document-${signerNumber}`}
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
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

export default function ChurchContractSigning() {
  // Match both national route and platform-scoped route
  const [, paramsNational] = useRoute("/church/:churchId/sign-contract");
  const [, paramsPlatform] = useRoute("/:platform/church/:churchId/sign-contract");
  const churchId = paramsNational?.churchId || paramsPlatform?.churchId;
  const [location, setLocation] = useLocation();

  const urlParams = new URLSearchParams(location.split("?")[1] || "");
  const initialStep = urlParams.get("step") ? parseInt(urlParams.get("step")!) : 1;
  const initialSigId = urlParams.get("sig") || null;
  
  // Pre-filled signer data from partnership application
  const prefillName = urlParams.get("name") || "";
  const prefillTitle = urlParams.get("title") || "";
  const prefillEmail = urlParams.get("email") || "";

  const [currentStep, setCurrentStep] = useState(
    initialStep === 3 && initialSigId ? 3 : 1
  );
  const [firstSignatureId, setFirstSignatureId] = useState<string | null>(initialSigId);
  const [finalSignedPdfUrl, setFinalSignedPdfUrl] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const { toast } = useToast();

  const { data: church, isLoading, error } = useQuery<ChurchType>({
    queryKey: ["/api/churches", churchId],
    queryFn: async () => {
      const response = await fetch(`/api/churches/${churchId}`);
      if (!response.ok) {
        throw new Error("Church not found");
      }
      return response.json();
    },
    enabled: !!churchId,
  });

  const effectiveDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const churchAddress = church
    ? [church.address, church.city, church.state, church.zip].filter(Boolean).join(", ")
    : "";

  const handleFirstSignerComplete = (signatureId: string) => {
    setFirstSignatureId(signatureId);
    setCurrentStep(2.5);
  };

  const handleSecondSignerComplete = (signatureId: string, signedPdfUrl?: string) => {
    if (signedPdfUrl) {
      setFinalSignedPdfUrl(signedPdfUrl);
    }
    setCurrentStep(4);
  };

  const getSecondSignerLink = () => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/church/${churchId}/sign-contract?step=3&sig=${firstSignatureId}`;
  };

  const copySecondSignerLink = () => {
    navigator.clipboard.writeText(getSecondSignerLink());
    setCopiedLink(true);
    toast({
      title: "Link Copied",
      description: "The signing link has been copied to your clipboard.",
    });
    setTimeout(() => setCopiedLink(false), 3000);
  };

  if (!churchId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Invalid church ID</p>
            <Button asChild className="mt-4">
              <Link href="/">Return Home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container max-w-3xl mx-auto py-8 px-4">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="h-64 w-full mb-4" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (error || !church) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-semibold mb-2">Church Not Found</h2>
            <p className="text-muted-foreground mb-4">
              The church you're looking for doesn't exist or has been removed.
            </p>
            <Button asChild>
              <Link href="/">Return Home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-3xl mx-auto py-8 px-4">
        <Link href={`/church/${churchId}`}>
          <Button variant="ghost" size="sm" className="mb-6" data-testid="button-back-to-church">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Church Profile
          </Button>
        </Link>

        <div className="flex items-center gap-4 mb-8">
          <Avatar className="h-16 w-16">
            <AvatarImage src={church.profile_photo_url || undefined} alt={church.name} />
            <AvatarFallback>
              <IconBuildingChurch className="h-8 w-8 text-muted-foreground" />
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-church-name">
              {church.name}
            </h1>
            <p className="text-muted-foreground">Generous Giving Partnership Contract</p>
          </div>
        </div>

        <StepIndicator currentStep={Math.ceil(currentStep)} />

        {currentStep === 1 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Review Contract</CardTitle>
                </div>
                <CardDescription>
                  Please review the Generous Giving Partnership Contract below before signing.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div 
                  className="border rounded-md bg-card p-6 max-h-[500px] overflow-y-auto"
                  data-testid="contract-scroll-container"
                >
                  <ContractText
                    churchName={church.name}
                    churchAddress={churchAddress}
                    effectiveDate={effectiveDate}
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={() => setCurrentStep(2)}
                  data-testid="button-proceed-to-signing"
                >
                  Proceed to Signing
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {currentStep === 2 && (
          <SignerForm
            signerNumber={1}
            churchId={churchId}
            churchName={church.name}
            churchAddress={churchAddress}
            effectiveDate={effectiveDate}
            onSuccess={handleFirstSignerComplete}
            initialName={prefillName}
            initialTitle={prefillTitle}
            initialEmail={prefillEmail}
          />
        )}

        {currentStep === 2.5 && firstSignatureId && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <CardTitle>First Signature Complete</CardTitle>
              </div>
              <CardDescription>
                The first authorized signer has signed the contract. Now share the link below with the
                second authorized signer to complete the contract.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-muted rounded-md">
                <p className="text-sm font-medium mb-2">Share this link with the second signer:</p>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={getSecondSignerLink()}
                    className="text-sm"
                    data-testid="input-second-signer-link"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={copySecondSignerLink}
                    data-testid="button-copy-link"
                  >
                    {copiedLink ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <Button variant="outline" onClick={copySecondSignerLink}>
                  <LinkIcon className="h-4 w-4 mr-2" />
                  Copy Link for Second Signer
                </Button>
                <p className="text-sm text-muted-foreground text-center">
                  Or, if you are also the second signer:
                </p>
                <Button onClick={() => setCurrentStep(3)} data-testid="button-continue-as-second-signer">
                  Continue as Second Signer
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 3 && firstSignatureId && (
          <SignerForm
            signerNumber={2}
            churchId={churchId}
            churchName={church.name}
            churchAddress={churchAddress}
            effectiveDate={effectiveDate}
            previousSignatureId={firstSignatureId}
            onSuccess={handleSecondSignerComplete}
          />
        )}

        {currentStep === 4 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-600" />
                <CardTitle data-testid="text-signing-complete">Contract Signed Successfully</CardTitle>
              </div>
              <CardDescription>
                Both authorized signers have signed the Generous Giving Partnership Contract.
                AARE has been notified and will be in touch with next steps.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 space-y-2">
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  What happens next?
                </p>
                <ul className="text-sm text-green-700 dark:text-green-300 space-y-1 list-disc list-inside">
                  <li>AARE will review your signed contract</li>
                  <li>You'll receive a confirmation email with the fully executed document</li>
                  <li>Your church partnership status will be updated</li>
                </ul>
              </div>

              {finalSignedPdfUrl && (
                <Button asChild className="w-full">
                  <a
                    href={finalSignedPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="link-download-signed-contract"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Signed Contract
                  </a>
                </Button>
              )}

              <Button variant="outline" asChild className="w-full">
                <Link href={`/church/${churchId}`} data-testid="link-return-to-church">
                  Return to Church Profile
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
