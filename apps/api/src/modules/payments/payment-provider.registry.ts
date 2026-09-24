import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DevPaymentProvider } from './dev-payment.provider';
import type { PaymentProvider } from './payment-provider.interface';

@Injectable()
export class PaymentProviderRegistry implements OnModuleInit {
  private readonly logger = new Logger(PaymentProviderRegistry.name);
  private readonly providers = new Map<string, PaymentProvider>();

  constructor(
    private readonly config: ConfigService,
    devProvider: DevPaymentProvider,
  ) {
    this.register(devProvider);
  }

  /**
   * Fails fast on misconfiguration: an unknown PAYMENT_PROVIDER id or the
   * development provider under NODE_ENV=production aborts bootstrap instead of
   * resolving into a payment path that must never run in production. Staging and
   * demo environments may keep the "dev" provider deliberately.
   */
  async onModuleInit(): Promise<void> {
    const configured = this.config.get<string>('PAYMENT_PROVIDER', 'dev');
    const environment = this.config.get<string>('NODE_ENV', 'development');

    if (!this.providers.has(configured)) {
      throw new Error(`Payment provider "${configured}" is not registered`);
    }
    if (configured === 'dev' && environment === 'production') {
      throw new Error(
        'The "dev" payment provider cannot run with NODE_ENV=production; configure a real payment provider or a non-production environment before accepting payments',
      );
    }
    this.logger.log(`Payment provider "${configured}" configured`);
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
