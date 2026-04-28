import * as net from 'net';
import {
  applyCapabilityConfig,
  parseCapabilitiesFromSlipData,
  summarizeCapabilityExposure,
  type Capabilities,
  type CapabilityExposureConfig,
  type CapabilityExposureSummary,
} from '../protocol';

interface HomebridgePluginUiServer {
  onRequest(path: string, handler: (payload: unknown) => Promise<unknown>): void;
  ready(): void;
}

type HomebridgePluginUiServerConstructor = new () => HomebridgePluginUiServer;

interface FanConfigPayload extends CapabilityExposureConfig {
  name?: string;
  ip?: string;
  mac?: string;
}

interface TestConnectionPayload {
  fan?: FanConfigPayload;
}

interface DiagnosticsPayload {
  fans?: FanConfigPayload[];
}

type NormalizedFanConfig = CapabilityExposureConfig & Required<Pick<FanConfigPayload, 'name' | 'ip' | 'mac'>>;

interface FanDiagnosticDevice {
  index: number;
  fan: NormalizedFanConfig;
  result: ConnectionDiagnostic;
}

interface ConnectionDiagnostic {
  ok: boolean;
  state: 'missing-config' | 'connected' | 'responded' | 'timeout' | 'error';
  message: string;
  checkedAt: string;
  latencyMs?: number;
  bytesReceived?: number;
  errorCode?: string;
  capabilities?: Capabilities;
  capabilitySummary?: CapabilityExposureSummary;
  capabilityMessage?: string;
}

const FAN_PORT = 31415;
const DEFAULT_TIMEOUT_MS = 4500;
const CAPABILITY_QUERY = [0x12, 0x04, 0x1a, 0x02, 0x08, 0x06];
const STATE_REFRESH = [0x12, 0x02, 0x1a, 0x00];
const START = 0xc0;
const ESC = 0xdb;
const START_STUFF = 0xdc;
const ESC_STUFF = 0xdd;

export function startBigAssFansUiServer(
  HomebridgePluginUiServer: HomebridgePluginUiServerConstructor,
): HomebridgePluginUiServer {
  class BigAssFansUiServer extends HomebridgePluginUiServer {
    constructor() {
      super();

      this.onRequest('/fan/test-connection', this.testConnection.bind(this));
      this.onRequest('/diagnostics/state', this.getDiagnostics.bind(this));

      this.ready();
    }

    private async testConnection(payload: unknown) {
      const request = toPayload<TestConnectionPayload>(payload);
      const fan = normalizeFan(request.fan);
      return {
        ok: true,
        fan,
        result: await testFanConnection(fan),
      };
    }

    private async getDiagnostics(payload: unknown) {
      const request = toPayload<DiagnosticsPayload>(payload);
      const fans = Array.isArray(request.fans) ? request.fans.map(normalizeFan) : [];
      const devices: FanDiagnosticDevice[] = [];
      for (const [index, fan] of fans.entries()) {
        devices.push({
          index,
          fan,
          result: await testFanConnection(fan),
        });
      }

      return {
        ok: true,
        generatedAt: new Date().toISOString(),
        deviceCount: devices.length,
        devices,
      };
    }
  }

  return new BigAssFansUiServer();
}

function normalizeFan(fan: FanConfigPayload | undefined): NormalizedFanConfig {
  return {
    ...(fan || {}),
    name: String(fan?.name || '').trim(),
    ip: String(fan?.ip || '').trim(),
    mac: String(fan?.mac || '').trim(),
  };
}

function toPayload<T>(payload: unknown): Partial<T> {
  return payload && typeof payload === 'object' ? payload as Partial<T> : {};
}

function validateFan(fan: NormalizedFanConfig): string | undefined {
  if (!fan.name) {
    return 'Fan name is required.';
  }
  if (!fan.ip) {
    return 'Fan IP address or hostname is required.';
  }
  if (!/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(fan.mac)) {
    return 'Fan MAC address must use the format 20:F8:5E:00:00:00.';
  }
  return undefined;
}

