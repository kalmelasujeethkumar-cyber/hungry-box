import type { PaymentMethod, PaymentStatus } from '@hungrybox/shared';

export interface CreatePaymentInput {
  amountMinor: number;
  currency: string;
  method: PaymentMethod;
}

export interface CreatePaymentResult {
  providerPaymentId: string;
  providerOrderId: string | null;
}

export interface VerifyPaymentInput {
  providerPaymentId: string;
  expectedAmountMinor: number;
}

export interface VerifyPaymentResult {
  verified: boolean;
  status: PaymentStatus;
  failureReason: string | null;
  paidAt: Date | null;
}

export interface PaymentProvider {
  readonly id: string;
  readonly supportedMethods: readonly PaymentMethod[];
  create(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verify(input: VerifyPaymentInput): Promise<VerifyPaymentResult>;
}
