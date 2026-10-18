import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, Service, Characteristic } from 'homebridge';
import { Bonjour } from 'bonjour-service';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { BigAssFans_i6PlatformAccessory } from './platformAccessory';
import type { BigAssFansAccessoryContext, BigAssFansDeviceConfig, BigAssFansPlatformConfig } from './types';

/**
 * BigAssFans_i6Platform
 *
 * Parses the user config and discovers/registers fan accessories with Homebridge.
 */
export class BigAssFans_i6Platform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory<BigAssFansAccessoryContext>[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: BigAssFansPlatformConfig,
    public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;
    this.log.debug('Finished initializing platform');

    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      this.initDevices();
    });
  }

  /**
   * Called by Homebridge for each cached accessory restored from disk at startup.
   */
  configureAccessory(accessory: PlatformAccessory) {
    const typedAccessory = accessory as PlatformAccessory<BigAssFansAccessoryContext>;
    this.log.info('Loading accessory from cache:', typedAccessory.displayName);
    this.accessories.push(typedAccessory);
  }

  /**
   * Reads fan entries from config and creates/restores accessories for each one.
   * Fans without an explicit ip are resolved via mDNS before setup.
   */
  initDevices() {
    this.log.info('Init - initializing devices');
    const configuredUUIDs = new Set<string>();

    if (this.config.fans && Array.isArray(this.config.fans)) {
      for (const fan of this.config.fans) {
        if (fan) {
          if (fan.mac) {
            configuredUUIDs.add(this.api.hap.uuid.generate(fan.mac));
          }
        }
      }

      const pendingFans = this.config.fans.filter(fan => fan && fan.mac && !fan.ip);

      if (pendingFans.length > 0) {
        this.resolveFansViaMdns(pendingFans).then(() => {
          for (const fan of this.config.fans!) {
            if (fan) {
              this.setupFan(fan);
            }
          }
          this.removeStaleAccessories(configuredUUIDs);
        });
        return;
      }

      for (const fan of this.config.fans) {
        if (fan) {
          this.setupFan(fan);
        }
      }
    } else if (this.config.fans) {
      this.log.info('The fans property is not of type array. Cannot initialize. Type: %s', typeof this.config.fans);
    }

    if (!this.config.fans) {
      this.log.info('-------------------------------------------');
      this.log.info('Init - no fan configuration found');
      this.log.info('Missing fans in your platform config');
      this.log.info('-------------------------------------------');
    }

    this.removeStaleAccessories(configuredUUIDs);
  }

  /**
   * Browses _http._tcp over mDNS and fills in the ip for each pending fan by
   * matching the TXT record mac (case-insensitive) against the configured mac.
   * Browsing stops as soon as every pending fan has been resolved.
   */
  private async resolveFansViaMdns(pendingFans: BigAssFansDeviceConfig[]): Promise<void> {
    const bonjour = new Bonjour();
    const browser = bonjour.find({ type: 'http' });
    const unresolved = new Map<string, BigAssFansDeviceConfig>();
    for (const fan of pendingFans) {
      unresolved.set(fan.mac.toLowerCase(), fan);
    }

    this.log.info('Discovering fans via mDNS (%d fan(s) without ip)...', unresolved.size);

    return new Promise<void>(resolve => {
      const timeout = setTimeout(() => {
        browser.stop();
        bonjour.destroy();
        this.logUnresolvedFans(unresolved);
        resolve();
      }, 10000);

      browser.on('up', (service: { txt?: Record<string, string>; addresses?: string[] }) => {
        const txtMac = service.txt?.mac?.toLowerCase();
        if (!txtMac || !unresolved.has(txtMac)) {
          return;
        }

        const address = service.addresses?.find(addr => addr.includes('.')) ?? service.addresses?.[0];
        if (!address) {
          return;
        }

        const fan = unresolved.get(txtMac)!;
        fan.ip = address;
        unresolved.delete(txtMac);
        this.log.info('mDNS: found %s at %s', fan.name, address);

        if (unresolved.size === 0) {
          clearTimeout(timeout);
          browser.stop();
          bonjour.destroy();
          resolve();
        }
      });
    });
  }

  private logUnresolvedFans(unresolved: Map<string, BigAssFansDeviceConfig>) {
    for (const fan of unresolved.values()) {
      this.log.error(
        'mDNS: could not find %s (mac %s). Ensure the fan is powered on and on the same network, or set its ip manually.',
        fan.name,
        fan.mac,
      );
    }
  }

  private removeStaleAccessories(configuredUUIDs: Set<string>) {
    const staleAccessories = this.accessories.filter(accessory => !configuredUUIDs.has(accessory.UUID));
    if (staleAccessories.length > 0) {
      staleAccessories.forEach(accessory => {
        this.log.info('Removing stale accessory from cache:', accessory.displayName);
      });
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, staleAccessories);
      this.accessories.splice(0, this.accessories.length, ...this.accessories.filter(accessory => configuredUUIDs.has(accessory.UUID)));
    }
  }

  /**
   * Sets up a single fan accessory: validates config, restores from cache or creates new,
   * and instantiates the accessory handler.
   */
  private setupFan(fan: BigAssFansDeviceConfig) {
    try {
      if (!fan.name) {
        throw new Error('"name" is required but not defined!');
      }
      if (!fan.ip) {
        throw new Error(`"ip" could not be determined for ${fan.name}! (mDNS discovery failed and no ip is configured)`);
      }
      if (!fan.mac) {
        throw new Error(`"mac" is required but not defined for ${fan.name}!`);
      }
    } catch (error) {
      this.log.error((error as Error).message);
      this.log.error('Failed to create platform device, missing mandatory information!');
      this.log.error('Please check your device config!');
      return;
    }

    const uuid = this.api.hap.uuid.generate(fan.mac);
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    if (existingAccessory) {
      this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

      if (existingAccessory.context.device !== fan) {
        existingAccessory.context.device = fan;
        this.api.updatePlatformAccessories([existingAccessory]);
      }

      new BigAssFans_i6PlatformAccessory(this, existingAccessory);
    } else {
      this.log.info('Adding new accessory:', fan.name);

      const accessory = new this.api.platformAccessory<BigAssFansAccessoryContext>(fan.name, uuid);
      accessory.context.device = fan;

      new BigAssFans_i6PlatformAccessory(this, accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }
}