function testFanConnection(fan: NormalizedFanConfig, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<ConnectionDiagnostic> {
  const validationError = validateFan(fan);
  if (validationError) {
    return Promise.resolve({
      ok: false,
      state: 'missing-config',
      message: validationError,
      checkedAt: new Date().toISOString(),
    });
  }

  return new Promise((resolve) => {
    const startedAt = Date.now();
    let settled = false;
    let connected = false;
    let bytesReceived = 0;
    let receivedData = Buffer.alloc(0);
    let timeout: ReturnType<typeof setTimeout>;
    let responseGraceTimeout: ReturnType<typeof setTimeout> | undefined;
    const socket = net.connect({ port: FAN_PORT, host: fan.ip });

    const finish = (result: Omit<ConnectionDiagnostic, 'checkedAt'>) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (responseGraceTimeout !== undefined) {
        clearTimeout(responseGraceTimeout);
      }
      socket.removeAllListeners();
      socket.destroy();
      resolve({
        ...result,
        checkedAt: new Date().toISOString(),
      });
    };

    timeout = setTimeout(() => {
      const capabilityDetails = getCapabilityDetails(receivedData, fan);
      finish({
        ok: connected || bytesReceived > 0,
        state: bytesReceived > 0 ? 'responded' : (connected ? 'connected' : 'timeout'),
        message: bytesReceived > 0
          ? `Fan responded with ${bytesReceived} byte(s), then the check timed out waiting for more data.`
          : (connected
            ? `Connected to ${fan.ip}:${FAN_PORT}, but the fan did not send probe data before the diagnostic timeout.`
            : `No response from ${fan.ip}:${FAN_PORT} within ${timeoutMs}ms.`),
        latencyMs: Date.now() - startedAt,
        bytesReceived,
        ...capabilityDetails,
      });
    }, timeoutMs);

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      connected = true;
      socket.setKeepAlive(true);
      socket.write(frameMessage(CAPABILITY_QUERY));
      socket.write(frameMessage(STATE_REFRESH));
    });

    socket.on('data', (data: Buffer) => {
      bytesReceived += data.length;
      receivedData = Buffer.concat([receivedData, data]);
      const capabilityDetails = getCapabilityDetails(receivedData, fan);

      if (capabilityDetails.capabilities) {
        finish({
          ok: true,
          state: 'responded',
          message: `Fan responded on ${fan.ip}:${FAN_PORT} and reported capabilities.`,
          latencyMs: Date.now() - startedAt,
          bytesReceived,
          ...capabilityDetails,
        });
        return;
      }

      if (responseGraceTimeout !== undefined) {
        clearTimeout(responseGraceTimeout);
      }

      responseGraceTimeout = setTimeout(() => {
        finish({
          ok: true,
          state: 'responded',
          message: `Fan responded on ${fan.ip}:${FAN_PORT}, but capability details were not present in the diagnostic response.`,
          latencyMs: Date.now() - startedAt,
          bytesReceived,
          ...getCapabilityDetails(receivedData, fan),
        });
      }, 300);
    });

    socket.on('timeout', () => {
      clearTimeout(timeout);
      finish({
        ok: connected || bytesReceived > 0,
        state: bytesReceived > 0 ? 'responded' : (connected ? 'connected' : 'timeout'),
        message: bytesReceived > 0
          ? `Fan responded with ${bytesReceived} byte(s), then the socket timed out.`
          : (connected
            ? `Connected to ${fan.ip}:${FAN_PORT}, but the fan did not send probe data before the socket timeout.`
            : `Connection to ${fan.ip}:${FAN_PORT} timed out.`),
        latencyMs: Date.now() - startedAt,
        bytesReceived,
        ...getCapabilityDetails(receivedData, fan),
      });
    });

    socket.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      finish({
        ok: connected || bytesReceived > 0,
        state: connected || bytesReceived > 0 ? 'connected' : 'error',
        message: connected || bytesReceived > 0
          ? `Connected to ${fan.ip}:${FAN_PORT}, then the fan closed the diagnostic connection (${error.code || error.message}).`
          : error.message || `Could not connect to ${fan.ip}:${FAN_PORT}.`,
        latencyMs: Date.now() - startedAt,
        bytesReceived,
        errorCode: error.code,
        ...getCapabilityDetails(receivedData, fan),
      });
    });

    socket.on('close', () => {
      clearTimeout(timeout);
      finish({
        ok: connected || bytesReceived > 0,
        state: bytesReceived > 0 ? 'responded' : (connected ? 'connected' : 'error'),
        message: bytesReceived > 0
          ? `Fan responded with ${bytesReceived} byte(s), then closed the socket.`
          : (connected
            ? `Connected to ${fan.ip}:${FAN_PORT}, then the fan closed the diagnostic connection before sending probe data.`
            : `Connection to ${fan.ip}:${FAN_PORT} closed before the fan responded.`),
        latencyMs: Date.now() - startedAt,
        bytesReceived,
        ...getCapabilityDetails(receivedData, fan),
      });
    });
  });
}

function getCapabilityDetails(
  data: Buffer,
  fan: NormalizedFanConfig,
): Pick<ConnectionDiagnostic, 'capabilities' | 'capabilitySummary' | 'capabilityMessage'> {
  const rawCapabilities = parseCapabilitiesFromSlipData(data);
  if (!rawCapabilities) {
    return {
      capabilityMessage: 'Capability details were not reported in this diagnostic response.',
    };
  }

  const capabilities = applyCapabilityConfig(rawCapabilities, fan);
  const capabilitySummary = summarizeCapabilityExposure(rawCapabilities, fan);
  const detected = capabilitySummary.detected.length > 0
    ? capabilitySummary.detected.join(', ')
    : 'none';

  return {
    capabilities,
    capabilitySummary,
    capabilityMessage: `Detected capabilities: ${detected}.`,
  };
}

function frameMessage(payload: number[]) {
  return Buffer.from([START, ...stuff(payload), START]);
}

function stuff(payload: number[]) {
  const out: number[] = [];
  payload.forEach((byte) => {
    if (byte === START) {
      out.push(ESC, START_STUFF);
    } else if (byte === ESC) {
      out.push(ESC, ESC_STUFF);
    } else {
      out.push(byte);
    }
  });
  return out;
}
