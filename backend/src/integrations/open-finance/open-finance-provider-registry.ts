import {
  OpenFinanceProviderAlreadyRegisteredError,
  OpenFinanceProviderNotFoundError,
} from './open-finance-provider.error.js';
import type { OpenFinanceProvider } from './open-finance-provider.js';

function normalizeProviderName(name: string): string {
  return name.trim().toLowerCase();
}

export class OpenFinanceProviderRegistry {
  private readonly providers = new Map<string, OpenFinanceProvider>();

  register(provider: OpenFinanceProvider): void {
    const key = normalizeProviderName(provider.name);

    if (this.providers.has(key)) {
      throw new OpenFinanceProviderAlreadyRegisteredError(provider.name);
    }

    this.providers.set(key, provider);
  }

  get(providerName: string): OpenFinanceProvider {
    const provider = this.providers.get(normalizeProviderName(providerName));

    if (!provider) {
      throw new OpenFinanceProviderNotFoundError(providerName);
    }

    return provider;
  }
}
