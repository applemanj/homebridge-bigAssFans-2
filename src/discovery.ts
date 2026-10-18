import { isIP } from 'net';

interface Advertisement { txt?: Record<string, unknown>; addresses?: string[] }
interface Browser {
  on(event: 'up', listener: (service: Advertisement) => void): unknown;
  stop(): void;
}
interface DiscoveryClient {
  find(options: { type: string }): Browser;
  destroy(): void;
}
type Factory = () => Promise<DiscoveryClient>;

export function normalizeMac(value: string): string {
  return value.replace(/[:-]/g, '').toLowerCase();
}

/** Based on applemanj's v1.2.0 _http._tcp / TXT mac discovery. */
export async function resolveFanIpViaMdns(
  mac: string,
  timeoutMs = 5000,
  factory: Factory = async () => {
    const { Bonjour } = await import('bonjour-service');
    return new Bonjour();
  },
): Promise<string | undefined> {
  const wanted = normalizeMac(mac);
  if (!/^[0-9a-f]{12}$/.test(wanted)) {
    return undefined;
  }
  let client: DiscoveryClient;
  try {
    client = await factory();
  } catch {
    return undefined;
  }
  return new Promise(resolve => {
    let browser: Browser | undefined;
    let settled = false;
    const finish = (address?: string) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      browser?.stop();
      client.destroy();
      resolve(address);
    };
    const timeout = setTimeout(() => finish(), timeoutMs);
    try {
      browser = client.find({ type: 'http' });
      browser.on('up', service => {
        if (normalizeMac(String(service.txt?.mac ?? '')) !== wanted) {
          return;
        }
        const addresses = (service.addresses ?? []).filter(address => isIP(address) !== 0);
        const address = addresses.find(candidate => isIP(candidate) === 4) ?? addresses[0];
        if (address) {
          finish(address);
        }
      });
    } catch {
      finish();
    }
  });
}
