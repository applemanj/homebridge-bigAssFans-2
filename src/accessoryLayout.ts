import type { API, PlatformAccessory } from 'homebridge';
import type { BigAssFansAccessoryContext } from './types';

export type LightTile = 'white' | 'modes' | 'night';
type Accessory = PlatformAccessory<BigAssFansAccessoryContext>;

/** Separate HomeKit identities sharing the original fan's one network handler. */
export class AccessoryLayout {
  private pending = new Set<string>();

  constructor(
    private readonly api: API,
    private readonly accessories: Accessory[],
    private readonly plugin: string,
    private readonly platform: string,
  ) {}

  children(parent: Accessory): Accessory[] {
    return this.accessories.filter(accessory => accessory.context.parentUUID === parent.UUID);
  }

  owner(parent: Accessory, role: LightTile, label: string, subtypes: string[]): Accessory {
    const uuid = this.api.hap.uuid.generate(parent.UUID + ':light-tile:' + role);
    let child = this.accessories.find(accessory => accessory.UUID === uuid);
    if (!child) {
      child = new this.api.platformAccessory<BigAssFansAccessoryContext>(parent.context.device.name + ' ' + label, uuid);
      this.accessories.push(child);
      this.pending.add(uuid);
    }
    child.context.device = parent.context.device;
    child.context.parentUUID = parent.UUID;
    child.context.lightTile = role;
    child.getService(this.api.hap.Service.AccessoryInformation)!
      .setCharacteristic(this.api.hap.Characteristic.Manufacturer, 'Big Ass Fans')
      .setCharacteristic(this.api.hap.Characteristic.Model, 'Fan ' + label)
      .setCharacteristic(this.api.hap.Characteristic.SerialNumber, parent.context.device.mac + ':' + role);
    for (const service of [...parent.services]) {
      if (service.subtype && subtypes.includes(service.subtype)) {
        parent.removeService(service);
        if (!child.services.some(existing => existing.UUID === service.UUID && existing.subtype === service.subtype)) {
          child.addService(service);
        }
      }
    }
    return child;
  }

  reconcile(parent: Accessory, active: LightTile[]) {
    const children = this.children(parent);
    const stale = children.filter(child => !active.includes(child.context.lightTile!));
    const registered = stale.filter(child => !this.pending.has(child.UUID));
    if (registered.length) {
      this.api.unregisterPlatformAccessories(this.plugin, this.platform, registered);
    }
    for (const child of stale) {
      this.pending.delete(child.UUID);
      this.accessories.splice(this.accessories.indexOf(child), 1);
    }
    const retained = children.filter(child => !stale.includes(child));
    const added = retained.filter(child => this.pending.has(child.UUID));
    if (added.length) {
      this.api.registerPlatformAccessories(this.plugin, this.platform, added);
      added.forEach(child => this.pending.delete(child.UUID));
    }
    this.api.updatePlatformAccessories([parent, ...retained]);
  }
}
