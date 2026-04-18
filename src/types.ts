import type { API, Characteristic, Logger, PlatformConfig, Service } from 'homebridge';

export type DebugLevelConfigEntry = [string, string | number];

export interface BigAssFansDeviceConfig {
  name: string;
  ip: string;
  mac: string;
  debugLevels?: DebugLevelConfigEntry[];
  noLights?: boolean;
  downlightEquipped?: boolean;
  uplightEquipped?: boolean;
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
}

export interface BigAssFansPlatformContext {
  readonly Service: typeof Service;
  readonly Characteristic: typeof Characteristic;
  readonly log: Logger;
  readonly api: API;
}
