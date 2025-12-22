// utils/email/email.service.ts
import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({  // ✅ Changed from createTransporter
      host: this.config.get('SMTP_HOST'),
      port: this.config.get('SMTP_PORT'),
      secure: false,
      auth: {
        user: this.config.get('SMTP_USER'),
        pass: this.config.get('SMTP_PASS'),
      },
    });
  }

  async sendEmailVerification(
    email: string, 
    token: string, 
    name: string,
    verifyUrl: string
  ): Promise<void> {
    try {
      const verificationLink = `${verifyUrl}?token=${token}&email=${encodeURIComponent(email)}`;
      
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to Your App, ${name}!</h2>
          <p>Thank you for joining. Please verify your email address to activate your account.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationLink}" 
               style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
              Verify Your Email
            </a>
          </div>
          
          <p><small>If the button doesn't work, copy and paste this link:</small><br>
          <code style="word-break: break-all; background: #f8f9fa; padding: 4px; border-radius: 3px;">
            ${verificationLink}
          </code></p>
          
          <p>This link will expire in 24 hours. If you didn't create this account, please ignore this email.</p>
          
          <hr style="margin: 40px 0;">
          <p style="color: #666; font-size: 12px;">
            © 2025 Your App. All rights reserved.
          </p>
        </div>
      `;

      const mailOptions = {
        from: `"${this.config.get('MAIL_FROM_NAME')}" <${this.config.get('MAIL_FROM')}>`,
        to: email,
        subject: 'Verify Your Email Address - Welcome to Your App!',
        html,
        text: `Please verify your email by visiting: ${verificationLink}`,
      };

      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Verification email sent successfully to: ${email}`);  // ✅ Fixed syntax
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${email}:`, error);  // ✅ Fixed syntax
      throw new Error(`Failed to send verification email. Please try again later.`);  // ✅ Fixed syntax
    }
  }

  async sendPasswordReset(email: string, token: string, resetUrl: string): Promise<void> {
    // Implementation for password reset (future use)
  }
}