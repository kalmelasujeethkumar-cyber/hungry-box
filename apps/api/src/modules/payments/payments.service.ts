import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  PaymentMethod as SharedPaymentMethod,
  PaymentStatus as SharedPaymentStatus,
  VerifyPaymentResultDto,
} from '@hungrybox/shared';
import { PaymentStatus as PrismaPaymentStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditKinds, AuditService } from '../audit/audit.service';
import { DevPaymentProvider } from './dev-payment.provider';
import { PaymentNotVerifiedException } from './payment-not-verified.exception';
import { PaymentProviderRegistry } from './payment-provider.registry';

export interface CreatedPayment {
  paymentId: string;
  provider: string;
  providerPaymentId: string;
  providerOrderId: string | null;
  amountMinor: number;
  currency: string;
  method: SharedPaymentMethod;
  status: SharedPaymentStatus;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PaymentProviderRegistry,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async createForCheckout(
    customerId: string,
    input: { amountMinor: number; currency: string; method: SharedPaymentMethod },
  ): Promise<CreatedPayment> {
    const provider = await this.registry.current();
    if (!provider.supportedMethods.includes(input.method)) {
      throw new BadRequestException('This payment method is not supported');
    }

    const db = this.prisma.requireClient();
    const initiated = await provider.create({
      amountMinor: input.amountMinor,
      currency: input.currency,
      method: input.method,
    });
    const payment = await db.payment.create({
      data: {
        customerId,
        provider: provider.id,
        providerPaymentId: initiated.providerPaymentId,
        providerOrderId: initiated.providerOrderId,
        amountMinor: input.amountMinor,
        currency: input.currency,
        method: input.method,
        status: PrismaPaymentStatus.PENDING,
      },
    });

    await this.audit.record({
      actorRole: 'CUSTOMER',
      actorId: customerId,
      kind: AuditKinds.PAYMENT_INITIATED,
      entityType: 'Payment',
      entityId: payment.id,
      message: `Payment intent for ${input.amountMinor} ${input.currency} via ${input.method} initiated with provider ${provider.id}`,
    });

    return {
      paymentId: payment.id,
      provider: provider.id,
      providerPaymentId: payment.providerPaymentId,
      providerOrderId: payment.providerOrderId,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      method: payment.method,
      status: payment.status,
    };
  }

  async verifyPayment(paymentId: string, customerId: string): Promise<VerifyPaymentResultDto> {
    const db = this.prisma.requireClient();
    const payment = await db.payment.findFirst({ where: { id: paymentId, customerId } });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const provider = await this.registry.current();
    if (provider.id !== payment.provider) {
      throw new BadRequestException(
        'Payment verification provider no longer matches the payment intent',
      );
    }

    const result = await provider.verify({
      providerPaymentId: payment.providerPaymentId,
      expectedAmountMinor: payment.amountMinor,
    });

    let updated: {
      status: PrismaPaymentStatus;
      failureReason: string | null;
      failedAt: Date | null;
    };
    if (result.verified) {
      updated = {
        status: PrismaPaymentStatus.AUTHORIZED,
        failureReason: null,
        failedAt: null,
      };
      await this.audit.record({
        actorRole: 'CUSTOMER',
        actorId: customerId,
        kind: AuditKinds.PAYMENT_VERIFIED,
        entityType: 'Payment',
        entityId: payment.id,
        message: 'Payment verified by provider (authorized)',
      });
    } else if (
      result.status === PrismaPaymentStatus.FAILED ||
      result.status === PrismaPaymentStatus.CANCELLED
    ) {
      updated = {
        status: result.status,
        failureReason: result.failureReason,
        failedAt: new Date(),
      };
      await this.audit.record({
        actorRole: 'CUSTOMER',
        actorId: customerId,
        kind: AuditKinds.PAYMENT_FAILED,
        entityType: 'Payment',
        entityId: payment.id,
        message: `Payment verification failed: ${result.failureReason ?? 'unspecified reason'}`,
      });
    } else {
      updated = {
        status: payment.status,
        failureReason: null,
        failedAt: null,
      };
    }

    if (updated.status !== payment.status || updated.failureReason !== payment.failureReason) {
      await db.payment.update({
        where: { id: payment.id },
        data: updated,
      });
    }

    return {
      paymentId: payment.id,
      providerPaymentId: payment.providerPaymentId,
      verified: result.verified,
      status: updated.status,
      failureReason: updated.status === PrismaPaymentStatus.FAILED ? updated.failureReason : null,
    };
  }

  /**
   * Server-side re-verification used when an order is finalized. The provider
   * result is the source of truth; a client can never vouch for a payment.
   * The Payment row is only marked PAID inside the order-creation transaction.
   */
  async requireFinalVerification(
    paymentId: string,
    customerId: string,
  ): Promise<{
    payment: { id: string; providerPaymentId: string; amountMinor: number };
    paidAt: Date;
  }> {
    const db = this.prisma.requireClient();
    const payment = await db.payment.findFirst({ where: { id: paymentId, customerId } });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const provider = await this.registry.current();
    if (provider.id !== payment.provider) {
      throw new BadRequestException(
        'Payment verification provider no longer matches the payment intent',
      );
    }

    const result = await provider.verify({
      providerPaymentId: payment.providerPaymentId,
      expectedAmountMinor: payment.amountMinor,
    });

    if (!result.verified || result.status !== PrismaPaymentStatus.PAID) {
      await this.markFailed(payment.id, customerId, result.status, result.failureReason);
      throw new PaymentNotVerifiedException(result.status, result.failureReason);
    }

    return {
      payment: {
        id: payment.id,
        providerPaymentId: payment.providerPaymentId,
        amountMinor: payment.amountMinor,
      },
      paidAt: result.paidAt ?? new Date(),
    };
  }

  async simulateDev(
    customerId: string,
    providerPaymentId: string,
    outcome: 'success' | 'failure',
  ): Promise<void> {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new NotFoundException('Developer payment simulation is not available');
    }
    const provider = await this.registry.current();
    if (provider.id !== 'dev') {
      throw new NotFoundException('Developer payment simulation is not available');
    }
    const db = this.prisma.requireClient();
    const owned = await db.payment.findFirst({
      where: { providerPaymentId, customerId },
      select: { id: true },
    });
    if (!owned) {
      throw new NotFoundException('Payment not found');
    }
    await (provider as DevPaymentProvider).simulateOutcome(providerPaymentId, outcome);
  }

  private async markFailed(
    paymentId: string,
    customerId: string,
    paymentStatus: PrismaPaymentStatus,
    failureReason: string | null,
  ): Promise<void> {
    const db = this.prisma.requireClient();
    await db.payment.update({
      where: { id: paymentId },
      data: {
        status:
          paymentStatus === PrismaPaymentStatus.FAILED ||
          paymentStatus === PrismaPaymentStatus.CANCELLED
            ? paymentStatus
            : PrismaPaymentStatus.FAILED,
        failureReason,
        failedAt: new Date(),
      },
    });
    await this.audit.record({
      actorRole: 'CUSTOMER',
      actorId: customerId,
      kind: AuditKinds.PAYMENT_FAILED,
      entityType: 'Payment',
      entityId: paymentId,
      message: `Order not created: payment not completed (${failureReason ?? 'unspecified'})`,
    });
  }
}
