/**
 * Production Email Service
 * Transactional email delivery with templates and queue
 */

import nodemailer, { Transporter, SendMailOptions } from 'nodemailer'
import { db } from '@/lib/db'
import { config, isProduction } from '@/lib/config'

// Types
export interface EmailOptions {
  to: string | string[]
  subject: string
  template: string
  data: Record<string, unknown>
  attachments?: Array<{
    filename: string
    content: Buffer | string
    contentType?: string
  }>
  replyTo?: string
  headers?: Record<string, string>
}

export interface EmailTemplate {
  subject: string
  html: string
  text: string
}

// Email templates data
const EMAIL_TEMPLATES = {
  'booking-confirmed': {
    subject: 'Booking Confirmed - {{studioName}}',
    description: 'Sent when a booking is confirmed',
    requiredVars: ['customerName', 'bookingNumber', 'sessionDate', 'sessionTime', 'packageName', 'price'],
  },
  'booking-cancelled': {
    subject: 'Booking Cancelled - {{studioName}}',
    description: 'Sent when a booking is cancelled',
    requiredVars: ['customerName', 'bookingNumber', 'reason'],
  },
  'booking-reminder': {
    subject: 'Reminder: Your Photo Session Tomorrow - {{studioName}}',
    description: 'Sent 24 hours before session',
    requiredVars: ['customerName', 'bookingNumber', 'sessionDate', 'sessionTime'],
  },
  'payment-received': {
    subject: 'Payment Received - {{studioName}}',
    description: 'Sent when payment is confirmed',
    requiredVars: ['customerName', 'bookingNumber', 'amount', 'paymentMethod'],
  },
  'payment-pending': {
    subject: 'Payment Pending Verification - {{studioName}}',
    description: 'Sent when bank transfer is submitted',
    requiredVars: ['customerName', 'bookingNumber', 'amount'],
  },
  'photos-ready': {
    subject: 'Your Photos Are Ready! - {{studioName}}',
    description: 'Sent when photos are uploaded and ready for download',
    requiredVars: ['customerName', 'bookingNumber', 'photoCount', 'accessUrl', 'expiresAt'],
  },
  'welcome': {
    subject: 'Welcome to {{studioName}}!',
    description: 'Sent to new users',
    requiredVars: ['customerName', 'loginUrl'],
  },
  'password-reset': {
    subject: 'Reset Your Password - {{studioName}}',
    description: 'Sent for password reset requests',
    requiredVars: ['customerName', 'resetUrl', 'expiresIn'],
  },
  'email-verify': {
    subject: 'Verify Your Email - {{studioName}}',
    description: 'Sent after signup to verify email ownership',
    requiredVars: ['customerName', 'verifyUrl', 'expiresIn'],
  },
  'admin-new-booking': {
    subject: 'New Booking: {{bookingNumber}} - {{studioName}}',
    description: 'Sent to admin for new bookings',
    requiredVars: ['bookingNumber', 'customerName', 'packageName', 'sessionDate'],
  },
  'admin-payment-pending': {
    subject: 'Payment Verification Required - {{studioName}}',
    description: 'Sent to admin for bank transfer verification',
    requiredVars: ['bookingNumber', 'customerName', 'amount', 'bankName'],
  },
}

// Email template renderer
function renderTemplate(templateId: string, data: Record<string, unknown>): EmailTemplate {
  const vars = {
    studioName: config.STUDIO_NAME,
    studioEmail: config.STUDIO_EMAIL || 'noreply@photostudio.com',
    studioPhone: config.STUDIO_PHONE || '',
    studioAddress: config.STUDIO_ADDRESS || '',
    currentYear: new Date().getFullYear(),
    ...data,
  }

  const templateConfig = EMAIL_TEMPLATES[templateId as keyof typeof EMAIL_TEMPLATES]
  
  if (!templateConfig) {
    throw new Error(`Unknown email template: ${templateId}`)
  }

  // Validate required variables
  const missingVars = templateConfig.requiredVars.filter(v => !(v in vars) || vars[v] === undefined)
  if (missingVars.length > 0) {
    console.warn(`Missing required variables for template ${templateId}: ${missingVars.join(', ')}`)
  }

  // Render subject
  let subject = templateConfig.subject
  for (const [key, value] of Object.entries(vars)) {
    subject = subject.replace(new RegExp(`{{${key}}}`, 'g'), String(value))
  }

  // Render HTML body
  const html = renderHtmlTemplate(templateId, vars)

  // Render plain text
  const text = renderTextTemplate(templateId, vars)

  return { subject, html, text }
}

