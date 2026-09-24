import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DevPaymentProvider } from './dev-payment.provider';
import type { PaymentProvider } from './payment-provider.interface';

@Injectable()
export class PaymentProviderRegistry {
  private readonly logger = new Logger(PaymentProviderRegistry.name);
  private readonly providers = new Map<string, PaymentProvider>();

  constructor(
    private readonly config: ConfigService,
    devProvider: DevPaymentProvider,
  ) {
    this.register(devProvider);
  }

  async current(): Promise<PaymentProvider> {
    const configured = this.config.get<string>('PAYMENT_PROVIDER', 'dev');
    const provider = this.providers.get(configured);
    if (!provider) {
      throw new Error(`Payment provider "${configured}" is not registered`);
    }
    return provider;
  }

  list(): PaymentProvider[] {
    return [...this.providers.values()];
  }

  /** Registers providers so the configured id resolves at runtime. */
  register(provider: PaymentProvider): void {
    if (this.providers.has(provider.id)) return;
    this.providers.set(provider.id, provider);
    this.logger.log(`Registered payment provider "${provider.id}"`);
  }
}
