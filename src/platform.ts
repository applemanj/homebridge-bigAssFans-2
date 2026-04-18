import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, Service, Characteristic } from 'homebridge';

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
        throw new Error(`"ip" is required but not defined for ${fan.name}!`);
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
