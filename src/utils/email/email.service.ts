// utils/email/email.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { $Enums, RequestStatus } from '@prisma/client';

/**
 * Which mailbox an email goes out from.
 * - `contact` → contactus@architecturesimple.com (contact form / general enquiries)
 * - `project` → studio@architecturesimple.com (meetings, project & proposal flows)
 */
export type Mailbox = 'contact' | 'project';

const DEFAULT_MAILBOX: Mailbox = 'project';

interface MailboxConfig {
  transporter: nodemailer.Transporter;
  from: string;
  fromName: string;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly mailboxes: Record<Mailbox, MailboxConfig>;

  /**
   * Microsoft Graph credentials. When all three are present, mail is sent
   * through the mailbox itself rather than an external relay — which is the
   * only way a copy lands in that mailbox's Sent Items.
   */
  private readonly graph: {
    tenantId?: string;
    clientId?: string;
    clientSecret?: string;
  };
  private graphToken: string | null = null;
  private graphTokenExpiresAt = 0;

  constructor(private config: ConfigService) {
    this.graph = {
      tenantId: this.config.get<string>('GRAPH_TENANT_ID'),
      clientId: this.config.get<string>('GRAPH_CLIENT_ID'),
      clientSecret: this.config.get<string>('GRAPH_CLIENT_SECRET'),
    };

    this.mailboxes = {
      contact: this.buildMailbox('contact', 'CONTACT'),
      project: this.buildMailbox('project', 'PROJECT'),
    };

    if (this.graphEnabled()) {
      this.logger.log(
        'Sending via Microsoft Graph — outgoing mail will be saved to each mailbox\'s Sent Items.',
      );
    } else {
      this.logger.warn(
        'GRAPH_* credentials not set — falling back to SMTP relay. Sent Items will stay empty.',
      );
    }
  }

  private graphEnabled(): boolean {
    return !!(
      this.graph.tenantId &&
      this.graph.clientId &&
      this.graph.clientSecret
    );
  }

