import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as net from 'net';

import { __test__ } from '../src/platformAccessory';

class FakeSocket extends EventEmitter {
  public writes: Buffer[] = [];
  public keepAlive = false;
  public destroyed = false;

  write(buffer: Buffer) {
    this.writes.push(buffer);
    return true;
  }

  setKeepAlive(enabled: boolean) {
    this.keepAlive = enabled;
    return this;
  }

  override removeAllListeners(eventName?: string | symbol): this {
    super.removeAllListeners(eventName);
    return this;
  }

  destroy(_error?: Error) {
    this.destroyed = true;
    return this;
  }
}

function createTestAccessoryState() {
  const warnings: string[] = [];
  const debugs: string[] = [];
  const infos: string[] = [];

  return {
    warnings,
    debugs,
    infos,
    state: {
      ProbeFrequency: 0,
      client: undefined as FakeSocket | undefined,
      IP: '127.0.0.1',
      Name: 'Test Fan',
      chunkFragment: Buffer.alloc(0),
      funQueue: [],
      targetBulb: -1,
      bulbCount: 0,
      capabilitiesEstablished: false,
      uptimeMinutes: 0,
      enableDebugPort: false,
      fanAutoSwitchOn: false,
      showFanAutoSwitch: false,
      downlightEquipped: undefined as boolean | 'auto' | undefined,
      uplightEquipped: undefined as boolean | 'auto' | undefined,
      capabilities: {
        hasTempSensor: false,
        hasHumiditySensor: false,
        hasOccupancySensor: false,
        hasLight: false,
        hasLightSensor: false,
        hasColorTempControl: false,
        hasFan: true,
        hasSpeaker: false,
        hasPiezo: false,
        hasLEDIndicators: false,
        hasUplight: false,
        hasUVCLight: false,
        hasStandbyLED: false,
        hasEcoMode: false,
      },
      fanStates: {
        Active: 0,
        CurrentFanState: 0,
        TargetFanState: 0,
        RotationSpeed: 0,
        RotationDirection: 1,
        homeShieldUp: false,
      },
      debugLevels: {
        characteristics: 0,
        newcode: 0,
        network: 0,
        reconnect: 0,
        progress: 0,
        protoparse: 0,
        light: 0,
        funstack: 0,
        cluing: 0,
        redflags: 0,
      },
      lastDebugMessage: '',
      lastDebugMessageTag: '',
      messagesLogged: new Set<string>(),
      lastRotationSpeedRequestAt: 0,
      lastRotationSpeedRequestPercent: undefined as number | undefined,
      lastRotationSpeedRequestDeviceSpeed: undefined as number | undefined,
      lastFanActiveRequestAt: 0,
      lastFanActiveRequestValue: undefined as number | undefined,
      lastFanActiveWriteAt: 0,
      lastFanActiveWriteValue: undefined as number | undefined,
      pendingRotationSpeedWrite: undefined as Buffer | undefined,
      pendingRotationSpeedWriteTimeout: undefined as ReturnType<typeof setTimeout> | undefined,
      pendingRotationSpeedRequestPercent: undefined as number | undefined,
      pendingRotationSpeedRequestDeviceSpeed: undefined as number | undefined,
      expectedRotationSpeed: undefined as number | undefined,
      ignoreUnexpectedRotationSpeedUntil: 0,
      platform: {
        Characteristic: {
          Active: 'Active',
          CurrentFanState: 'CurrentFanState',
          RotationSpeed: 'RotationSpeed',
          TargetFanState: 'TargetFanState',
          On: 'On',
        },
        log: {
          warn: (message: string) => warnings.push(message),
          error: (_message: string) => undefined,
          info: (message: string) => infos.push(message),
          debug: (message: string) => debugs.push(message),
        },
      },
      fanService: {
        updates: [] as Array<{ characteristic: string; value: number }>,
        updateCharacteristic(characteristic: string, value: number) {
          this.updates.push({ characteristic, value });
        },
      },
      fanAutoSwitchService: {
        updates: [] as Array<{ characteristic: string; value: boolean }>,
        updateCharacteristic(characteristic: string, value: boolean) {
          this.updates.push({ characteristic, value });
        },
      },
    },
  };
}

