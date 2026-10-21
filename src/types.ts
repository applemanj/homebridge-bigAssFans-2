import type { AccessoryLayout, LightTile } from './accessoryLayout';
import type { DualLightModeControl } from './lighting';
import type { API, Characteristic, Logger, PlatformConfig, Service } from 'homebridge';

export type DebugLevelConfigEntry = [string, string | number];
export type LightDetectionOverride = boolean | 'auto';

export interface BigAssFansDeviceConfig {
  name: string;
  ip?: string;
  mac: string;
  debugLevels?: DebugLevelConfigEntry[];
  noLights?: boolean;
  dualLightModeControl?: DualLightModeControl;
  /** @deprecated v1.2.0 option; mapped onto dualLightModeControl for backward compatibility. */
  bothlightsControl?: boolean;
  downlightEquipped?: LightDetectionOverride;
  uplightEquipped?: LightDetectionOverride;
  whoosh?: boolean;
  showWhooshSwitch?: boolean;
  dimToWarm?: boolean;
  showDimToWarmSwitch?: boolean;
  fanAuto?: boolean;
  showFanAutoSwitch?: boolean;
  lightAuto?: boolean;
  showLightAutoSwitch?: boolean;
  ecoMode?: boolean;
  showEcoModeSwitch?: boolean;
  enableIncrementalButtons?: boolean;
  incrementalButtonsDelay?: number;
  probeFrequency?: number;
  disableDirectionControl?: boolean;
  showFanOccupancySensor?: boolean;
  showLightOccupancySensor?: boolean;
  showStandbyLED?: boolean;
  enableDebugPort?: boolean;
  showTemperature?: boolean;
  showHumidity?: boolean;
  fanModel?: string;
  devModelOverride?: string;
}

export interface BigAssFansPlatformConfig extends PlatformConfig {
  fans?: BigAssFansDeviceConfig[];
}

export interface BigAssFansAccessoryContext {
  device: BigAssFansDeviceConfig;
  parentUUID?: string;
  lightTile?: LightTile;
  whiteLightMemory?: { down?: number; up?: number };
  nightLightBrightness?: number;
  fanSpeedMemory?: number;
}

export interface BigAssFansPlatformContext {
  readonly layout?: AccessoryLayout;
  readonly Service: typeof Service;
  readonly Characteristic: typeof Characteristic;
  readonly log: Logger;
  readonly api: API;
}

