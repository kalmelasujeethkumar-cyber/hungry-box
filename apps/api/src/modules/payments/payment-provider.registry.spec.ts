import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { DevPaymentProvider } from './dev-payment.provider';
import { PaymentProviderRegistry } from './payment-provider.registry';

function buildRegistry(provider: string, nodeEnv: string): PaymentProviderRegistry {
  const config = {
    get: (key: string, fallback?: string) => {
      if (key === 'PAYMENT_PROVIDER') return provider;
      if (key === 'NODE_ENV') return nodeEnv;
      return fallback;
    },
  } as unknown as ConfigService;
  const dev = {
    id: 'dev',
    supportedMethods: [],
  } as unknown as DevPaymentProvider;
  return new PaymentProviderRegistry(config, dev);
}

describe('PaymentProviderRegistry.onModuleInit', () => {
  it('accepts the dev provider outside production', async () => {
    const registry = buildRegistry('dev', 'development');
    await expect(registry.onModuleInit()).resolves.toBeUndefined();
    const current = await registry.current();
    expect(current.id).toBe('dev');
  });

  it('fails loudly for an unregistered provider', async () => {
    const registry = buildRegistry('razorpay', 'development');
    await expect(registry.onModuleInit()).rejects.toThrow(/not registered/);
    await expect(registry.current()).rejects.toThrow(/not registered/);
  });

  it('refuses the dev provider under NODE_ENV=production', async () => {
    const registry = buildRegistry('dev', 'production');
    await expect(registry.onModuleInit()).rejects.toThrow(/NODE_ENV=production/);
  });

  it('keeps a providers map that can be listed without leaking secrets', () => {
    const registry = buildRegistry('dev', 'development');
    expect(registry.list().map((p) => p.id)).toContain('dev');
  });
});
