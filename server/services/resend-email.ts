import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || !connectionSettings.settings.api_key) {
    throw new Error('Resend not connected');
  }
  return {
    apiKey: connectionSettings.settings.api_key,
    fromEmail: connectionSettings.settings.from_email
  };
}

export async function getResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail
  };
}

interface ContractCompletionEmailParams {
  churchName: string;
  signedPdfUrl: string;
  signer1Name: string;
  signer1Email?: string;
  signer2Name: string;
  signer2Email?: string;
}

export async function sendContractCompletionEmail(params: ContractCompletionEmailParams): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    
    const adminEmail = 'jhazeltine@gmail.com';
    
    const recipientSet = new Set<string>([adminEmail]);
    if (params.signer1Email) {
      recipientSet.add(params.signer1Email.toLowerCase());
    }
    if (params.signer2Email) {
      recipientSet.add(params.signer2Email.toLowerCase());
    }
    const recipients = Array.from(recipientSet);
    
    const signerEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a365d;">Your Partnership Contract is Complete</h2>
        
        <p>Thank you for signing the Generous Giving Partnership Contract for <strong>${params.churchName}</strong>.</p>
        
        <p>The contract has been fully executed with signatures from both authorized signers:</p>
        
        <div style="background-color: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Signer 1:</strong> ${params.signer1Name}</p>
          <p style="margin: 5px 0;"><strong>Signer 2:</strong> ${params.signer2Name}</p>
        </div>
        
        <div style="margin: 30px 0;">
          <a href="${params.signedPdfUrl}" 
             style="background-color: #3182ce; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Download Signed Contract
          </a>
        </div>
        
        <p style="color: #718096; font-size: 14px;">
          Please keep this email for your records. You can download the signed contract at any time using the link above.
        </p>
        
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
        
        <p style="color: #718096; font-size: 12px;">
          This contract was signed electronically through The Church Map platform.
          If you have any questions, please contact us at support@thechurchmap.com.
        </p>
      </div>
    `;

    const emailPromises = recipients.map(async (recipientEmail) => {
      const isAdmin = recipientEmail === adminEmail;
      const subject = isAdmin 
        ? `[Admin] Contract Signed: ${params.churchName} - Generous Giving Partnership`
        : `Your Signed Contract: ${params.churchName} - Generous Giving Partnership`;
      
      return client.emails.send({
        from: fromEmail || 'noreply@thechurchmap.com',
        to: recipientEmail,
        subject,
        html: signerEmailHtml,
      });
    });

    const results = await Promise.allSettled(emailPromises);
    
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failCount = results.filter(r => r.status === 'rejected').length;
    
    console.log(`Contract completion emails sent: ${successCount} successful, ${failCount} failed`);
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        console.error(`Email to ${recipients[i]} failed:`, result.reason);
      }
    });
    
    return successCount > 0;
  } catch (error) {
    console.error('Failed to send contract completion email:', error);
    return false;
  }
}
