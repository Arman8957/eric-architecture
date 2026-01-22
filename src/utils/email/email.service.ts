// utils/email/email.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { RequestStatus } from '@prisma/client';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    const port = this.config.get<number>('SMTP_PORT', 587);
    this.transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST'),
      port,
      secure: port === 465, // true for 465, false for 587 (STARTTLS)
      auth: {
        user: this.config.get('SMTP_USER'),
        pass: this.config.get('SMTP_PASS'),
      },
      // Optional: only enable in development if using self-signed certs
      tls:
        this.config.get('NODE_ENV') === 'development'
          ? { rejectUnauthorized: false }
          : undefined,
      // Very helpful for debugging
      logger: true,
      debug: this.config.get('NODE_ENV') === 'development',
    });

    // Verify connection once on startup (useful in dev)
    this.transporter.verify((error) => {
      if (error) {
        this.logger.error('Transporter verification failed', error);
      } else {
        this.logger.log('SMTP transporter is ready');
      }
    });
  }

  private getAppName(): string {
    return this.config.get('APP_NAME', 'Architecture Simple');
  }

  private getCurrentYear(): number {
    return new Date().getFullYear();
  }

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
    const appName = this.config.get('APP_NAME', 'Architecture Simple');
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
        © ${new Date().getFullYear()} ${appName}. All rights reserved.
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

  /**
   * Sends email notification when a project stage is completed
   */
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
    const appName = this.config.get('APP_NAME', 'Architecture Simple');
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

      <p style="margin: 24px 0;">
        You can view the updated project status and details here:
      </p>

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
        © ${new Date().getFullYear()} ${appName}. All rights reserved.
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

  // Reusable low-level method (you'll use this for proposal sent, status change, etc.)
  async sendMail(options: {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
  }): Promise<void> {
    try {
      const mailOptions = {
        from: `"${this.config.get('MAIL_FROM_NAME')}" <${this.config.get('MAIL_FROM')}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]+>/g, ''), // crude fallback
        replyTo: options.replyTo,
      };

      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(
        `Email sent successfully → ${info.messageId} to ${options.to}`,
      );
    } catch (error) {
      this.logger.error('Failed to send email', error);
      throw error; // Let caller decide how to handle (retry, notify admin, etc.)
    }
  }
}

// // utils/email/email.service.ts
// import { Injectable, Logger } from '@nestjs/common';
// import * as nodemailer from 'nodemailer';
// import { ConfigService } from '@nestjs/config';

// @Injectable()
// export class MailerService {
//   private readonly logger = new Logger(MailerService.name);
//   private transporter: nodemailer.Transporter;

//   constructor(private config: ConfigService) {
//     this.transporter = nodemailer.createTransport({
//       host: this.config.get('SMTP_HOST'),
//       port: this.config.get('SMTP_PORT'),
//       secure: false,
//       auth: {
//         user: this.config.get('SMTP_USER'),
//         pass: this.config.get('SMTP_PASS'),
//       },
//     });
//   }

//   async sendEmailVerification(
//     email: string,
//     token: string,
//     name: string,
//     verifyUrl: string
//   ): Promise<void> {
//     try {
//       const verificationLink = `${verifyUrl}?token=${token}&email=${encodeURIComponent(email)}`;

//       const html = `
//         <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//           <h2>Welcome to Your App, ${name}!</h2>
//           <p>Thank you for joining. Please verify your email address to activate your account.</p>

//           <div style="text-align: center; margin: 30px 0;">
//             <a href="${verificationLink}"
//                style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
//               Verify Your Email
//             </a>
//           </div>

//           <p><small>If the button doesn't work, copy and paste this link:</small><br>
//           <code style="word-break: break-all; background: #f8f9fa; padding: 4px; border-radius: 3px;">
//             ${verificationLink}
//           </code></p>

//           <p>This link will expire in 24 hours. If you didn't create this account, please ignore this email.</p>

//           <hr style="margin: 40px 0;">
//           <p style="color: #666; font-size: 12px;">
//             © 2025 Your App. All rights reserved.
//           </p>
//         </div>
//       `;

//       const mailOptions = {
//         from: `"${this.config.get('MAIL_FROM_NAME')}" <${this.config.get('MAIL_FROM')}>`,
//         to: email,
//         subject: 'Verify Your Email Address - Welcome to Your App!',
//         html,
//         text: `Please verify your email by visiting: ${verificationLink}`,
//       };

//       await this.transporter.sendMail(mailOptions);
//       this.logger.log(`Verification email sent successfully to: ${email}`);
//     } catch (error) {
//       this.logger.error(`Failed to send verification email to ${email}:`, error);
//       throw new Error(`Failed to send verification email. Please try again later.`);
//     }
//   }

//   async sendPasswordReset(email: string, token: string, resetUrl: string): Promise<void> {

//   }
// }