  /**
   * Builds a transporter for one mailbox from `<PREFIX>_SMTP_USER`, `<PREFIX>_SMTP_PASS`,
   * `<PREFIX>_MAIL_FROM` and `<PREFIX>_MAIL_FROM_NAME`, falling back to the shared
   * SMTP_* / MAIL_FROM* variables so a single-mailbox setup keeps working.
   */
  private buildMailbox(mailbox: Mailbox, prefix: string): MailboxConfig {
    const isDev = this.config.get('NODE_ENV') === 'development';
    const port = Number(this.config.get('SMTP_PORT', 587));
    const user =
      this.config.get<string>(`${prefix}_SMTP_USER`) ??
      this.config.get<string>('SMTP_USER');
    const pass =
      this.config.get<string>(`${prefix}_SMTP_PASS`) ??
      this.config.get<string>('SMTP_PASS');
    const from =
      this.config.get<string>(`${prefix}_MAIL_FROM`) ??
      this.config.get<string>('MAIL_FROM') ??
      user ??
      '';
    const fromName =
      this.config.get<string>(`${prefix}_MAIL_FROM_NAME`) ??
      this.config.get<string>('MAIL_FROM_NAME') ??
      this.getAppName();

    if (!user || !pass) {
      this.logger.warn(
        `Missing ${prefix}_SMTP_USER / ${prefix}_SMTP_PASS — the "${mailbox}" mailbox will fail to send.`,
      );
    }

    const transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST'),
      port,
      secure: port === 465,
      // Office 365 on 587 requires STARTTLS to be negotiated.
      requireTLS: port !== 465,
      auth: { user, pass },
      tls: {
        minVersion: 'TLSv1.2',
        ...(isDev ? { rejectUnauthorized: false } : {}),
      },
      logger: isDev,
      debug: isDev,
    });

    // Only worth checking when SMTP is actually the transport — under Graph the
    // relay is dormant and a failed verify would just be noise at boot.
    if (!this.graphEnabled()) {
      transporter.verify((error) => {
        if (error) {
          this.logger.error(
            `SMTP verification failed for "${mailbox}" mailbox (${user})`,
            error,
          );
        } else {
          this.logger.log(`SMTP transporter ready for "${mailbox}" mailbox (${from})`);
        }
      });
    }

    return { transporter, from, fromName };
  }

  // ============================================
  // MICROSOFT GRAPH TRANSPORT
  // ============================================

  /**
   * App-only access token for Graph, cached until shortly before it expires.
   *
   * This is the client-credentials flow (modern auth), not SMTP AUTH — so it
   * works even with Security Defaults on and legacy auth disabled tenant-wide,
   * which is what blocked smtp.office365.com.
   */
  private async getGraphToken(): Promise<string> {
    // Renew a minute early so a token can't expire mid-request.
    if (this.graphToken && Date.now() < this.graphTokenExpiresAt - 60_000) {
      return this.graphToken;
    }

    const url = `https://login.microsoftonline.com/${this.graph.tenantId}/oauth2/v2.0/token`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.graph.clientId!,
        client_secret: this.graph.clientSecret!,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    });

    const payload = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!response.ok || !payload.access_token) {
      throw new Error(
        `Graph token request failed (${response.status}): ${payload.error_description ?? payload.error ?? 'unknown error'}`,
      );
    }

    this.graphToken = payload.access_token;
    this.graphTokenExpiresAt = Date.now() + (payload.expires_in ?? 3600) * 1000;
    return this.graphToken;
  }

  /** Graph wants every address as its own object; callers pass strings. */
  private toRecipients(
    value: string | string[] | undefined,
  ): { emailAddress: { address: string } }[] | undefined {
    if (!value) return undefined;

    const addresses = (Array.isArray(value) ? value : value.split(','))
      .map((a) => a.trim())
      .filter(Boolean);

    if (addresses.length === 0) return undefined;
    return addresses.map((address) => ({ emailAddress: { address } }));
  }

  /**
   * Sends as the mailbox itself. `saveToSentItems` is what puts the copy in
   * Sent Items — the whole reason this transport exists. It also means the mail
   * originates inside the tenant, so there is no SPF/spoofing problem sending
   * from one company address to another.
   */
  private async sendViaGraph(
    mailbox: MailboxConfig,
    options: {
      to: string | string[];
      subject: string;
      html: string;
      text?: string;
      replyTo?: string;
      cc?: string | string[];
      bcc?: string | string[];
    },
  ): Promise<void> {
    const token = await this.getGraphToken();

    const message: Record<string, unknown> = {
      subject: options.subject,
      body: { contentType: 'HTML', content: options.html },
      from: {
        emailAddress: { address: mailbox.from, name: mailbox.fromName },
      },
      toRecipients: this.toRecipients(options.to),
      ccRecipients: this.toRecipients(options.cc),
      bccRecipients: this.toRecipients(options.bcc),
      replyTo: this.toRecipients(options.replyTo),
    };

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox.from)}/sendMail`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, saveToSentItems: true }),
      },
    );

    // A successful sendMail is 202 Accepted with an empty body.
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Graph sendMail failed (${response.status}): ${detail}`);
    }
  }

  private getAppName(): string {
    return this.config.get('APP_NAME', 'Architecture Simple');
  }

  /** First configured frontend origin, without a trailing slash. */
  private getFrontendUrl(): string {
    const raw = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
    return raw.split(',')[0].trim().replace(/\/$/, '');
  }

  private getCurrentYear(): number {
    return new Date().getFullYear();
  }

  // ============================================
  // MEETING INVITATION EMAIL (was throwing error)
  // ============================================
  async sendMeetingInvitation(
    to: string,
    recipientName: string,
    details: {
      meetingTitle: string;
      /** MeetingLink id — the email links through a payment-gated redirect. */
      meetingId: string;
      meetingUrl: string;
      scheduledAt: Date;
      projectName: string;
      senderName: string;
      senderRole: $Enums.UserRole;
      notes: string | undefined;
    },
  ): Promise<void> {
    const appName = this.getAppName();

    // The email never links straight to the video room. It goes through the
    // app, which checks the client has paid the consultation fee before
    // forwarding them — otherwise it drops them on the payment section.
    const joinUrl = `${this.getFrontendUrl()}/meetings/${details.meetingId}/join`;

    const formattedDate = details.scheduledAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const formattedTime = details.scheduledAt.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    const roleLabel = details.senderRole.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).toLowerCase();

    const html = `
    <div style="font-family: 'Segoe UI', Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">

      <!-- HEADER -->
      <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); padding: 40px 36px 32px; text-align: center;">
        <div style="width: 64px; height: 64px; background: rgba(255,255,255,0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 18px;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
          </svg>
        </div>
        <h1 style="color: #fff; font-size: 22px; font-weight: 600; margin: 0 0 6px;">Meeting Invitation</h1>
        <p style="color: rgba(255,255,255,0.6); font-size: 13px; margin: 0;">You have a scheduled meeting</p>
      </div>

      <!-- BODY -->
      <div style="padding: 32px 36px;">

        <!-- Greeting -->
        <p style="font-size: 16px; color: #333; margin: 0 0 24px; line-height: 1.5;">
          Dear <strong style="color: #0f3460;">${recipientName}</strong>,<br/>
          You have been invited to a meeting regarding your project request. Please find the details below.
        </p>

        <!-- Meeting Details Card -->
        <div style="background: #f4f7fa; border-radius: 10px; border: 1px solid #e2e8f0; overflow: hidden; margin-bottom: 20px;">
          <div style="background: #e2e8f0; padding: 10px 18px;">
            <span style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b;">Meeting Details</span>
          </div>
          <div style="padding: 12px 18px; border-bottom: 1px solid #e9edf2; display: flex;">
            <span style="width: 120px; min-width: 120px; font-size: 13px; font-weight: 600; color: #64748b;">Title</span>
            <span style="font-size: 13px; color: #1e293b;">${details.meetingTitle}</span>
          </div>
          <div style="padding: 12px 18px; border-bottom: 1px solid #e9edf2; display: flex;">
            <span style="width: 120px; min-width: 120px; font-size: 13px; font-weight: 600; color: #64748b;">Date</span>
            <span style="font-size: 13px; color: #1e293b;">${formattedDate}</span>
          </div>
          <div style="padding: 12px 18px; display: flex;">
            <span style="width: 120px; min-width: 120px; font-size: 13px; font-weight: 600; color: #64748b;">Time</span>
            <span style="font-size: 13px; color: #1e293b;">${formattedTime}</span>
          </div>
        </div>

        <!-- Project Details Card -->
        <div style="background: #f4f7fa; border-radius: 10px; border: 1px solid #e2e8f0; overflow: hidden; margin-bottom: 20px;">
          <div style="background: #e2e8f0; padding: 10px 18px;">
            <span style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b;">Project Details</span>
          </div>
          <div style="padding: 12px 18px; border-bottom: 1px solid #e9edf2; display: flex;">
            <span style="width: 120px; min-width: 120px; font-size: 13px; font-weight: 600; color: #64748b;">Project</span>
            <span style="font-size: 13px; color: #1e293b;">${details.projectName}</span>
          </div>
          <div style="padding: 12px 18px; display: flex;">
            <span style="width: 120px; min-width: 120px; font-size: 13px; font-weight: 600; color: #64748b;">Invited by</span>
            <span style="font-size: 13px; color: #1e293b;">${details.senderName}</span>
          </div>
        </div>

        <!-- Notes (only if present) -->
        ${details.notes ? `
        <div style="background: #fffbeb; border-left: 3px solid #f59e0b; padding: 14px 18px; border-radius: 0 8px 8px 0; margin-bottom: 20px;">
          <div style="font-size: 12px; font-weight: 700; color: #b45309; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">📝 Notes from ${details.senderName}</div>
          <p style="font-size: 13px; color: #78350f; line-height: 1.5; margin: 0;">${details.notes}</p>
        </div>
        ` : ''}

        <!-- Join Button -->
        <div style="text-align: center; background: linear-gradient(135deg, #eef5ff, #e8f0fe); border-radius: 10px; padding: 28px 20px; margin-bottom: 24px;">
          <p style="font-size: 14px; color: #475569; margin: 0 0 16px;">Click the button below to join the meeting at the scheduled time.</p>
          <a href="${joinUrl}" style="display: inline-block; background: linear-gradient(135deg, #0f3460, #1a5276); color: #fff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 15px; font-weight: 600; letter-spacing: 0.3px;">
            Join Meeting
          </a>
          <div style="margin-top: 14px; font-size: 11px; color: #94a3b8; word-break: break-all;">
            Or copy this link:<br/>
            <strong>${joinUrl}</strong>
          </div>
        </div>
      </div>

      <!-- FOOTER -->
      <div style="border-top: 1px solid #e2e8f0; padding: 24px 36px; text-align: center;">
        <p style="font-size: 13px; color: #64748b; margin: 0 0 8px;">This invitation was sent by <strong style="color: #0f3460;">${details.senderName}</strong></p>
        <span style="display: inline-block; background: #e8f0fe; color: #1a5276; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px;">${roleLabel}</span>
        <p style="font-size: 11px; color: #94a3b8; line-height: 1.5; margin: 0;">
          If you did not expect this email, please ignore it.<br/>
          Do not reply to this email directly. Contact your project manager if you have questions.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
        <p style="font-size: 11px; color: #94a3b8; margin: 0;">© ${this.getCurrentYear()} ${appName}. All rights reserved.</p>
      </div>
    </div>
    `;

    const text = `
Meeting Invitation

Dear ${recipientName},

You have been invited to a meeting regarding your project request.

Meeting Details:
- Title: ${details.meetingTitle}
- Date: ${formattedDate}
- Time: ${formattedTime}

Project: ${details.projectName}
Invited by: ${details.senderName}

${details.notes ? `Notes from ${details.senderName}:\n${details.notes}\n` : ''}

Join the meeting using this link:
${joinUrl}

This invitation was sent by ${details.senderName}.
If you did not expect this email, please ignore it.

© ${this.getCurrentYear()} ${appName}
    `.trim();

    await this.sendMail({
      to,
      subject: `Meeting Invitation: ${details.meetingTitle} – ${details.projectName}`,
      html,
      text,
    });
  }

  // ============================================
  // EXISTING METHODS (unchanged)
  // ============================================

  async sendRequestStatusChange(
    to: string,
    clientName: string,
    data: {
      requestId: string;
      projectName: string;
      status: RequestStatus;
      notes?: string;
    },
  ): Promise<void> {
    const appName = this.getAppName();
    const statusDisplay =
      data.status.charAt(0).toUpperCase() + data.status.slice(1).toLowerCase();

    const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1a365d;">Project Request Status Update</h2>
      <p>Hello ${clientName},</p>
      <p>Your project request "<strong>${data.projectName}</strong>" has been updated:</p>
      <div style="background: #f7fafc; padding: 16px; border-radius: 6px; margin: 20px 0;">
        <strong>Status:</strong> ${statusDisplay}<br>
        ${data.notes ? `<strong>Notes:</strong> ${data.notes}<br>` : ''}
        <strong>Request ID:</strong> ${data.requestId}
      </div>
      <p>You can view the details in your dashboard at any time.</p>
      <p style="font-size: 14px; color: #4a5568; margin-top: 32px;">
        If you have any questions, feel free to reply to this email.
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 40px 0;" />
      <p style="font-size: 12px; color: #718096; text-align: center;">
        © ${this.getCurrentYear()} ${appName}. All rights reserved.
      </p>
    </div>
    `;

    const text = `
Project Request Status Update
Hello ${clientName},
Your project request "${data.projectName}" has been updated to: ${statusDisplay}
${data.notes ? `Notes: ${data.notes}\n` : ''}
Request ID: ${data.requestId}
View details in your dashboard.
Thanks,
${appName}
    `.trim();

    await this.sendMail({
      to,
      subject: `Project Request Update – ${data.projectName} (${statusDisplay})`,
      html,
      text,
    });
  }

  async sendStageCompletionEmail(
    to: string,
    clientName: string,
    data: {
      stageName: string;
      projectName: string;
      proposalNumber: string;
      completedCount: number;
      totalCount: number;
      dashboardUrl: string;
    },
  ): Promise<void> {
    const appName = this.getAppName();
    const progressText = `${data.completedCount} of ${data.totalCount} stages completed`;

    const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1a365d;">Project Stage Completed</h2>
      <p>Hello ${clientName},</p>
      <p>Great news! A stage in your project has been marked as completed:</p>
      <div style="background: #f0fff4; padding: 20px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #38a169;">
        <h3 style="margin: 0 0 12px 0; color: #2f855a;">${data.stageName}</h3>
        <p style="margin: 8px 0;"><strong>Project:</strong> ${data.projectName}</p>
        <p style="margin: 8px 0;"><strong>Proposal #:</strong> ${data.proposalNumber}</p>
        <p style="margin: 8px 0; font-weight: bold; color: #2f855a;">
          Progress: ${progressText} (${Math.round((data.completedCount / data.totalCount) * 100)}%)
        </p>
      </div>
      <p style="margin: 24px 0;">You can view the updated project status and details here:</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${data.dashboardUrl}"
           style="background: #3182ce; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">
          View Project Dashboard
        </a>
      </div>
      <p style="font-size: 14px; color: #4a5568;">
        We're making steady progress — thank you for your trust!<br>
        If you have any questions, feel free to reply to this email.
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 40px 0;" />
      <p style="font-size: 12px; color: #718096; text-align: center;">
        © ${this.getCurrentYear()} ${appName}. All rights reserved.
      </p>
    </div>
    `;

    const text = `
Project Stage Completed
Hello ${clientName},
The stage "${data.stageName}" in project "${data.projectName}" (Proposal #${data.proposalNumber}) has been completed.
Progress: ${data.completedCount} of ${data.totalCount} stages (${Math.round((data.completedCount / data.totalCount) * 100)}%)
View details here: ${data.dashboardUrl}
We're moving forward — thank you!
Best regards,
${appName}
    `.trim();

    await this.sendMail({
      to,
      subject: `Stage Completed: ${data.stageName} – ${data.projectName}`,
      html,
      text,
    });
  }

  async sendEmailVerification(
    to: string,
    token: string,
    name: string,
    frontendUrl: string,
  ): Promise<void> {
    const verificationLink = `${frontendUrl}/verify-email?token=${token}&email=${encodeURIComponent(to)}`;

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a365d;">Welcome to ${this.getAppName()}, ${name || 'there'}!</h2>
        <p>Thank you for signing up. Please verify your email to activate your account.</p>
        <div style="text-align: center; margin: 40px 0;">
          <a href="${verificationLink}"
             style="background: #3182ce; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
            Verify Email Address
          </a>
        </div>
        <p style="font-size: 14px;">
          Or copy and paste this link in your browser:<br>
          <a href="${verificationLink}" style="color: #3182ce; word-break: break-all;">${verificationLink}</a>
        </p>
        <p style="font-size: 14px; color: #4a5568; margin-top: 32px;">
          This link will expire in 24 hours.<br>
          If you didn't create an account, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 40px 0;" />
        <p style="font-size: 12px; color: #718096; text-align: center;">
          © ${this.getCurrentYear()} ${this.getAppName()}. All rights reserved.<br>
          Built with care in Chattogram.
        </p>
      </div>
    `;

    const text = `
Welcome to ${this.getAppName()}, ${name || 'there'}!
Please verify your email address by clicking the link below:
${verificationLink}
This link expires in 24 hours.
If you didn't sign up, ignore this message.
© ${this.getCurrentYear()} ${this.getAppName()}
    `.trim();

    await this.sendMail({
      to,
      subject: `Verify Your Email - ${this.getAppName()}`,
      html,
      text,
    });
  }

  async sendPasswordReset(
    to: string,
    token: string,
    name: string,
    resetUrl: string,
  ): Promise<void> {
    const resetLink = `${resetUrl}?token=${token}&email=${encodeURIComponent(to)}`;

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a365d;">Password Reset Request</h2>
        <p>Hello ${name || 'there'},</p>
        <p>We received a request to reset your password. Click the button below to set a new password:</p>
        <div style="text-align: center; margin: 40px 0;">
          <a href="${resetLink}"
             style="background: #e53e3e; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
            Reset Password
          </a>
        </div>
        <p style="font-size: 14px;">
          Or use this link:<br>
          <a href="${resetLink}" style="color: #e53e3e; word-break: break-all;">${resetLink}</a>
        </p>
        <p style="font-size: 14px; color: #4a5568; margin-top: 32px;">
          This link will expire in 1 hour.<br>
          If you didn't request a password reset, please ignore this email — your account is safe.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 40px 0;" />
        <p style="font-size: 12px; color: #718096; text-align: center;">
          © ${this.getCurrentYear()} ${this.getAppName()}. All rights reserved.
        </p>
      </div>
    `;

    const text = `
Password Reset Request
Hello ${name || 'there'},
Use this link to reset your password:
${resetLink}
Link expires in 1 hour.
If this wasn't you, ignore this email.
© ${this.getCurrentYear()} ${this.getAppName()}
    `.trim();

    await this.sendMail({
      to,
      subject: `Reset Your Password - ${this.getAppName()}`,
      html,
      text,
    });
  }

  async sendNewInquiryWelcomeEmail(
    to: string,
    clientName: string,
    data: {
      projectName: string;
      password?: string;
    },
  ): Promise<void> {
    const appName = this.getAppName();
    const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:5173');
    const loginLink = `${frontendUrl}/login`;
    const credentialsHtml = data.password
      ? `
          <div>
            <span style="font-size: 13px; color: #64748b; display: block; margin-bottom: 4px;">Temporary Password</span>
            <strong style="font-size: 15px; color: #0f3460;">${data.password}</strong>
          </div>
          <p style="font-size: 12px; color: #94a3b8; margin: 16px 0 0;">Note: You can change your password once you log in.</p>
        `
      : `
          <p style="font-size: 13px; color: #64748b; margin: 0;">
            You already have an account with this email — log in with your existing password.
          </p>
        `;
    const credentialsText = data.password
      ? `Password: ${data.password}`
      : `You already have an account with this email — log in with your existing password.`;

    const html = `
    <div style="font-family: 'Segoe UI', Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
      <!-- HEADER -->
      <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); padding: 40px 36px 32px; text-align: center;">
        <h1 style="color: #fff; font-size: 24px; font-weight: 600; margin: 0;">Welcome to ${appName}</h1>
        <p style="color: rgba(255,255,255,0.7); font-size: 14px; margin: 8px 0 0;">Your project inquiry has been received</p>
      </div>

      <!-- BODY -->
      <div style="padding: 32px 36px;">
        <p style="font-size: 16px; color: #333; margin: 0 0 20px; line-height: 1.5;">
          Hello <strong>${clientName}</strong>,
        </p>
        <p style="font-size: 14px; color: #475569; margin: 0 0 24px; line-height: 1.6;">
          Your project inquiry for "<strong>${data.projectName}</strong>" has been successfully created. 
          A secure account has been set up for you to track progress, view proposals, and schedule meetings.
        </p>

        <!-- CREDENTIALS BOX -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
          <h3 style="font-size: 14px; font-weight: 600; color: #1e293b; margin: 0 0 16px; text-transform: uppercase; letter-spacing: 0.5px;">Login Credentials</h3>
          <div style="margin-bottom: 12px;">
            <span style="font-size: 13px; color: #64748b; display: block; margin-bottom: 4px;">Email Address</span>
            <strong style="font-size: 15px; color: #0f3460;">${to}</strong>
          </div>
          ${credentialsHtml}
        </div>

        <!-- CTA BUTTON -->
        <div style="text-align: center; margin: 32px 0;">
          <a href="${loginLink}" style="display: inline-block; background: #0f3460; color: #fff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
            Log In to Your Dashboard
          </a>
        </div>

        <p style="font-size: 14px; color: #475569; margin: 0; line-height: 1.6;">
          Once logged in, you can find your inquiry under the "New Inquiries" tab. 
          We look forward to working with you!
        </p>
      </div>

      <!-- FOOTER -->
      <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 36px; text-align: center;">
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">
          If you did not expect this invitation, please contact us immediately.<br/>
          © ${this.getCurrentYear()} ${appName}. All rights reserved.
        </p>
      </div>
    </div>
    `;

    const text = `
Welcome to ${appName}!

Hello ${clientName},

Your project inquiry for "${data.projectName}" has been successfully created.
A secure account has been set up for you.

Login Credentials:
Email: ${to}
${credentialsText}

Log in here: ${loginLink}

Once logged in, you can find your inquiry under the "New Inquiries" tab.

Best regards,
The ${appName} Team
    `.trim();

    await this.sendMail({
      to,
      subject: `Welcome to ${appName} - Project Inquiry Received`,
      html,
      text,
    });
  }

  /**
   * Sent when the studio ACCEPTS an account-less inquiry. Carries the one-time
   * token-based signup link; claiming it creates the client's account and
   * hands them ownership of the inquiry.
   */
  async sendInquiryAccepted(
    to: string,
    clientName: string,
    data: { projectName: string; claimToken: string },
  ): Promise<void> {
    const appName = this.getAppName();
    const signupLink = `${this.getFrontendUrl()}/signup?claim=${encodeURIComponent(data.claimToken)}`;

    const html = `
    <div style="font-family: 'Segoe UI', Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
      <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); padding: 36px; text-align: center;">
        <h1 style="color: #fff; font-size: 22px; font-weight: 600; margin: 0;">Your Inquiry Has Been Accepted</h1>
      </div>
      <div style="padding: 32px 36px; color: #334155; font-size: 15px; line-height: 1.7;">
        <p>Hi ${clientName || 'there'},</p>
        <p>Thank you for submitting your project inquiry for
          "<strong>${data.projectName}</strong>". We&rsquo;re pleased to let you know that your inquiry has been accepted.</p>
        <p>To move forward, please create your account using the link below:</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${signupLink}" style="display: inline-block; background: #0f3460; color: #fff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
            Sign Up Here
          </a>
        </div>
        <p style="font-size: 13px; color: #64748b;">Or paste this link into your browser:<br/>
          <a href="${signupLink}" style="color: #0f3460; word-break: break-all;">${signupLink}</a>
        </p>
        <p>Once you&rsquo;ve signed up, you&rsquo;ll be added to our client list and we can begin working together.</p>
        <p>If you have any questions, feel free to reach out at
          <a href="mailto:contactus@architecturesimple.com" style="color: #0f3460;">contactus@architecturesimple.com</a>.</p>
        <p>Looking forward to working with you.</p>
        <p style="margin-top: 28px;">Best,<br/>
          <strong>Eric Rivera</strong><br/>
          Principal/Founder<br/>
          Architecture Simple Inc.</p>
      </div>
      <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 36px; text-align: center;">
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">
          If you did not submit this inquiry, please ignore this email.<br/>
          &copy; ${this.getCurrentYear()} ${appName}. All rights reserved.
        </p>
      </div>
    </div>`;

    const text = `Your Inquiry Has Been Accepted – Next Steps

Hi ${clientName || 'there'},

Thank you for submitting your project inquiry. We're pleased to let you know that your inquiry has been accepted.

To move forward, please create your account using the link below:
${signupLink}

Once you've signed up, you'll be added to our client list and we can begin working together.

If you have any questions, feel free to reach out at contactus@architecturesimple.com.

Looking forward to working with you.

Best,
Eric Rivera
Principal/Founder
Architecture Simple Inc.`;

    await this.sendMail({
      to,
      subject: 'Your Inquiry Has Been Accepted – Next Steps',
      html,
      text,
    });
  }

  /**
   * Sent when the studio DECLINES an inquiry. When a consultation fee was
   * paid, `amount` is passed and the refund paragraph is included.
   */
  async sendInquiryDeclined(
    to: string,
    clientName: string,
    data: { projectName: string; amount?: number },
  ): Promise<void> {
    const appName = this.getAppName();
    const refundHtml =
      data.amount && data.amount > 0
        ? `<p>Your consultation fee of <strong>$${Number(data.amount).toLocaleString('en-US')}</strong> is being fully refunded and should appear back in your account within 5&ndash;10 business days.</p>`
        : '';
    const refundText =
      data.amount && data.amount > 0
        ? `\nYour consultation fee of $${Number(data.amount).toLocaleString('en-US')} is being fully refunded and should appear back in your account within 5–10 business days.\n`
        : '';

    const html = `
    <div style="font-family: 'Segoe UI', Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
      <div style="background: #1e293b; padding: 32px 36px; text-align: center;">
        <h1 style="color: #fff; font-size: 20px; font-weight: 600; margin: 0;">Update on Your Project Inquiry</h1>
      </div>
      <div style="padding: 32px 36px; color: #334155; font-size: 15px; line-height: 1.7;">
        <p>Hi ${clientName || 'there'},</p>
        <p>Thank you for your interest and for submitting your project inquiry${data.projectName ? ` for "<strong>${data.projectName}</strong>"` : ''}.</p>
        <p>After careful review, we&rsquo;re unable to move forward with your inquiry at this time.</p>
        ${refundHtml}
        <p>We appreciate you considering us and wish you the best with your project. If you&rsquo;d like to discuss this further or submit a different inquiry in the future, feel free to reach out at
          <a href="mailto:contactus@architecturesimple.com" style="color: #0f3460;">contactus@architecturesimple.com</a>. Thank you for your understanding.</p>
        <p style="margin-top: 28px;">Best,<br/>
          <strong>Eric Rivera</strong><br/>
          Principal/Founder<br/>
          Architecture Simple Inc.</p>
      </div>
      <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 36px; text-align: center;">
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">
          &copy; ${this.getCurrentYear()} ${appName}. All rights reserved.
        </p>
      </div>
    </div>`;

    const text = `Update on Your Project Inquiry

Hi ${clientName || 'there'},

Thank you for your interest and for submitting your project inquiry.

After careful review, we're unable to move forward with your inquiry at this time.
${refundText}
We appreciate you considering us and wish you the best with your project.
If you'd like to discuss this further or submit a different inquiry in the future, feel free to reach out at contactus@architecturesimple.com. Thank you for your understanding.

Best,
Eric Rivera
Principal/Founder
Architecture Simple Inc.`;

    await this.sendMail({
      to,
      subject: 'Update on Your Project Inquiry',
      html,
      text,
    });
  }

  async sendGeneralNotification(
    to: string,
    recipientName: string,
    data: {
      title: string;
      message: string;
      actionText?: string;
      actionUrl?: string;
    },
  ): Promise<void> {
    const appName = this.getAppName();

    const html = `
    <div style="font-family: 'Segoe UI', Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
      <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); padding: 40px 36px 32px; text-align: center;">
        <h1 style="color: #fff; font-size: 22px; font-weight: 600; margin: 0;">${data.title}</h1>
      </div>
      <div style="padding: 32px 36px;">
        <p style="font-size: 16px; color: #333; margin: 0 0 24px; line-height: 1.5;">
          Hello <strong>${recipientName}</strong>,
        </p>
        <p style="font-size: 14px; color: #475569; margin: 0 0 24px; line-height: 1.6;">
          ${data.message}
        </p>
        ${data.actionUrl && data.actionText ? `
        <div style="text-align: center; margin: 32px 0;">
          <a href="${data.actionUrl}" style="display: inline-block; background: #0f3460; color: #fff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
            ${data.actionText}
          </a>
        </div>
        ` : ''}
      </div>
      <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 36px; text-align: center;">
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">
          © ${this.getCurrentYear()} ${appName}. All rights reserved.
        </p>
      </div>
    </div>
    `;

    const text = `
${data.title}

Hello ${recipientName},

${data.message}

${data.actionUrl ? `Take action here: ${data.actionUrl}` : ''}

Best regards,
The ${appName} Team
    `.trim();

    await this.sendMail({
      to,
      subject: `${data.title} - ${appName}`,
      html,
      text,
    });
  }

  // ============================================
  // REFUND ACCEPTED EMAIL
  // ============================================
  async sendRefundAcceptedEmail(
    to: string,
    clientName: string,
    data: {
      refundName: string;
      projectName: string;
      amount: number;
      stageName: string;
    },
  ): Promise<void> {
    const appName = this.getAppName();

    const html = `
    <div style="font-family: 'Segoe UI', Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
      <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); padding: 40px 36px 32px; text-align: center;">
        <h1 style="color: #fff; font-size: 22px; font-weight: 600; margin: 0 0 6px;">Refund Request Approved</h1>
        <p style="color: rgba(255,255,255,0.6); font-size: 13px; margin: 0;">Your refund has been processed</p>
      </div>
      <div style="padding: 32px 36px;">
        <p style="font-size: 16px; color: #333; margin: 0 0 24px; line-height: 1.5;">
          Dear <strong style="color: #0f3460;">${clientName}</strong>,
        </p>
        <p style="font-size: 14px; color: #475569; margin: 0 0 24px; line-height: 1.6;">
          Your refund request has been accepted. Here are the details:
        </p>
        <div style="background: #f0fff4; border-radius: 10px; border: 1px solid #c6f6d5; padding: 20px; margin-bottom: 20px;">
          <div style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
            <span style="font-size: 13px; color: #64748b; font-weight: 600;">Project:</span>
            <span style="font-size: 13px; color: #1e293b; margin-left: 8px;">${data.projectName}</span>
          </div>
          <div style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
            <span style="font-size: 13px; color: #64748b; font-weight: 600;">Phase:</span>
            <span style="font-size: 13px; color: #1e293b; margin-left: 8px;">${data.stageName}</span>
          </div>
          <div style="padding: 8px 0;">
            <span style="font-size: 13px; color: #64748b; font-weight: 600;">Amount:</span>
            <span style="font-size: 16px; color: #2f855a; font-weight: bold; margin-left: 8px;">$${data.amount.toLocaleString()}</span>
          </div>
        </div>
        <p style="font-size: 14px; color: #475569; line-height: 1.6;">
          The refund will be processed to your bank account on file. Please allow 5-10 business days for the funds to appear.
        </p>
      </div>
      <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 36px; text-align: center;">
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">
          © ${this.getCurrentYear()} ${appName}. All rights reserved.
        </p>
      </div>
    </div>
    `;

    const text = `
Refund Request Approved

Dear ${clientName},

Your refund request has been accepted.

Project: ${data.projectName}
Phase: ${data.stageName}
Amount: $${data.amount}

The refund will be processed to your bank account on file.

© ${this.getCurrentYear()} ${appName}
    `.trim();

    await this.sendMail({
      to,
      subject: `Refund Approved – ${data.projectName} - ${appName}`,
      html,
      text,
    });
  }

  // ============================================
  // REFUND REJECTED
  // ============================================
  async sendRefundRejectedEmail(
    to: string,
    clientName: string,
    data: {
      refundName: string;
      projectName: string;
      amount: number;
      stageName: string;
      rejectionReason?: string;
    },
  ): Promise<void> {
    const appName = this.getAppName();

    const reasonBlock = data.rejectionReason
      ? `<div style="background: #fff5f5; border-radius: 10px; border: 1px solid #fed7d7; padding: 20px; margin-bottom: 20px;">
           <p style="font-size: 13px; color: #64748b; font-weight: 600; margin: 0 0 6px;">Reason</p>
           <p style="font-size: 14px; color: #1e293b; margin: 0; line-height: 1.6;">${data.rejectionReason}</p>
         </div>`
      : '';

    const html = `
    <div style="font-family: 'Segoe UI', Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
      <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); padding: 40px 36px 32px; text-align: center;">
        <h1 style="color: #fff; font-size: 22px; font-weight: 600; margin: 0 0 6px;">Refund Request Declined</h1>
        <p style="color: rgba(255,255,255,0.6); font-size: 13px; margin: 0;">An update on your request</p>
      </div>
      <div style="padding: 32px 36px;">
        <p style="font-size: 16px; color: #333; margin: 0 0 24px; line-height: 1.5;">
          Dear <strong style="color: #0f3460;">${clientName}</strong>,
        </p>
        <p style="font-size: 14px; color: #475569; margin: 0 0 24px; line-height: 1.6;">
          After review, your refund request has not been approved. Here are the details:
        </p>
        <div style="background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; padding: 20px; margin-bottom: 20px;">
          <div style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
            <span style="font-size: 13px; color: #64748b; font-weight: 600;">Project:</span>
            <span style="font-size: 13px; color: #1e293b; margin-left: 8px;">${data.projectName}</span>
          </div>
          <div style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
            <span style="font-size: 13px; color: #64748b; font-weight: 600;">Phase:</span>
            <span style="font-size: 13px; color: #1e293b; margin-left: 8px;">${data.stageName}</span>
          </div>
          <div style="padding: 8px 0;">
            <span style="font-size: 13px; color: #64748b; font-weight: 600;">Amount:</span>
            <span style="font-size: 13px; color: #1e293b; margin-left: 8px;">$${data.amount}</span>
          </div>
        </div>
        ${reasonBlock}
        <p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.6;">
          If you have questions about this decision, please reply to this email or contact your project manager.
        </p>
      </div>
    </div>
    `;

    const text = `
Refund Request Declined

Dear ${clientName},

After review, your refund request has not been approved.

Project: ${data.projectName}
Phase: ${data.stageName}
Amount: $${data.amount}
${data.rejectionReason ? `Reason: ${data.rejectionReason}` : ''}

If you have questions about this decision, please contact your project manager.

© ${this.getCurrentYear()} ${appName}
    `.trim();

    await this.sendMail({
      to,
      subject: `Refund Declined – ${data.projectName} - ${appName}`,
      html,
      text,
    });
  }

  // ============================================
  // PHASE COMPLETED - PAYMENT REMINDER
  // ============================================
  async sendPhasePaymentReminder(
    to: string,
    clientName: string,
    data: {
      completedPhaseName: string;
      nextPhaseName: string;
      projectName: string;
      amount: number;
      dashboardUrl: string;
    },
  ): Promise<void> {
    const appName = this.getAppName();

    const html = `
    <div style="font-family: 'Segoe UI', Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
      <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); padding: 40px 36px 32px; text-align: center;">
        <h1 style="color: #fff; font-size: 22px; font-weight: 600; margin: 0 0 6px;">Phase Completed</h1>
        <p style="color: rgba(255,255,255,0.6); font-size: 13px; margin: 0;">Payment required for next phase</p>
      </div>
      <div style="padding: 32px 36px;">
        <p style="font-size: 16px; color: #333; margin: 0 0 24px; line-height: 1.5;">
          Dear <strong style="color: #0f3460;">${clientName}</strong>,
        </p>
        <p style="font-size: 14px; color: #475569; margin: 0 0 24px; line-height: 1.6;">
          The phase <strong>"${data.completedPhaseName}"</strong> has been completed. Please access your dashboard to submit next round of payment for the next phase to begin.
        </p>
        <div style="background: #eff6ff; border-radius: 10px; border: 1px solid #bfdbfe; padding: 20px; margin-bottom: 20px;">
          <div style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
            <span style="font-size: 13px; color: #64748b; font-weight: 600;">Project:</span>
            <span style="font-size: 13px; color: #1e293b; margin-left: 8px;">${data.projectName}</span>
          </div>
          <div style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
            <span style="font-size: 13px; color: #64748b; font-weight: 600;">Completed Phase:</span>
            <span style="font-size: 13px; color: #2f855a; margin-left: 8px;">${data.completedPhaseName} ✓</span>
          </div>
          <div style="padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
            <span style="font-size: 13px; color: #64748b; font-weight: 600;">Next Phase:</span>
            <span style="font-size: 13px; color: #1e293b; margin-left: 8px;">${data.nextPhaseName}</span>
          </div>
          <div style="padding: 8px 0;">
            <span style="font-size: 13px; color: #64748b; font-weight: 600;">Payment Due:</span>
            <span style="font-size: 16px; color: #1d4ed8; font-weight: bold; margin-left: 8px;">$${data.amount.toLocaleString()}</span>
          </div>
        </div>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${data.dashboardUrl}" style="display: inline-block; background: #0f3460; color: #fff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
            Go to Dashboard & Pay
          </a>
        </div>
      </div>
      <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 36px; text-align: center;">
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">
          © ${this.getCurrentYear()} ${appName}. All rights reserved.
        </p>
      </div>
    </div>
    `;

    const text = `
Phase Completed - Payment Required

Dear ${clientName},

The phase: ${data.completedPhaseName} has been completed. Please access your dashboard to submit next round of payment.

Project: ${data.projectName}
Next Phase: ${data.nextPhaseName}
Payment Due: $${data.amount}

Dashboard: ${data.dashboardUrl}

© ${this.getCurrentYear()} ${appName}
    `.trim();

    await this.sendMail({
      to,
      subject: `Phase Completed: ${data.completedPhaseName} – Payment Required for ${data.nextPhaseName}`,
      html,
      text,
    });
  }

  // Reusable low-level send method.
  // Defaults to the studio (project) mailbox — pass `mailbox: 'contact'` for contact-form mail.
  /**
   * The address a mailbox sends from. Use it to copy the studio itself on a
   * client-triggered event, so the shared inbox carries the same trail the
   * individual managers get.
   */
  mailboxAddress(mailbox: Mailbox = DEFAULT_MAILBOX): string {
    return this.mailboxes[mailbox].from;
  }

  async sendMail(options: {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
    cc?: string | string[];
    bcc?: string | string[];
    mailbox?: Mailbox;
  }): Promise<void> {
    const mailbox = options.mailbox ?? DEFAULT_MAILBOX;
    const config = this.mailboxes[mailbox];
    const { transporter, from, fromName } = config;

    try {
      if (this.graphEnabled()) {
        await this.sendViaGraph(config, options);
        this.logger.log(
          `Email sent via Graph (saved to Sent Items) from ${from} to ${options.to}`,
        );
        return;
      }

      const mailOptions = {
        from: `"${fromName}" <${from}>`,
        to: options.to,
        cc: options.cc,
        bcc: options.bcc,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]+>/g, ''),
        replyTo: options.replyTo,
      };

      const info = await transporter.sendMail(mailOptions);
      this.logger.log(
        `Email sent successfully → ${info.messageId} from ${from} to ${options.to}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send email from "${mailbox}" mailbox (${from}) to ${options.to}`,
        error,
      );
      throw error;
    }
  }

  // Convenience wrapper: always sends from contactus@ instead of the studio mailbox.
  async sendContactMail(
    options: Omit<Parameters<MailerService['sendMail']>[0], 'mailbox'>,
  ): Promise<void> {
    await this.sendMail({ ...options, mailbox: 'contact' });
  }

  /** Address the contact form should deliver to (defaults to the contact mailbox itself). */
  getContactInbox(): string {
    return (
      this.config.get<string>('CONTACT_INBOX') ?? this.mailboxes.contact.from
    );
  }
}