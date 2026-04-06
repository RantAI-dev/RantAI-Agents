import nodemailer from "nodemailer"
import type { ChannelHandler, ConversationData, ChannelResult } from "./types"

/**
 * Email channel handler
 * Sends confirmation email to the customer with conversation details
 */
export const emailHandler: ChannelHandler = {
  name: "Email",

  validate(config: Record<string, string>): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    const required = ["smtpHost", "smtpPort", "smtpUser", "smtpPass", "fromEmail"]

    for (const field of required) {
      if (!config[field]) {
        errors.push(`Missing ${field}`)
      }
    }

    return { valid: errors.length === 0, errors }
  },

  async dispatch(
    conversation: ConversationData,
    config: Record<string, string>
  ): Promise<ChannelResult> {
    const { smtpHost, smtpPort, smtpUser, smtpPass, fromEmail, fromName } = config

    if (!conversation.customerEmail) {
      return {
        success: false,
        message: "Customer email is required for email channel",
      }
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort, 10),
      secure: parseInt(smtpPort, 10) === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    })

    // Generate reference number
    const referenceNumber = `HL-${Date.now().toString(36).toUpperCase()}`

    // Build conversation summary
    const conversationSummary = conversation.messages
      .slice(-5) // Last 5 messages
      .map((m) => `${m.role === "USER" ? "You" : "AI Assistant"}: ${m.content}`)
      .join("\n\n")

    // Email content
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #0f172a; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }
    .footer { background: #0f172a; color: #94a3b8; padding: 15px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
    .reference { background: #dbeafe; border: 1px solid #3b82f6; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .reference-number { font-size: 24px; font-weight: bold; color: #1e40af; }
    .summary { background: white; padding: 15px; border-radius: 8px; margin-top: 15px; white-space: pre-wrap; font-size: 14px; }
    .info-row { display: flex; margin: 8px 0; }
    .info-label { font-weight: 600; min-width: 120px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">HorizonLife Insurance</h1>
      <p style="margin: 5px 0 0 0; opacity: 0.8;">We've received your request</p>
    </div>

    <div class="content">
      <p>Dear ${conversation.customerName || "Valued Customer"},</p>

      <p>Thank you for contacting HorizonLife Insurance. We've received your request to speak with an agent and will get back to you within 24 hours.</p>

      <div class="reference">
        <p style="margin: 0 0 5px 0; font-size: 12px; color: #64748b;">Your Reference Number</p>
        <p class="reference-number" style="margin: 0;">${referenceNumber}</p>
        <p style="margin: 5px 0 0 0; font-size: 12px; color: #64748b;">Please keep this for your records</p>
      </div>

      <h3 style="margin-bottom: 10px;">Request Details</h3>
      <div class="info-row">
        <span class="info-label">Name:</span>
        <span>${conversation.customerName || "Not provided"}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Email:</span>
        <span>${conversation.customerEmail}</span>
      </div>
      ${conversation.customerPhone ? `
      <div class="info-row">
        <span class="info-label">Phone:</span>
        <span>${conversation.customerPhone}</span>
      </div>
      ` : ""}
      <div class="info-row">
        <span class="info-label">Interest:</span>
        <span>${conversation.productInterest?.replace("-", " ") || "General inquiry"}</span>
      </div>

      ${conversationSummary ? `
      <h3 style="margin: 20px 0 10px 0;">Conversation Summary</h3>
      <div class="summary">${conversationSummary}</div>
      ` : ""}

      <p style="margin-top: 20px;">An agent will review your inquiry and respond to this email. If you have any urgent questions, please call us at <strong>1-800-HORIZON</strong>.</p>

      <p>Best regards,<br><strong>HorizonLife Customer Support Team</strong></p>
    </div>

    <div class="footer">
      <p style="margin: 0;">HorizonLife Insurance | Protecting What Matters Most</p>
      <p style="margin: 5px 0 0 0;">This is an automated email. Please do not reply directly to this message.</p>
    </div>
  </div>
</body>
</html>
`

    const textContent = `
HorizonLife Insurance - Request Confirmation

Dear ${conversation.customerName || "Valued Customer"},

Thank you for contacting HorizonLife Insurance. We've received your request to speak with an agent.

Your Reference Number: ${referenceNumber}

Request Details:
- Name: ${conversation.customerName || "Not provided"}
- Email: ${conversation.customerEmail}
- Phone: ${conversation.customerPhone || "Not provided"}
- Interest: ${conversation.productInterest?.replace("-", " ") || "General inquiry"}

An agent will review your inquiry and respond within 24 hours. If you have any urgent questions, please call us at 1-800-HORIZON.

Best regards,
HorizonLife Customer Support Team
`

    try {
      await transporter.sendMail({
        from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
        to: conversation.customerEmail,
        subject: `Your HorizonLife Request - ${referenceNumber}`,
        text: textContent,
        html: htmlContent,
      })

      console.log(`[Email] Sent confirmation to ${conversation.customerEmail}, ref: ${referenceNumber}`)

      return {
        success: true,
        externalId: referenceNumber,
        message: `Email sent to ${conversation.customerEmail}`,
        customerMessage: `We've sent a confirmation email to ${conversation.customerEmail}. Your reference number is ${referenceNumber}. An agent will respond within 24 hours.`,
      }
    } catch (error) {
      console.error("[Email] Failed to send:", error)
      return {
        success: false,
        message: `Failed to send email: ${error instanceof Error ? error.message : "Unknown error"}`,
      }
    }
  },
}