function renderHtmlTemplate(templateId: string, vars: Record<string, unknown>): string {
  const baseStyles = `
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px 20px; border-radius: 0 0 10px 10px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .info-box { background: white; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
    .label { font-weight: bold; color: #555; }
  `

  const headerHtml = `
    <div class="header">
      <h1 style="margin: 0; font-size: 28px;">📷 ${vars.studioName}</h1>
    </div>
  `

  const footerHtml = `
    <div class="footer">
      <p>© ${vars.currentYear} ${vars.studioName}. All rights reserved.</p>
      ${vars.studioAddress ? `<p>${vars.studioAddress}</p>` : ''}
      ${vars.studioPhone ? `<p>📞 ${vars.studioPhone}</p>` : ''}
      <p>📧 ${vars.studioEmail}</p>
    </div>
  `

  let contentHtml = ''

  switch (templateId) {
    case 'booking-confirmed':
      contentHtml = `
        <h2>Hi ${vars.customerName},</h2>
        <p>Great news! Your photo session has been confirmed. Here are your booking details:</p>
        
        <div class="info-box">
          <p><span class="label">Booking Number:</span> ${vars.bookingNumber}</p>
          <p><span class="label">Package:</span> ${vars.packageName}</p>
          <p><span class="label">Date:</span> ${vars.sessionDate}</p>
          <p><span class="label">Time:</span> ${vars.sessionTime}</p>
          <p><span class="label">Total:</span> $${vars.price}</p>
        </div>
        
        <p>Please arrive 10 minutes before your scheduled time. If you need to reschedule, please contact us at least 24 hours in advance.</p>
        
        <p>We look forward to capturing your beautiful moments!</p>
      `
      break

    case 'booking-cancelled':
      contentHtml = `
        <h2>Hi ${vars.customerName},</h2>
        <p>We're writing to confirm that your booking has been cancelled.</p>
        
        <div class="info-box">
          <p><span class="label">Booking Number:</span> ${vars.bookingNumber}</p>
          ${vars.reason ? `<p><span class="label">Reason:</span> ${vars.reason}</p>` : ''}
        </div>
        
        ${vars.refundAmount ? `<p>A refund of $${vars.refundAmount} will be processed within 5-7 business days.</p>` : ''}
        
        <p>We hope to see you again soon. If you'd like to reschedule, please visit our website.</p>
      `
      break

    case 'booking-reminder':
      contentHtml = `
        <h2>Hi ${vars.customerName},</h2>
        <p>This is a friendly reminder that your photo session is scheduled for tomorrow!</p>
        
        <div class="info-box">
          <p><span class="label">Booking Number:</span> ${vars.bookingNumber}</p>
          <p><span class="label">Date:</span> ${vars.sessionDate}</p>
          <p><span class="label">Time:</span> ${vars.sessionTime}</p>
        </div>
        
        <p><strong>Tips for your session:</strong></p>
        <ul>
          <li>Get plenty of rest the night before</li>
          <li>Wear solid colors that complement your skin tone</li>
          <li>Bring any props or outfits you'd like to use</li>
          <li>Arrive 10 minutes early</li>
        </ul>
        
        <p>See you tomorrow! 📸</p>
      `
      break

    case 'payment-received':
      contentHtml = `
        <h2>Hi ${vars.customerName},</h2>
        <p>Thank you! We've received your payment.</p>
        
        <div class="info-box">
          <p><span class="label">Booking Number:</span> ${vars.bookingNumber}</p>
          <p><span class="label">Amount Paid:</span> $${vars.amount}</p>
          <p><span class="label">Payment Method:</span> ${vars.paymentMethod}</p>
          <p><span class="label">Transaction ID:</span> ${vars.transactionId}</p>
        </div>
        
        <p>Your booking is now fully confirmed. We look forward to seeing you!</p>
      `
      break

    case 'payment-pending':
      contentHtml = `
        <h2>Hi ${vars.customerName},</h2>
        <p>We've received your payment proof and it's currently being verified.</p>
        
        <div class="info-box">
          <p><span class="label">Booking Number:</span> ${vars.bookingNumber}</p>
          <p><span class="label">Amount:</span> $${vars.amount}</p>
          <p><span class="label">Status:</span> Pending Verification</p>
        </div>
        
        <p>Our team will review your payment and confirm your booking within 24 hours. You'll receive an email once it's verified.</p>
      `
      break

    case 'photos-ready':
      contentHtml = `
        <h2>Hi ${vars.customerName},</h2>
        <p>🎉 Great news! Your photos are ready!</p>
        
        <div class="info-box">
          <p><span class="label">Booking Number:</span> ${vars.bookingNumber}</p>
          <p><span class="label">Photos Ready:</span> ${vars.photoCount}</p>
        </div>
        
        <p>You can view and download your high-resolution photos using the link below:</p>
        
        <a href="${vars.accessUrl}" class="button">View My Photos</a>
        
        ${vars.expiresAt ? `<p><strong>Note:</strong> This link will expire on ${vars.expiresAt}. Please download your photos before then.</p>` : ''}
        
        <p>We hope you love your photos! Feel free to share them and tag us on social media.</p>
      `
      break

    case 'welcome':
      contentHtml = `
        <h2>Welcome to ${vars.studioName}!</h2>
        <p>Hi ${vars.customerName},</p>
        <p>Thank you for joining us! We're excited to help you capture your special moments.</p>
        
        <p>With your account, you can:</p>
        <ul>
          <li>Book photo sessions online</li>
          <li>Choose from our packages</li>
          <li>Receive and download your photos</li>
          <li>Track your booking history</li>
        </ul>
        
        <a href="${vars.loginUrl}" class="button">Get Started</a>
        
        <p>If you have any questions, don't hesitate to reach out!</p>
      `
      break

    case 'password-reset':
      contentHtml = `
        <h2>Reset Your Password</h2>
        <p>Hi ${vars.customerName},</p>
        <p>We received a request to reset your password. Click the button below to create a new password:</p>
        
        <a href="${vars.resetUrl}" class="button">Reset Password</a>
        
        <p>This link will expire in ${vars.expiresIn || '1 hour'}.</p>
        
        <p>If you didn't request this password reset, you can safely ignore this email.</p>
      `
      break

    case 'email-verify':
      contentHtml = `
        <h2>Verify Your Email</h2>
        <p>Hi ${vars.customerName},</p>
        <p>Thanks for creating your account. Please verify your email address to activate sign in and protect your account from fake signups.</p>

        <a href="${vars.verifyUrl}" class="button">Verify Email</a>

        <p>This verification link will expire in ${vars.expiresIn || '24 hours'}.</p>
        <p>If you did not create this account, you can ignore this email.</p>
      `
      break

    case 'admin-new-booking':
      contentHtml = `
        <h2>📷 New Booking Received</h2>
        
        <div class="info-box">
          <p><span class="label">Booking Number:</span> ${vars.bookingNumber}</p>
          <p><span class="label">Customer:</span> ${vars.customerName}</p>
          <p><span class="label">Package:</span> ${vars.packageName}</p>
          <p><span class="label">Session Date:</span> ${vars.sessionDate}</p>
          <p><span class="label">Session Time:</span> ${vars.sessionTime}</p>
          <p><span class="label">Total:</span> $${vars.price}</p>
        </div>
        
        <p>Please review and confirm the booking in your admin dashboard.</p>
      `
      break

    case 'admin-payment-pending':
      contentHtml = `
        <h2>💰 Payment Verification Required</h2>
        
        <div class="info-box">
          <p><span class="label">Booking Number:</span> ${vars.bookingNumber}</p>
          <p><span class="label">Customer:</span> ${vars.customerName}</p>
          <p><span class="label">Amount:</span> $${vars.amount}</p>
          <p><span class="label">Bank:</span> ${vars.bankName}</p>
          <p><span class="label">Reference:</span> ${vars.bankReference}</p>
        </div>
        
        <p>Please verify this payment in your admin dashboard.</p>
      `
      break

    default:
      contentHtml = `<p>Email content for ${templateId}</p>`
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${vars.studioName}</title>
      <style>${baseStyles}</style>
    </head>
    <body>
      <div class="container">
        ${headerHtml}
        <div class="content">
          ${contentHtml}
        </div>
        ${footerHtml}
      </div>
    </body>
    </html>
  `
}

function renderTextTemplate(templateId: string, vars: Record<string, unknown>): string {
  // Plain text version
  const divider = '='.repeat(50)
  let text = ''

  switch (templateId) {
    case 'booking-confirmed':
      text = `
${divider}
${vars.studioName} - Booking Confirmed
${divider}

Hi ${vars.customerName},

Great news! Your photo session has been confirmed.

Booking Details:
- Booking Number: ${vars.bookingNumber}
- Package: ${vars.packageName}
- Date: ${vars.sessionDate}
- Time: ${vars.sessionTime}
- Total: $${vars.price}

Please arrive 10 minutes before your scheduled time.

We look forward to capturing your beautiful moments!
${divider}
${vars.studioName}
${vars.studioEmail}
${vars.studioPhone}
`
      break

    case 'photos-ready':
      text = `
${divider}
${vars.studioName} - Your Photos Are Ready!
${divider}

Hi ${vars.customerName},

Great news! Your photos are ready!

Booking Number: ${vars.bookingNumber}
Photos Ready: ${vars.photoCount}

Access your photos here: ${vars.accessUrl}

${vars.expiresAt ? `This link expires on ${vars.expiresAt}.` : ''}

We hope you love your photos!
${divider}
${vars.studioName}
${vars.studioEmail}
${vars.studioPhone}
`
      break

    case 'email-verify':
  text = `
${divider}
${vars.studioName} - Verify Your Email
${divider}

Hi ${vars.customerName},

Thanks for creating your account. Please verify your email address using this link:
${vars.verifyUrl}

This link will expire in ${vars.expiresIn || '24 hours'}.

If you did not create this account, you can ignore this email.

${divider}
${vars.studioName}
${vars.studioEmail}
${vars.studioPhone}
`
  break

    default:
      text = `
${divider}
${vars.studioName}
${divider}

Hi ${vars.customerName},

Thank you for your recent activity with ${vars.studioName}.

${divider}
${vars.studioEmail}
${vars.studioPhone}
`
  }

  return text.trim()
}

// Email Service Class
class EmailService {
  private transporter: Transporter | null = null
  private initialized = false

  constructor() {
    this.initialize()
  }

  private initialize() {
    if (this.initialized) return

    if (config.SMTP_HOST && config.SMTP_USER) {
      this.transporter = nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT || 587,
        secure: config.SMTP_PORT === 465,
        auth: {
          user: config.SMTP_USER,
          pass: config.SMTP_PASS,
        },
        // Connection pooling for better performance
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        // Rate limiting
        rateLimit: 14, // messages per second
        // Timeouts
        connectionTimeout: 10000,
        socketTimeout: 10000,
        // TLS options
        tls: {
          rejectUnauthorized: isProduction,
        },
      })
    }

    this.initialized = true
  }

  /**
   * Check if email service is configured
   */
  isConfigured(): boolean {
    return this.transporter !== null
  }

  /**
   * Send an email using a template
   */
  async send(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { to, subject, template, data, attachments, replyTo, headers } = options

    // Log the email attempt
    const logEntry = await this.logEmailAttempt({
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      template,
      status: 'PENDING',
    })

    try {
      // Check configuration
      if (!this.isConfigured()) {
        // In development, just log the email
        if (!isProduction) {
          console.log('📧 [DEV] Email would be sent:', {
            to,
            subject,
            template,
          })
          await this.updateLogStatus(logEntry.id, 'SENT', null, 'Development mode - email logged only')
          return { success: true, messageId: `dev-${Date.now()}` }
        }

        throw new Error('Email service not configured')
      }

      // Render template
      const rendered = renderTemplate(template, data)

      // Prepare mail options
      const mailOptions: SendMailOptions = {
        from: {
          name: config.STUDIO_NAME,
          address: config.EMAIL_FROM || config.SMTP_USER || 'noreply@photostudio.com',
        },
        to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        attachments: attachments?.map(att => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
        })),
        replyTo,
        headers: {
          'X-Priority': '1',
          'X-Mailer': 'PhotoStudio Pro',
          ...headers,
        },
        // Email tracking
        tracking: {
          opens: true,
          clicks: true,
        },
      }

      // Send email
      const result = await this.transporter!.sendMail(mailOptions)

      // Update log
      await this.updateLogStatus(logEntry.id, 'SENT', result.messageId)

      return { success: true, messageId: result.messageId }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Email send error:', errorMessage)

      // Update log with error
      if (logEntry?.id) {
        await this.updateLogStatus(logEntry.id, 'FAILED', null, errorMessage)
      }

      return { success: false, error: errorMessage }
    }
  }

  /**
   * Send multiple emails (batch)
   */
  async sendBatch(emails: EmailOptions[]): Promise<Array<{ to: string; success: boolean; error?: string }>> {
    const results = []

    for (const email of emails) {
      const result = await this.send(email)
      results.push({
        to: Array.isArray(email.to) ? email.to.join(', ') : email.to,
        ...result,
      })

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    return results
  }

  /**
   * Verify email service connection
   */
  async verify(): Promise<boolean> {
    if (!this.transporter) return false

    try {
      await this.transporter.verify()
      return true
    } catch {
      return false
    }
  }

  /**
   * Log email attempt to database
   */
  private async logEmailAttempt(data: {
    to: string
    subject: string
    template: string
    status: string
  }): Promise<{ id: string }> {
    try {
      const log = await db.notificationLog.create({
        data: {
          recipientEmail: data.to,
          subject: data.subject,
          body: data.template,
          status: data.status,
        },
      })
      return { id: log.id }
    } catch {
      return { id: 'temp-' + Date.now() }
    }
  }

  /**
   * Update log status
   */
  private async updateLogStatus(
    id: string,
    status: string,
    messageId?: string | null,
    error?: string | null
  ): Promise<void> {
    if (id.startsWith('temp-')) return

    try {
      await db.notificationLog.update({
        where: { id },
        data: {
          status,
          error,
          sentAt: status === 'SENT' ? new Date() : undefined,
        },
      })
    } catch {
      // Ignore log update errors
    }
  }

  /**
   * Get email template list
   */
  getTemplates(): Array<{ id: string; subject: string; description: string; requiredVars: string[] }> {
    return Object.entries(EMAIL_TEMPLATES).map(([id, config]) => ({
      id,
      subject: config.subject,
      description: config.description,
      requiredVars: config.requiredVars,
    }))
  }

  /**
   * Preview an email template
   */
  preview(templateId: string, data: Record<string, unknown>): EmailTemplate {
    return renderTemplate(templateId, data)
  }

  /**
   * Queue email for later delivery (implement with job queue)
   */
  async queue(options: EmailOptions, scheduledFor?: Date): Promise<{ success: boolean; jobId?: string }> {
    // For now, just send immediately
    // In production, this would use a job queue like Bull/BullMQ
    const result = await this.send(options)
    return { success: result.success, jobId: result.messageId }
  }
}

// Export singleton instance
export const emailService = new EmailService()

// Export class for testing
export { EmailService }
