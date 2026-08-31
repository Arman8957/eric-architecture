import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private stripe: Stripe.Stripe;

  constructor(private config: ConfigService) {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      this.logger.warn('STRIPE_SECRET_KEY not configured — Stripe payments disabled');
    }
    this.stripe = new Stripe(secretKey || '', {
      apiVersion: '2024-12-18.acacia' as any,
    });
  }

  /**
   * Create a Stripe Checkout Session for a one-time payment
   */
  async createCheckoutSession(params: {
    amount: number; // in dollars
    projectName: string;
    stageName?: string;
    paymentType: string;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
  }): Promise<{ sessionId: string; url: string }> {
    const description = params.stageName
      ? `Payment for ${params.stageName} — ${params.projectName}`
      : `Lump Sum Payment — ${params.projectName}`;

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: description,
              description: `Project: ${params.projectName}`,
            },
            unit_amount: Math.round(params.amount * 100), // Stripe expects cents
          },
          quantity: 1,
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata,
    });

    this.logger.log(`Stripe checkout session created: ${session.id}`);
    return { sessionId: session.id, url: session.url! };
  }

  /**
   * Construct and verify a Stripe webhook event
   */
  constructWebhookEvent(payload: Buffer, signature: string): any {
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET not configured');
    }
    return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }

  /**
   * Retrieve a checkout session with payment details
   */
  async retrieveSession(sessionId: string): Promise<any> {
    return this.stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    });
  }

  /**
   * Create a PaymentIntent for embedded payment flow (Stripe Elements)
   */
  async createPaymentIntent(params: {
    amount: number;
    metadata: Record<string, string>;
    description: string;
  }): Promise<{ clientSecret: string; id: string }> {
    const intent = await this.stripe.paymentIntents.create({
      amount: Math.round(params.amount * 100),
      currency: 'usd',
      metadata: params.metadata,
      description: params.description,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    this.logger.log(`Stripe PaymentIntent created: ${intent.id}`);
    return { clientSecret: intent.client_secret!, id: intent.id };
  }

  /**
   * Retrieve a PaymentIntent by ID
   */
  async retrievePaymentIntent(id: string): Promise<any> {
    return this.stripe.paymentIntents.retrieve(id);
  }

  /**
   * Refund a succeeded PaymentIntent back to the original card.
   * Used for the consultation fee when the studio declines an inquiry.
   */
  async refundPaymentIntent(
    paymentIntentId: string,
  ): Promise<{ id: string; status: string | null }> {
    const refund = await this.stripe.refunds.create({
      payment_intent: paymentIntentId,
      reason: 'requested_by_customer',
    });
    this.logger.log(
      `Stripe refund created: ${refund.id} for PaymentIntent ${paymentIntentId} (${refund.status})`,
    );
    return { id: refund.id, status: refund.status };
  }
}