async function withImmediateTimeouts<T>(fn: () => Promise<T> | T): Promise<T> {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const callbacks: Array<() => void> = [];
  global.setTimeout = (((
    callback: (...args: never[]) => void,
    _delay?: number,
    ..._args: never[]
  ) => {
    const handle = { ref() { return this; }, unref() { return this; } } as ReturnType<typeof setTimeout>;
    callbacks.push(() => callback());
    return handle;
  }) as unknown as typeof setTimeout);
  global.clearTimeout = (((_handle?: ReturnType<typeof setTimeout>) => undefined) as unknown as typeof clearTimeout);

  try {
    const result = await fn();
    while (callbacks.length > 0) {
      callbacks.shift()?.();
    }
    return result;
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
}

function testGetVarintSupportsLargeValues() {
  const encoded = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x7f]);
  const [rest, value] = __test__.getVarint(encoded);
  assert.equal(rest.length, 0);
  assert.equal(value, 34359738367);
}

function testStandbyLEDColorMessageUsesVarints() {
  const message = __test__.buildStandbyLEDColorMessage(128, 255, 64);
  const hex = Buffer.from(message).toString('hex');
  assert.match(hex, /208001/);
  assert.match(hex, /28ff01/);
  assert.match(hex, /3040/);
}

function testMalformedFrameIsDropped() {
  const { state, warnings } = createTestAccessoryState();
  const malformed = Buffer.from([0xc0, 0x12, 0x05, 0xc0]);

  assert.doesNotThrow(() => {
    __test__.onData(state as never, malformed);
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /dropped malformed protobuf frame/i);
}

function testAutoModeStateSync() {
  const { state } = createTestAccessoryState();

  __test__.fanOnState('2', state as never);
  assert.equal(state.fanStates.TargetFanState, 1);
  assert.equal(state.fanStates.Active, 0);
  assert.equal(state.fanStates.CurrentFanState, 0);

  __test__.fanRotationSpeed('3', state as never);
  assert.equal(state.fanStates.Active, 1);
  assert.equal(state.fanStates.CurrentFanState, 2);

  __test__.fanRotationSpeed('0', state as never);
  assert.equal(state.fanStates.RotationSpeed, 0);
  assert.equal(state.fanStates.Active, 0);
  assert.equal(state.fanStates.CurrentFanState, 0);
  assert.deepEqual(state.fanService.updates.at(-3), { characteristic: 'RotationSpeed', value: 0 });
}

function testRotationSpeedPercentAllowsZero() {
  assert.equal(__test__.rotationSpeedPercent(0), 0);
  assert.equal(__test__.rotationSpeedPercent(1), 14);
}

function testPercentToRotationSpeedClampsNonZeroToMinimum() {
  assert.equal(__test__.percentToRotationSpeed(0), 0);
  assert.equal(__test__.percentToRotationSpeed(1), 1);
  assert.equal(__test__.percentToRotationSpeed(5), 1);
  assert.equal(__test__.percentToRotationSpeed(43), 3);
}

async function testFanActiveDiagnosticsAreRecorded() {
  const { state, infos } = createTestAccessoryState();
  const socket = new FakeSocket();
  state.client = socket;
  state.enableDebugPort = true;

  await __test__.invokeSetFanActive(state as never, 1);

  assert.equal(state.lastFanActiveRequestValue, 1);
  assert.notEqual(state.lastFanActiveRequestAt, 0);
  assert.match(infos.at(-1) ?? '', /active diagnostics: HomeKit requested Active=1/i);
  assert.equal(socket.writes.length, 1);
  assert.match(socket.writes[0].toString('hex'), /d80201/);

  __test__.fanOnState('1', state as never);

  assert.equal(state.lastFanActiveRequestAt, 0);
  assert.equal(state.lastFanActiveRequestValue, undefined);
  assert.match(infos.at(-1) ?? '', /active diagnostics: fan reported FanOn=1 -> Active=1/i);
}

async function testFanActiveOptimisticallyUpdatesHomeKitState() {
  const { state } = createTestAccessoryState();
  const socket = new FakeSocket();
  state.client = socket;
  state.fanStates.RotationSpeed = 0;

  await __test__.invokeSetFanActive(state as never, 1);

  assert.deepEqual(state.fanService.updates.at(-2), { characteristic: 'Active', value: 1 });
  assert.deepEqual(state.fanService.updates.at(-1), { characteristic: 'CurrentFanState', value: 1 });
}

async function testDuplicateFanActiveWriteIsSuppressed() {
  const { state, infos } = createTestAccessoryState();
  const socket = new FakeSocket();
  state.client = socket;
  state.enableDebugPort = true;
  state.fanStates.RotationSpeed = 2;

  await __test__.invokeSetFanActive(state as never, 1);
  await __test__.invokeSetFanActive(state as never, 1);

  assert.equal(socket.writes.length, 1);
  assert.match(infos.at(-1) ?? '', /suppressing duplicate Active=1/i);
}

async function testRotationSpeedDiagnosticsAreRecorded() {
  const { state, infos } = createTestAccessoryState();
  const socket = new FakeSocket();
  state.client = socket;
  state.enableDebugPort = true;

  await withImmediateTimeouts(async () => {
    await __test__.invokeSetRotationSpeed(state as never, 57);
  });

  assert.equal(state.lastRotationSpeedRequestPercent, 57);
  assert.equal(state.lastRotationSpeedRequestDeviceSpeed, 4);
  assert.notEqual(state.lastRotationSpeedRequestAt, 0);
  assert.match(infos.at(-1) ?? '', /HomeKit requested 57% -> device speed 4/i);

  __test__.fanRotationSpeed('4', state as never);

  assert.equal(state.lastRotationSpeedRequestAt, 0);
  assert.match(infos.at(-1) ?? '', /fan reported 4 \(57%\)/i);
}

async function testRotationSpeedOptimisticallySnapsHomeKitState() {
  const { state } = createTestAccessoryState();
  const socket = new FakeSocket();
  state.client = socket;
  state.fanStates.Active = 0;
  state.fanStates.CurrentFanState = 0;

  await withImmediateTimeouts(async () => {
    await __test__.invokeSetRotationSpeed(state as never, 69);
  });

  assert.deepEqual(state.fanService.updates.at(-3), { characteristic: 'RotationSpeed', value: 71 });
  assert.deepEqual(state.fanService.updates.at(-2), { characteristic: 'Active', value: 1 });
  assert.deepEqual(state.fanService.updates.at(-1), { characteristic: 'CurrentFanState', value: 2 });
}

async function testRotationSpeedChangeSendsSingleWrite() {
  const { state } = createTestAccessoryState();
  const socket = new FakeSocket();
  state.client = socket;
  state.fanStates.TargetFanState = 1;
  state.fanStates.Active = 0;
  state.fanStates.CurrentFanState = 0;
  state.fanStates.RotationSpeed = 0;

  await withImmediateTimeouts(async () => {
    await __test__.invokeSetRotationSpeed(state as never, 57);
  });

  assert.equal(state.fanStates.TargetFanState, 1);
  assert.equal(socket.writes.length, 1);
  assert.match(socket.writes[0].toString('hex'), /f00204/);
}

async function testRotationSpeedIgnoresBriefStaleEchoes() {
  const { state, infos } = createTestAccessoryState();
  const socket = new FakeSocket();
  state.client = socket;
  state.enableDebugPort = true;

  await withImmediateTimeouts(async () => {
    await __test__.invokeSetRotationSpeed(state as never, 35);
  });

  __test__.fanRotationSpeed('3', state as never);
  assert.equal(state.fanStates.RotationSpeed, 2);
  assert.match(infos.at(-1) ?? '', /ignoring fan report 3/i);

  __test__.fanRotationSpeed('2', state as never);
  assert.equal(state.fanStates.RotationSpeed, 2);
  assert.equal(state.expectedRotationSpeed, undefined);
}

async function testRotationSpeedDragBurstOnlyWritesFinalSpeed() {
  const { state } = createTestAccessoryState();
  const socket = new FakeSocket();
  state.client = socket;

  const originalSetTimeout = global.setTimeout;
  let timeoutCallback: (() => void) | undefined;
  global.setTimeout = (((
    callback: (...args: never[]) => void,
    _delay?: number,
    ..._args: never[]
  ) => {
    timeoutCallback = () => callback();
    return { ref() { return this; }, unref() { return this; } } as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout);

  try {
    await __test__.invokeSetRotationSpeed(state as never, 68);
    await __test__.invokeSetRotationSpeed(state as never, 43);

    assert.equal(socket.writes.length, 0);
    timeoutCallback?.();

    assert.equal(socket.writes.length, 1);
    assert.match(socket.writes[0].toString('hex'), /f00203/);
    assert.deepEqual(state.fanService.updates.at(-3), { characteristic: 'RotationSpeed', value: 43 });
  } finally {
    global.setTimeout = originalSetTimeout;
  }
}

async function testLowNonZeroRotationSpeedMapsToSpeedOne() {
  const { state } = createTestAccessoryState();
  const socket = new FakeSocket();
  state.client = socket;

  await withImmediateTimeouts(async () => {
    await __test__.invokeSetRotationSpeed(state as never, 1);
  });

  assert.equal(state.lastRotationSpeedRequestDeviceSpeed, 1);
  assert.match(socket.writes[0].toString('hex'), /f00201/);
  assert.deepEqual(state.fanService.updates.at(-3), { characteristic: 'RotationSpeed', value: 14 });
}

async function testMatchingFanReportDuringDebounceIsAccepted() {
  const { state, infos } = createTestAccessoryState();
  const socket = new FakeSocket();
  state.client = socket;
  state.enableDebugPort = true;

  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let timeoutCallback: (() => void) | undefined;
  global.setTimeout = (((
    callback: (...args: never[]) => void,
    _delay?: number,
    ..._args: never[]
  ) => {
    timeoutHandle = { ref() { return this; }, unref() { return this; } } as ReturnType<typeof setTimeout>;
    timeoutCallback = () => callback();
    return timeoutHandle;
  }) as unknown as typeof setTimeout);
  global.clearTimeout = (((handle?: ReturnType<typeof setTimeout>) => {
    if (handle === timeoutHandle) {
      timeoutCallback = undefined;
    }
  }) as unknown as typeof clearTimeout);

  try {
    await __test__.invokeSetRotationSpeed(state as never, 1);
    __test__.fanRotationSpeed('1', state as never);

    assert.equal(timeoutCallback, undefined);
    assert.equal(socket.writes.length, 0);
    assert.equal(state.fanStates.RotationSpeed, 1);
    assert.equal(state.lastRotationSpeedRequestAt, 0);
    assert.doesNotMatch(infos.join('\n'), /ignoring fan report 1/i);
    assert.match(infos.at(-1) ?? '', /fan reported 1 \(14%\)/i);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
}

async function testFanOffClearsPendingSpeedDiagnostics() {
  const { state, infos } = createTestAccessoryState();
  const socket = new FakeSocket();
  state.client = socket;

  await withImmediateTimeouts(async () => {
    await __test__.invokeSetRotationSpeed(state as never, 31);
  });

  assert.notEqual(state.lastRotationSpeedRequestAt, 0);

  __test__.fanOnState('0', state as never);

  assert.equal(state.lastRotationSpeedRequestAt, 0);
  assert.equal(state.lastRotationSpeedRequestPercent, undefined);
  assert.equal(state.lastRotationSpeedRequestDeviceSpeed, undefined);
  assert.equal(state.expectedRotationSpeed, undefined);

  __test__.fanRotationSpeed('0', state as never);
  assert.doesNotMatch(infos.at(-1) ?? '', /8161ms after HomeKit requested/i);
}

function testFanUpdatesAreNotBlockedByUnknownTargetBulb() {
  const { state } = createTestAccessoryState();
  state.capabilitiesEstablished = true;
  state.targetBulb = -1;
  state.bulbCount = 0;

  __test__.flushFunQueue(state as never, [
    [__test__.fanOnState, '1'],
    [__test__.fanRotationSpeed, '3'],
  ] as never);

  assert.equal(state.fanStates.Active, 1);
  assert.equal(state.fanStates.CurrentFanState, 2);
  assert.equal(state.fanStates.RotationSpeed, 3);
  assert.equal(state.funQueue.length, 0);
}

function testColorTemperatureCapabilityImpliesDownlight() {
  const { state, infos } = createTestAccessoryState();
  state.capabilities.hasFan = false;
  state.capabilities.hasColorTempControl = true;
  const previousCapabilities = { ...state.capabilities };

  const changed = __test__.reconcileCapabilities(state as never, previousCapabilities as never);

  assert.equal(changed, true);
  assert.equal(state.capabilities.hasLight, true);
  assert.match(infos[0], /inferring downlight presence from color temperature capability/i);
}

function testDownlightOverrideWinsOverInference() {
  const { state, infos } = createTestAccessoryState();
  state.capabilities.hasColorTempControl = true;
  state.downlightEquipped = false;
  const previousCapabilities = { ...state.capabilities };

  const changed = __test__.reconcileCapabilities(state as never, previousCapabilities as never);

  assert.equal(changed, false);
  assert.equal(state.capabilities.hasLight, false);
  assert.equal(infos.length, 0);
}

function testAutoLightOverrideNormalizesToAutodetect() {
  assert.equal(__test__.normalizeLightDetectionOverride('auto'), undefined);
  assert.equal(__test__.normalizeLightDetectionOverride(true), true);
  assert.equal(__test__.normalizeLightDetectionOverride(false), false);
  assert.equal(__test__.normalizeLightDetectionOverride(undefined), undefined);
}

async function testReconnectOnClose() {
  const { state } = createTestAccessoryState();
  const originalSetTimeout = global.setTimeout;
  const sockets: FakeSocket[] = [];
  const pendingConnectListeners: Array<() => void> = [];

  try {
    __test__.setConnectSocketForTest(((_: net.NetConnectOpts, listener?: () => void) => {
      const socket = new FakeSocket();
      sockets.push(socket);
      if (listener) {
        pendingConnectListeners.push(listener);
      }
      return socket as unknown as net.Socket;
    }) as typeof net.connect);

    global.setTimeout = (((
      callback: (...args: never[]) => void,
      _delay?: number,
      ..._args: never[]
    ) => {
      callback();
      return { ref() { return this; }, unref() { return this; } } as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout);

    __test__.networkSetup(state as never);
    pendingConnectListeners.shift()?.();
    assert.equal(sockets.length, 1);

    sockets[0].emit('close');
    pendingConnectListeners.shift()?.();

    assert.equal(sockets.length, 2);
    assert.equal(sockets[0].destroyed, true);
    assert.equal(state.client, sockets[1]);
  } finally {
    __test__.resetConnectSocketForTest();
    global.setTimeout = originalSetTimeout;
  }
}

async function testProbeRequestsStateRefresh() {
  const { state } = createTestAccessoryState();
  state.ProbeFrequency = 60000;

  const originalSetTimeout = global.setTimeout;
  const originalSetInterval = global.setInterval;
  const sockets: FakeSocket[] = [];
  const pendingConnectListeners: Array<() => void> = [];
  let intervalCallback: (() => void) | undefined;

  try {
    __test__.setConnectSocketForTest(((_: net.NetConnectOpts, listener?: () => void) => {
      const socket = new FakeSocket();
      sockets.push(socket);
      if (listener) {
        pendingConnectListeners.push(listener);
      }
      return socket as unknown as net.Socket;
    }) as typeof net.connect);

    global.setTimeout = (((
      callback: (...args: never[]) => void,
      _delay?: number,
      ..._args: never[]
    ) => {
      callback();
      return { ref() { return this; }, unref() { return this; } } as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout);

    global.setInterval = (((
      callback: (...args: never[]) => void,
      _delay?: number,
      ..._args: never[]
    ) => {
      intervalCallback = () => callback();
      return { ref() { return this; }, unref() { return this; } } as ReturnType<typeof setInterval>;
    }) as unknown as typeof setInterval);

    __test__.networkSetup(state as never);
    pendingConnectListeners.shift()?.();
    assert.equal(sockets.length, 1);
    assert.equal(sockets[0].writes.length, 2);

    intervalCallback?.();

    assert.equal(sockets[0].writes.length, 4);
  } finally {
    __test__.resetConnectSocketForTest();
    global.setTimeout = originalSetTimeout;
    global.setInterval = originalSetInterval;
  }
}

async function main() {
  testGetVarintSupportsLargeValues();
  testStandbyLEDColorMessageUsesVarints();
  testMalformedFrameIsDropped();
  testAutoModeStateSync();
  testRotationSpeedPercentAllowsZero();
  testPercentToRotationSpeedClampsNonZeroToMinimum();
  await testFanActiveDiagnosticsAreRecorded();
  await testFanActiveOptimisticallyUpdatesHomeKitState();
  await testDuplicateFanActiveWriteIsSuppressed();
  await testRotationSpeedDiagnosticsAreRecorded();
  await testRotationSpeedOptimisticallySnapsHomeKitState();
  await testRotationSpeedChangeSendsSingleWrite();
  await testRotationSpeedIgnoresBriefStaleEchoes();
  await testRotationSpeedDragBurstOnlyWritesFinalSpeed();
  await testLowNonZeroRotationSpeedMapsToSpeedOne();
  await testMatchingFanReportDuringDebounceIsAccepted();
  await testFanOffClearsPendingSpeedDiagnostics();
  testFanUpdatesAreNotBlockedByUnknownTargetBulb();
  testColorTemperatureCapabilityImpliesDownlight();
  testDownlightOverrideWinsOverInference();
  testAutoLightOverrideNormalizesToAutodetect();
  await testReconnectOnClose();
  await testProbeRequestsStateRefresh();
  console.log('Regression tests passed.');
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
