import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from 'src/utils/email/email.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateContactMessageDto } from './dto/create-contact.dto';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Where contact-form mail lands: CONTACT_INBOX (comma separated), else the
   * contact mailbox's own address, else the active admins — so the form always
   * reaches a human even on a partly configured environment.
   */
  private async resolveRecipients(): Promise<string[]> {
    const configured =
      this.config.get<string>('CONTACT_INBOX') ||
      this.config.get<string>('CONTACT_MAIL_FROM');

    if (configured) {
      return configured
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean);
    }

    const admins = await this.prisma.user.findMany({
      where: {
        role: { in: ['SUPER_ADMIN', 'ADMIN'] },
        isActive: true,
      },
      select: { email: true },
    });

    return admins.map((a) => a.email);
  }

  async submit(dto: CreateContactMessageDto) {
    // Honeypot tripped — look successful, send nothing.
    if (dto.website && dto.website.trim().length > 0) {
      this.logger.warn(`Contact form honeypot tripped by ${dto.email}`);
      return {
        success: true,
        message: "Thanks for reaching out! We'll be in touch shortly.",
      };
    }

    const name = dto.name.trim();
    const email = dto.email.trim().toLowerCase();
    const message = dto.message.trim();
    const subject = dto.subject?.trim() || 'New contact form enquiry';

    const recipients = await this.resolveRecipients();

    if (recipients.length === 0) {
      this.logger.error(
        'Contact form submitted but no recipients are configured (set CONTACT_INBOX)',
      );
      // Don't leak configuration problems to the visitor.
      return {
        success: true,
        message: "Thanks for reaching out! We'll be in touch shortly.",
      };
    }

    const safeName = this.escape(name);
    const safeEmail = this.escape(email);
    const safeMessage = this.escape(message).replace(/\n/g, '<br/>');

    await this.mailer.sendMail({
      mailbox: 'contact',
      to: recipients,
      // Replying in the mail client goes straight back to the visitor.
      replyTo: email,
      subject: `${subject} — ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0f3460;">New Contact Enquiry</h2>
          <div style="background: #f4f7fa; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0 0 8px;"><strong>Name:</strong> ${safeName}</p>
            <p style="margin: 0 0 8px;"><strong>Email:</strong> ${safeEmail}</p>
          </div>
          <div style="border-left: 3px solid #0f3460; padding-left: 16px;">
            <p style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px;">Message</p>
            <p style="font-size: 14px; color: #1e293b; line-height: 1.6; margin: 0;">${safeMessage}</p>
          </div>
          <p style="margin-top: 32px; color: #94a3b8; font-size: 11px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
            Sent from the Architecture Simple contact form. Reply directly to respond to ${safeEmail}.
          </p>
        </div>
      `,
      text: `New contact enquiry\n\nName: ${name}\nEmail: ${email}\n\n${message}`,
    });

    this.logger.log(`Contact form submitted by ${email}`);

    // Acknowledgement to the visitor. Never fail the request over this.
    try {
      await this.mailer.sendMail({
        mailbox: 'contact',
        to: email,
        subject: 'We received your message — Architecture Simple',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0f3460;">Thanks for getting in touch</h2>
            <p style="font-size: 14px; color: #1e293b; line-height: 1.6;">
              Hi ${safeName}, we've received your message and someone from our team
              will get back to you shortly.
            </p>
            <div style="background: #f4f7fa; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px;">Your message</p>
              <p style="font-size: 14px; color: #1e293b; line-height: 1.6; margin: 0;">${safeMessage}</p>
            </div>
          </div>
        `,
      });
    } catch (error) {
      this.logger.warn(`Could not send contact acknowledgement to ${email}`);
    }

    return {
      success: true,
      message: "Thanks for reaching out! We'll be in touch shortly.",
    };
  }
}
