import type { LightDetectionOverride } from './types';

export interface Capabilities {
  hasTempSensor: boolean;
  hasHumiditySensor: boolean;
  hasOccupancySensor: boolean;
  hasLight: boolean;
  hasLightSensor: boolean;
  hasColorTempControl: boolean;
  hasFan: boolean;
  hasSpeaker: boolean;
  hasPiezo: boolean;
  hasLEDIndicators: boolean;
  hasUplight: boolean;
  hasUVCLight: boolean;
  hasStandbyLED: boolean;
  hasEcoMode: boolean;
}

export interface CapabilityExposureConfig {
  noLights?: boolean;
  downlightEquipped?: LightDetectionOverride;
  uplightEquipped?: LightDetectionOverride;
  showHumidity?: boolean;
  showTemperature?: boolean;
  showFanOccupancySensor?: boolean;
  showLightOccupancySensor?: boolean;
  showStandbyLED?: boolean;
  showEcoModeSwitch?: boolean;
}

export interface CapabilityExposureSummary {
  detected: string[];
  exposed: string[];
  hiddenByConfig: string[];
  notReportedButEnabled: string[];
}

export const capabilityKeys: Array<keyof Capabilities> = [
  'hasTempSensor',
  'hasHumiditySensor',
  'hasOccupancySensor',
  'hasLight',
  'hasLightSensor',
  'hasColorTempControl',
  'hasFan',
  'hasSpeaker',
  'hasPiezo',
  'hasLEDIndicators',
  'hasUplight',
  'hasUVCLight',
  'hasStandbyLED',
  'hasEcoMode',
];

const capabilityFieldMap: Record<number, keyof Capabilities> = {
  1: 'hasTempSensor',
  2: 'hasHumiditySensor',
  3: 'hasOccupancySensor',
  4: 'hasLight',
  5: 'hasLightSensor',
  6: 'hasColorTempControl',
  7: 'hasFan',
  8: 'hasSpeaker',
  9: 'hasPiezo',
  10: 'hasLEDIndicators',
  11: 'hasUplight',
  12: 'hasUVCLight',
  13: 'hasStandbyLED',
  14: 'hasEcoMode',
};

const START = 0xc0;
const ESC = 0xdb;
const START_STUFF = 0xdc;
const ESC_STUFF = 0xdd;

export function createDefaultCapabilities(): Capabilities {
  return {
    hasTempSensor: false,
    hasHumiditySensor: false,
    hasOccupancySensor: false,
    hasLight: false,
    hasLightSensor: false,
    hasColorTempControl: false,
    hasFan: false,
    hasSpeaker: false,
    hasPiezo: false,
    hasLEDIndicators: false,
    hasUplight: false,
    hasUVCLight: false,
    hasStandbyLED: false,
    hasEcoMode: false,
  };
}

export function applyCapabilityConfig(
  capabilities: Capabilities,
  config: CapabilityExposureConfig = {},
): Capabilities {
  const effective = { ...capabilities };

  if (config.downlightEquipped === undefined || config.downlightEquipped === 'auto') {
    if (!effective.hasLight && effective.hasColorTempControl) {
      effective.hasLight = true;
    }
  } else {
    effective.hasLight = config.downlightEquipped;
  }

  if (config.uplightEquipped !== undefined && config.uplightEquipped !== 'auto') {
    effective.hasUplight = config.uplightEquipped;
  }

  return effective;
}

export function summarizeCapabilityExposure(
  capabilities: Capabilities,
  config: CapabilityExposureConfig = {},
): CapabilityExposureSummary {
  const effective = applyCapabilityConfig(capabilities, config);
  const detected: string[] = [];
  const exposed: string[] = [];
  const hiddenByConfig: string[] = [];
  const notReportedButEnabled: string[] = [];

  if (effective.hasFan) {
    detected.push('fan');
    exposed.push('fan');
  }

  if (effective.hasLight) {
    detected.push('downlight');
    if (config.noLights) {
      hiddenByConfig.push('downlight');
    } else {
      exposed.push('downlight');
    }
  } else if (!config.noLights && config.downlightEquipped === true) {
    notReportedButEnabled.push('downlight');
  }

  if (effective.hasUplight) {
    detected.push('uplight');
    if (config.noLights) {
      hiddenByConfig.push('uplight');
    } else {
      exposed.push('uplight');
    }
  } else if (!config.noLights && config.uplightEquipped === true) {
    notReportedButEnabled.push('uplight');
  }

  if (effective.hasUVCLight) {
    detected.push('uv-c');
    if (config.noLights) {
      hiddenByConfig.push('uv-c');
    } else {
      exposed.push('uv-c');
    }
  }

  if (effective.hasTempSensor) {
    detected.push('temperature');
    if (config.showTemperature === false) {
      hiddenByConfig.push('temperature');
    } else {
      exposed.push('temperature');
    }
  } else if (config.showTemperature !== false) {
    notReportedButEnabled.push('temperature');
  }

  if (effective.hasHumiditySensor) {
    detected.push('humidity');
    if (config.showHumidity === false) {
      hiddenByConfig.push('humidity');
    } else {
      exposed.push('humidity');
    }
  } else if (config.showHumidity !== false) {
    notReportedButEnabled.push('humidity');
  }

  if (effective.hasOccupancySensor) {
    detected.push('occupancy');
    if (config.showFanOccupancySensor) {
      exposed.push('fan occupancy');
    }
    if (config.showLightOccupancySensor) {
      exposed.push('light occupancy');
    }
    if (!config.showFanOccupancySensor && !config.showLightOccupancySensor) {
      hiddenByConfig.push('occupancy');
    }
  } else {
    if (config.showFanOccupancySensor) {
      notReportedButEnabled.push('fan occupancy');
    }
    if (config.showLightOccupancySensor) {
      notReportedButEnabled.push('light occupancy');
    }
  }

  if (effective.hasStandbyLED) {
    detected.push('standby led');
    if (config.showStandbyLED && !config.noLights) {
      exposed.push('standby led');
    } else {
      hiddenByConfig.push('standby led');
    }
  } else if (config.showStandbyLED) {
    notReportedButEnabled.push('standby led');
  }

  if (effective.hasEcoMode) {
    detected.push('eco mode');
    if (config.showEcoModeSwitch) {
      exposed.push('eco mode');
    } else {
      hiddenByConfig.push('eco mode');
    }
  } else if (config.showEcoModeSwitch) {
    notReportedButEnabled.push('eco mode');
  }

  return { detected, exposed, hiddenByConfig, notReportedButEnabled };
}

