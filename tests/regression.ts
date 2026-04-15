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
      pendingClientWrites: [] as number[][],
      isDrainingClientWrites: false,
      clientWriteDelayTimeout: undefined as ReturnType<typeof setTimeout> | undefined,
      expectedRotationSpeed: undefined as number | undefined,
      expectedRotationSpeedTimestamp: 0,
      EXPECTED_STATE_TIMEOUT_MS: 2000,
      fanAutoSwitchOn: false,
      showFanAutoSwitch: false,
      downlightEquipped: undefined as boolean | undefined,
      uplightEquipped: undefined as boolean | undefined,
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

function testRecentExpectedSpeedIgnoresStaleUpdate() {
  const { state } = createTestAccessoryState();
  const originalDateNow = Date.now;

  state.expectedRotationSpeed = 4;
  state.expectedRotationSpeedTimestamp = 1000;

  try {
    Date.now = () => 1500;

    __test__.fanRotationSpeed('2', state as never);
    assert.equal(state.fanStates.RotationSpeed, 0);
    assert.equal(state.fanService.updates.length, 0);

    __test__.fanRotationSpeed('4', state as never);
    assert.equal(state.fanStates.RotationSpeed, 4);
    assert.equal(state.expectedRotationSpeed, undefined);
    assert.deepEqual(state.fanService.updates.at(-1), { characteristic: 'CurrentFanState', value: 2 });
  } finally {
    Date.now = originalDateNow;
  }
}

async function testManualSpeedChangeExitsAutoMode() {
  const { state } = createTestAccessoryState();
  const socket = new FakeSocket();
  state.client = socket;
  state.fanStates.TargetFanState = 1;
  state.fanStates.Active = 0;
  state.fanStates.CurrentFanState = 0;
  state.fanStates.RotationSpeed = 0;

  __test__.setScheduleTimeoutForTest(((
    callback: (...args: never[]) => void,
    _delay?: number,
    ..._args: never[]
  ) => {
    callback();
    return { ref() { return this; }, unref() { return this; } } as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout);

  try {
    await __test__.invokeSetRotationSpeed(state as never, 57);
  } finally {
    __test__.resetScheduleTimeoutForTest();
  }

  assert.equal(state.fanStates.TargetFanState, 0);
  assert.equal(state.fanStates.Active, 1);
  assert.equal(state.fanStates.CurrentFanState, 2);
  assert.equal(socket.writes.length, 2);
  assert.match(socket.writes[0].toString('hex'), /d80201/);
  assert.match(socket.writes[1].toString('hex'), /f00204/);
}

function testClientWriteQueueSerializesRapidWrites() {
  const { state } = createTestAccessoryState();
  const socket = new FakeSocket();
  state.client = socket;
  const pendingTimers: Array<() => void> = [];

  __test__.setScheduleTimeoutForTest(((
    callback: (...args: never[]) => void,
    _delay?: number,
    ..._args: never[]
  ) => {
    pendingTimers.push(() => callback());
    return { ref() { return this; }, unref() { return this; } } as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout);

  try {
    __test__.invokeClientWrite(socket as unknown as never, [0x12, 0x07, 0x12], state as never);
    __test__.invokeClientWrite(socket as unknown as never, [0x12, 0x08, 0x13], state as never);

    assert.equal(socket.writes.length, 1);
    assert.equal(state.pendingClientWrites.length, 1);

    pendingTimers.shift()?.();

    assert.equal(socket.writes.length, 2);
    assert.equal(state.pendingClientWrites.length, 0);
  } finally {
    __test__.resetPendingClientWrites(state as never);
    __test__.resetScheduleTimeoutForTest();
  }
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

    __test__.setScheduleTimeoutForTest(((
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
    assert.equal(sockets[0].writes.length, 2);

    intervalCallback?.();

    assert.equal(sockets[0].writes.length, 4);
  } finally {
    __test__.resetConnectSocketForTest();
    __test__.resetScheduleTimeoutForTest();
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
  testRecentExpectedSpeedIgnoresStaleUpdate();
  await testManualSpeedChangeExitsAutoMode();
  testClientWriteQueueSerializesRapidWrites();
  testFanUpdatesAreNotBlockedByUnknownTargetBulb();
  testColorTemperatureCapabilityImpliesDownlight();
  testDownlightOverrideWinsOverInference();
  await testReconnectOnClose();
  await testProbeRequestsStateRefresh();
  console.log('Regression tests passed.');
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