export function parseCapabilitiesFromSlipData(data: Buffer): Capabilities | undefined {
  for (const frame of extractSlipFrames(data)) {
    const capabilities = parseCapabilitiesFromPayload(frame);
    if (capabilities) {
      return capabilities;
    }
  }
  return undefined;
}

export function extractSlipFrames(data: Buffer): Buffer[] {
  const frames: Buffer[] = [];
  let start = data.indexOf(START);

  while (start !== -1) {
    const end = data.indexOf(START, start + 1);
    if (end === -1) {
      break;
    }
    if (end > start + 1) {
      frames.push(unstuff(data.subarray(start + 1, end)));
    }
    start = end;
  }

  return frames;
}

function parseCapabilitiesFromPayload(payload: Buffer): Capabilities | undefined {
  return walkMessage(payload, 0);
}

function walkMessage(message: Buffer, depth: number): Capabilities | undefined {
  if (depth > 8) {
    return undefined;
  }

  let b = message;
  while (b.length > 0) {
    const key = readVarintSafe(b);
    if (!key) {
      return undefined;
    }
    b = key.rest;
    const type = key.value & 0x07;
    const field = key.value >>> 3;

    if (type === 2) {
      const length = readVarintSafe(b);
      if (!length || length.value > length.rest.length) {
        return undefined;
      }
      const body = length.rest.subarray(0, length.value);
      b = length.rest.subarray(length.value);

      if (field === 17) {
        const capabilities = parseCapabilityMessage(body);
        if (capabilities) {
          return capabilities;
        }
      }

      const nested = walkMessage(body, depth + 1);
      if (nested) {
        return nested;
      }
    } else {
      const skipped = skipField(b, type);
      if (!skipped) {
        return undefined;
      }
      b = skipped;
    }
  }

  return undefined;
}

function parseCapabilityMessage(message: Buffer): Capabilities | undefined {
  const capabilities = createDefaultCapabilities();
  let b = message;
  let foundCapabilityField = false;

  while (b.length > 0) {
    const key = readVarintSafe(b);
    if (!key) {
      return undefined;
    }
    b = key.rest;
    const type = key.value & 0x07;
    const field = key.value >>> 3;
    const capabilityKey = capabilityFieldMap[field];

    if (capabilityKey && type === 0) {
      const value = readVarintSafe(b);
      if (!value) {
        return undefined;
      }
      b = value.rest;
      capabilities[capabilityKey] = Boolean(value.value);
      foundCapabilityField = true;
    } else {
      const skipped = skipField(b, type);
      if (!skipped) {
        return undefined;
      }
      b = skipped;
    }
  }

  return foundCapabilityField ? capabilities : undefined;
}

function readVarintSafe(data: Buffer): { rest: Buffer; value: number } | undefined {
  if (data.length === 0) {
    return undefined;
  }

  let value = 0;
  let shift = 0;

  for (let index = 0; index < data.length; index++) {
    const byte = data[index];
    value += (byte & 0x7f) * (2 ** shift);
    if ((byte & 0x80) === 0) {
      return { rest: data.subarray(index + 1), value };
    }
    shift += 7;
    if (shift > 49) {
      return undefined;
    }
  }

  return undefined;
}

function skipField(data: Buffer, type: number): Buffer | undefined {
  if (type === 0) {
    return readVarintSafe(data)?.rest;
  }

  if (type === 1) {
    return data.length >= 8 ? data.subarray(8) : undefined;
  }

  if (type === 2) {
    const length = readVarintSafe(data);
    if (!length || length.value > length.rest.length) {
      return undefined;
    }
    return length.rest.subarray(length.value);
  }

  if (type === 5) {
    return data.length >= 4 ? data.subarray(4) : undefined;
  }

  return undefined;
}

function unstuff(data: Buffer): Buffer {
  const unstuffedData: number[] = [];

  for (let index = 0; index < data.length; index++) {
    if (data[index] === ESC) {
      const next = data[index + 1];
      if (next === START_STUFF) {
        unstuffedData.push(START);
        index++;
      } else if (next === ESC_STUFF) {
        unstuffedData.push(ESC);
        index++;
      } else {
        unstuffedData.push(data[index]);
      }
    } else {
      unstuffedData.push(data[index]);
    }
  }

  return Buffer.from(unstuffedData);
}
