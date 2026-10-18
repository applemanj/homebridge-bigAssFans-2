import type { API, PlatformAccessory } from 'homebridge';
import type { BigAssFansAccessoryContext } from '../src/types';
import { AccessoryLayout } from '../src/accessoryLayout';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as net from 'net';
import { mock } from 'node:test';

import { __test__, BigAssFans_i6PlatformAccessory } from '../src/platformAccessory';
import { normalizeDualLightModeControl } from '../src/lighting';
import { parseCapabilitiesFromSlipData, parseMacFromSlipData, suggestCapabilityConfig, summarizeCapabilityExposure } from '../src/protocol';
import { emptyNightLightState, NightLightCoordinator, nightLightCommand, type NightLightState } from '../src/nightlight';

class FakeHapStatusError extends Error {
  constructor(public readonly hapStatus: number) {
    super(`HAP Status Error: ${hapStatus}`);
  }
}

class FakeSocket extends EventEmitter {
  public writes: Buffer[] = [];
  public keepAlive = false;
  public destroyed = false;
  public writable = true;

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

class FakeService {
  public values = new Map<string, unknown>();
  public characteristics = new Set<string>();
  public setters = new Map<string, (value: unknown) => unknown>();

  updateCharacteristic(characteristic: string, value: unknown) {
    this.values.set(characteristic, value);
    return this;
  }

  public name?: string;

  constructor(
    public displayName: string,
    public UUID = displayName,
    public subtype?: string,
  ) {}

  setCharacteristic(characteristic: string, _value: unknown) {
    this.characteristics.add(characteristic);
    if (characteristic === 'Name' || characteristic === 'ConfiguredName') {
      this.name = String(_value);
    }
    return this;
  }

  testCharacteristic(characteristic: string) {
    return this.characteristics.has(characteristic);
  }

  addCharacteristic(characteristic: string) {
    this.characteristics.add(characteristic);
    return this;
  }

  getCharacteristic(characteristic: string) {
    const service = this;
    return {
      sendEventNotification(value: number) {
        service.updateCharacteristic(characteristic, value);
        return this;
      },
      setProps() { return this; },
      onGet() {
        return this;
      },
      onSet(handler: (value: unknown) => unknown) {
        service.setters.set(characteristic, handler);
        return this;
      },
    };
  }
}

class FakeAccessory {
  public services: FakeService[] = [];
  public context: { device: object; whiteLightMemory?: { down?: number; up?: number }; nightLightBrightness?: number } = { device: {} };

  constructor(public displayName = 'Test Fan', public UUID = 'test-fan') {
    this.services.push(new FakeService('AccessoryInformation'));
  }

  getService(service: string | { UUID: string }) {
    if (typeof service === 'string') {
      const normalized = service.toLowerCase();
      return this.services.find((candidate) => [
        candidate.displayName,
        candidate.name,
        candidate.subtype,
        candidate.UUID,
      ].some((value) => String(value || '').toLowerCase() === normalized));
    }

    return this.services.find((candidate) => candidate.UUID === service.UUID);
  }

  getServiceById(service: string | { UUID: string }, subtype: string) {
    const uuid = typeof service === 'string' ? service : service.UUID;
    return this.services.find((candidate) => candidate.UUID === uuid && candidate.subtype === subtype);
  }

  addService(type: string | { UUID: string }, displayName?: string, subtype?: string) {
    if (type instanceof FakeService) {
      this.services.push(type);
      return type;
    }
    const uuid = typeof type === 'string' ? type : type.UUID;
    const service = new FakeService(displayName || uuid, uuid, subtype);
    this.services.push(service);
    return service;
  }

  removeService(service: FakeService) {
    this.services = this.services.filter((existingService) => existingService !== service);
  }

  hasService(service: string | { UUID: string }) {
    return this.getService(service) !== undefined;
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
        notifications: [] as number[],
        getCharacteristic(characteristic: string) {
          return { sendEventNotification: (value: number) => {
            this.notifications.push(value);
            this.updateCharacteristic(characteristic, value);
          } };
        },
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

function createTestServiceState() {
  const logs: string[] = [];
  const updatedAccessories: FakeAccessory[] = [];
  const accessory = new FakeAccessory();
  accessory.addService('OccupancySensor', 'Fan Occupancy', 'occupancySensor-1');
  accessory.addService('OccupancySensor', 'Light Occupancy', 'occupancySensor-2');
  accessory.addService('TemperatureSensor', 'Bedroom Temperature');
  accessory.addService('HumiditySensor', 'Bedroom Humidity');
  accessory.addService('Switch', 'UVC', 'switch-6');
  accessory.addService('Switch', 'Eco Mode', 'switch-5');
  accessory.addService('Lightbulb', 'Bedroom Uplight', 'light-2');

  return {
    accessory,
    state: {
      accessory,
      Name: 'Test Fan',
      MAC: '20:F8:5E:00:00:00',
      noLights: false,
      showFanOccupancySensor: true,
      showLightOccupancySensor: true,
      showTemperature: true,
      showHumidity: true,
      showEcoModeSwitch: true,
      showStandbyLED: false,
      enableIncrementalButtons: false,
      capabilities: {
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
      },
      debugLevels: {
        newcode: 0,
        progress: 0,
      },
      lastDebugMessage: '',
      lastDebugMessageTag: '',
      messagesLogged: new Set<string>(),
      platform: {
        Service: {
          AccessoryInformation: 'AccessoryInformation',
          Fan: 'Fan',
          Fanv2: 'Fanv2',
          Lightbulb: 'Lightbulb',
          Switch: 'Switch',
          OccupancySensor: 'OccupancySensor',
          TemperatureSensor: 'TemperatureSensor',
          HumiditySensor: 'HumiditySensor',
        },
        Characteristic: {
          Manufacturer: 'Manufacturer',
          SerialNumber: 'SerialNumber',
          Name: 'Name',
          ConfiguredName: 'ConfiguredName',
        },
        log: {
          warn: (message: string) => logs.push(message),
          error: (message: string) => logs.push(message),
          info: (message: string) => logs.push(message),
          debug: (message: string) => logs.push(message),
        },
        api: {
          updatePlatformAccessories: (accessories: FakeAccessory[]) => updatedAccessories.push(...accessories),
          // TypeScript can inline Homebridge's const enum. Keep this numeric so
          // normal compilation and type-stripped test runs exercise the same status.
          hap: { HapStatusError: FakeHapStatusError, HAPStatus: { SERVICE_COMMUNICATION_FAILURE: -70402 } },
        },
      },
    },
    logs,
    updatedAccessories,
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
  const message = nightLightCommand({ enabled: true, brightness: 35, preset: 0, red: 128, green: 255, blue: 64 });
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
  assert.equal(socket.writes.length, 2);
  assert.match(socket.writes[1].toString('hex'), /d80201/);

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
  assert.deepEqual(state.fanService.updates.at(-1), { characteristic: 'CurrentFanState', value: 2 });
}

async function testDuplicateFanActiveWriteIsSuppressed() {
  const { state, infos } = createTestAccessoryState();
  const socket = new FakeSocket();
  state.client = socket;
  state.enableDebugPort = true;
  state.fanStates.RotationSpeed = 2;

  await __test__.invokeSetFanActive(state as never, 1);
  await __test__.invokeSetFanActive(state as never, 1);

  assert.equal(socket.writes.length, 2);
  assert.match(infos.at(-1) ?? '', /suppressing duplicate Active=1/i);
}

async function testSettledSpeedNotifications() {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 10000 });
  try {
    const { state } = createTestAccessoryState();
    const socket = new FakeSocket();
    state.client = socket;
    state.fanStates.Active = 1;
    await __test__.invokeSetRotationSpeed(state as never, 50);
    mock.timers.tick(125);
    __test__.fanRotationSpeed('4', state as never);
    mock.timers.tick(1375);
    assert.deepEqual(state.fanService.notifications, [57]);
    const writes = socket.writes.length;
    mock.timers.tick(1000);
    assert.deepEqual(state.fanService.notifications, [57, 57]);
    mock.timers.tick(10000);
    assert.equal(state.fanService.notifications.length, 2, 'Only one repeat is sent');
    assert.equal(socket.writes.length, writes, 'Display notifications must not send fan commands');

    await __test__.invokeSetRotationSpeed(state as never, 40);
    mock.timers.tick(125);
    __test__.fanRotationSpeed('3', state as never);
    mock.timers.tick(1375);
    assert.equal(state.fanService.notifications.at(-1), 43);
    await __test__.invokeSetRotationSpeed(state as never, 70);
    mock.timers.tick(125);
    __test__.fanRotationSpeed('5', state as never);
    const count = state.fanService.notifications.length;
    mock.timers.tick(875);
    assert.equal(state.fanService.notifications.length, count, 'New input cancels the old repeat');
    mock.timers.tick(500);
    assert.equal(state.fanService.notifications.at(-1), 71);
    __test__.fanRotationSpeed('2', state as never);
    const externalCount = state.fanService.notifications.length;
    mock.timers.tick(1000);
    assert.equal(state.fanService.notifications.length, externalCount, 'External changes cancel the repeat');

    await __test__.invokeSetRotationSpeed(state as never, 50);
    mock.timers.tick(125);
    __test__.fanRotationSpeed('4', state as never);
    mock.timers.tick(1375);
    await __test__.invokeSetFanActive(state as never, 0);
    const offCount = state.fanService.notifications.length;
    mock.timers.tick(1000);
    assert.equal(state.fanService.notifications.length, offCount, 'Off cancels the repeat');
  } finally {
    mock.timers.reset();
  }
}

async function testFanSpeedFeedbackAndRestore() {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 10000 });
  try {
    const { state } = createTestAccessoryState();
    const socket = new FakeSocket();
    state.client = socket;
    state.fanStates.Active = 1;
    __test__.fanRotationSpeed('4', state as never);
    await __test__.invokeSetRotationSpeed(state as never, 40);
    mock.timers.tick(125);
    assert.equal(socket.writes.length, 1);
    assert.match(socket.writes[0].toString('hex'), /f00203/);
    assert.equal(state.fanService.updates.filter(u => u.characteristic === 'RotationSpeed').at(-1)?.value, 40);
    __test__.fanRotationSpeed('3', state as never);
    assert.equal(await BigAssFans_i6PlatformAccessory.prototype.getRotationSpeed.call(state as never), 40);
    mock.timers.tick(1374);
    assert.equal(state.fanService.updates.filter(u => u.characteristic === 'RotationSpeed').at(-1)?.value, 40);
    mock.timers.tick(1);
    assert.equal(state.fanService.updates.at(-1)?.value, 43);

    // New slider input restarts the display delay and coalesces hardware writes.
    await __test__.invokeSetRotationSpeed(state as never, 68);
    await __test__.invokeSetRotationSpeed(state as never, 50);
    mock.timers.tick(125);
    assert.match(socket.writes.at(-1)!.toString('hex'), /f00204/);
    __test__.fanRotationSpeed('4', state as never);
    mock.timers.tick(1375);
    assert.equal(state.fanService.updates.at(-1)?.value, 57);

    // A different external value is never hidden behind a two-second ignore window.
    await __test__.invokeSetRotationSpeed(state as never, 70);
    mock.timers.tick(125);
    __test__.fanRotationSpeed('5', state as never);
    __test__.fanRotationSpeed('2', state as never);
    assert.equal(state.fanStates.RotationSpeed, 2);
    assert.equal(state.fanService.updates.filter(u => u.characteristic === 'RotationSpeed').at(-1)?.value, 29);

    // An old Off report does not discard a queued slider command.
    await __test__.invokeSetRotationSpeed(state as never, 40);
    __test__.fanOnState('0', state as never);
    mock.timers.tick(125);
    assert.match(socket.writes.at(-1)!.toString('hex'), /f00203/);
    const writes = socket.writes.length;
    mock.timers.tick(300);
    assert.equal(socket.writes.length, writes + 1, 'Missing speed feedback triggers a readback');
    assert.match(socket.writes.at(-1)!.toString('hex'), /12021a00/);
    __test__.fanRotationSpeed('3', state as never);

    // Explicit Off cancels a pending speed request.
    await __test__.invokeSetRotationSpeed(state as never, 80);
    await __test__.invokeSetFanActive(state as never, 0);
    const offWrites = socket.writes.length;
    mock.timers.tick(2000);
    assert.equal(socket.writes.length, offWrites);

    const persisted = createDualLightTestState();
    persisted.accessory.context = Object.assign(persisted.accessory.context, { fanSpeedMemory: 4 });
    persisted.state.fanService = new FakeService('Fanv2') as never;
    persisted.state.fanStates = { Active: 0, CurrentFanState: 0, TargetFanState: 0, RotationSpeed: 0,
      RotationDirection: 0, homeShieldUp: false };
    await __test__.invokeSetFanActive(persisted.state, 1);
    const persistedSocket = persisted.state.client as unknown as FakeSocket;
    assert.match(persistedSocket.writes[0].toString('hex'), /f00204/, 'Restore works from persisted memory');
    await __test__.invokeSetFanActive(persisted.state, 0);
    await __test__.invokeSetRotationSpeed(persisted.state, 100);
    mock.timers.tick(125);
    assert.match(persistedSocket.writes.at(-1)!.toString('hex'), /f00207/, 'Speed-only maximum from Off remains available');
    await __test__.invokeSetFanActive(persisted.state, 0);

    for (const speedFirst of [true, false]) {
      const fixture = createTestAccessoryState();
      const fan = fixture.state;
      const connection = new FakeSocket();
      fan.client = connection;
      fan.fanStates.Active = 1;
      __test__.fanRotationSpeed('4', fan as never);
      await __test__.invokeSetFanActive(fan as never, 0);
      connection.writes.length = 0;
      if (speedFirst) {
        await __test__.invokeSetRotationSpeed(fan as never, 100);
        await __test__.invokeSetFanActive(fan as never, 1);
      } else {
        await __test__.invokeSetFanActive(fan as never, 1);
        await __test__.invokeSetRotationSpeed(fan as never, 100);
      }
      mock.timers.tick(125);
      assert.ok(connection.writes.every(w => !/f00207/.test(w.toString('hex'))), 'Power-on must not send maximum speed');
      assert.match(connection.writes[0].toString('hex'), /f00204/);
      assert.match(connection.writes[1].toString('hex'), /d80201/);
      __test__.fanRotationSpeed('4', fan as never);
      mock.timers.tick(1500);
      await __test__.invokeSetRotationSpeed(fan as never, 100);
      mock.timers.tick(125);
      assert.match(connection.writes.at(-1)!.toString('hex'), /f00207/, 'Explicit maximum while running must work');
      __test__.fanRotationSpeed('7', fan as never);
      await __test__.invokeSetRotationSpeed(fan as never, 0);
      mock.timers.tick(125);
      assert.match(connection.writes.at(-1)!.toString('hex'), /d80200/, 'Zero means power off, not minimum-speed memory');
      __test__.fanOnState('0', fan as never);
      __test__.fanRotationSpeed('7', fan as never);
      assert.equal(fan.fanStates.Active, 0, 'A retained speed setpoint must not undo manual Off');
      await __test__.invokeSetFanActive(fan as never, 1);
      assert.match(connection.writes.at(-2)!.toString('hex'), /f00207/, 'On restores the last actual nonzero speed');
      await __test__.invokeSetFanActive(fan as never, 0);
    }
  } finally {
    mock.timers.reset();
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

function testAutoLightOverrideNormalizesToAutodetect() {
  assert.equal(__test__.normalizeLightDetectionOverride('auto'), undefined);
  assert.equal(__test__.normalizeLightDetectionOverride(true), true);
  assert.equal(__test__.normalizeLightDetectionOverride(false), false);
  assert.equal(__test__.normalizeLightDetectionOverride(undefined), undefined);
}

function protobufVarintField(field: number, value: number) {
  return Buffer.from([
    ...__test__.varint_encode((field << 3) | 0),
    ...__test__.varint_encode(value),
  ]);
}

function protobufMessageField(field: number, body: Buffer) {
  return Buffer.from([
    ...__test__.varint_encode((field << 3) | 2),
    ...__test__.varint_encode(body.length),
    ...body,
  ]);
}

function testCapabilityParserExtractsLiveCapabilities() {
  const capabilityMessage = Buffer.concat([
    protobufVarintField(6, 1),
    protobufVarintField(7, 1),
    protobufVarintField(14, 1),
  ]);
  const payload = protobufMessageField(2,
    protobufMessageField(4,
      protobufMessageField(2,
        protobufMessageField(17, capabilityMessage),
      ),
    ),
  );
  const data = Buffer.concat([Buffer.from([0xc0]), payload, Buffer.from([0xc0])]);

  const capabilities = parseCapabilitiesFromSlipData(data);

  assert.equal(capabilities?.hasFan, true);
  assert.equal(capabilities?.hasColorTempControl, true);
  assert.equal(capabilities?.hasEcoMode, true);
  assert.equal(capabilities?.hasLight, false);

  const summary = summarizeCapabilityExposure(capabilities!, {
    showEcoModeSwitch: false,
    showHumidity: true,
    showTemperature: true,
  });

  assert.deepEqual(summary.detected, ['fan', 'downlight', 'eco mode']);
  assert.deepEqual(summary.exposed, ['fan', 'downlight']);
  assert.deepEqual(summary.hiddenByConfig, ['eco mode']);
  assert.deepEqual(summary.notReportedButEnabled, ['temperature', 'humidity']);
}

function testMacDiscoveryReadsOnlyFanIdentity() {
  const frame = (properties: Buffer) => Buffer.concat([
    Buffer.from([0xc0]),
    Buffer.from([...protobufMessageField(2, protobufMessageField(4, protobufMessageField(2, properties)))]
      .flatMap(byte => byte === 0xc0 ? [0xdb, 0xdc] : byte === 0xdb ? [0xdb, 0xdd] : [byte])),
    Buffer.from([0xc0]),
  ]);
  const remote = protobufMessageField(152, protobufMessageField(4, Buffer.from('11:22:33:44:55:66')));
  assert.equal(parseMacFromSlipData(frame(remote)), undefined);
  for (const mac of ['aa:bb:cc:dd:ee:ff', 'aa-bb-cc-dd-ee-ff', 'aabbccddeeff']) {
    const bytes = frame(Buffer.concat([remote, protobufMessageField(8, Buffer.from(mac))]));
    assert.equal(parseMacFromSlipData(bytes.subarray(0, bytes.length - 1)), undefined);
    assert.equal(parseMacFromSlipData(bytes), 'AA:BB:CC:DD:EE:FF');
  }
  for (const mac of ['not-a-mac', '00:00:00:00:00:00', 'FF:FF:FF:FF:FF:FF']) {
    assert.equal(parseMacFromSlipData(frame(protobufMessageField(8, Buffer.from(mac)))), undefined);
  }
  const valid = frame(protobufMessageField(8, Buffer.from('AA:BB:CC:DD:EE:FF')));
  assert.equal(parseMacFromSlipData(Buffer.concat([frame(remote), valid])), 'AA:BB:CC:DD:EE:FF');
}

function testCapabilitySuggestionsOnlyHideUnsupportedOptions() {
  const suggestions = suggestCapabilityConfig({
    hasTempSensor: false,
    hasHumiditySensor: false,
    hasOccupancySensor: false,
    hasLight: true,
    hasLightSensor: false,
    hasColorTempControl: true,
    hasFan: true,
    hasSpeaker: false,
    hasPiezo: false,
    hasLEDIndicators: false,
    hasUplight: false,
    hasUVCLight: false,
    hasStandbyLED: false,
    hasEcoMode: false,
  }, {
    showTemperature: true,
    showHumidity: true,
    showFanOccupancySensor: true,
    showEcoModeSwitch: true,
    noLights: true,
  });

  assert.deepEqual(suggestions.map((suggestion) => suggestion.key), [
    'showTemperature',
    'showHumidity',
    'showFanOccupancySensor',
    'showEcoModeSwitch',
  ]);
  assert.deepEqual(suggestions.map((suggestion) => suggestion.value), [false, false, false, false]);
  assert.equal(suggestions.some((suggestion) => suggestion.key === 'noLights'), false);
}

function testUnsupportedCapabilityServicesAreRemovedFromCache() {
  const { accessory, state, updatedAccessories } = createTestServiceState();

  __test__.makeServices(state as never);

  assert.equal(accessory.hasService('occupancySensor-1'), false);
  assert.equal(accessory.hasService('occupancySensor-2'), false);
  assert.equal(accessory.hasService('TemperatureSensor'), false);
  assert.equal(accessory.hasService('HumiditySensor'), false);
  assert.equal(accessory.hasService('switch-6'), false);
  assert.equal(accessory.hasService('switch-5'), false);
  assert.equal(accessory.hasService('light-2'), false);
  assert.equal(updatedAccessories.includes(accessory), true);
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


function createDualLightTestState() {
  const fixture = createTestServiceState();
  const state = Object.assign(Object.create(BigAssFans_i6PlatformAccessory.prototype), fixture.state, {
    client: new FakeSocket(),
    chunkFragment: Buffer.alloc(0),
    funQueue: [],
    whiteLightReport: {},
    lightModeServices: new Map(),
    dualLightModeControl: 'exclusive',
    capabilitiesEstablished: true,
    showEcoModeSwitch: false,
    showStandbyLED: true,
    targetBulb: -1,
    downlightStates: { On: false, Brightness: 1 },
    uplightStates: { On: false, Brightness: 1 },
    standbyLEDStates: { On: false, Brightness: 0, Hue: 0, Saturation: 0 },
  }) as BigAssFans_i6PlatformAccessory;
  state.capabilities.hasLight = true;
  state.capabilities.hasUplight = true;
  state.capabilities.hasColorTempControl = true;
  state.capabilities.hasStandbyLED = true;
  Object.assign(state.platform.Characteristic, {
    On: 'On', Brightness: 'Brightness', ColorTemperature: 'ColorTemperature', Hue: 'Hue', Saturation: 'Saturation',
  });
  return { ...fixture, state };
}

function reportFrame(fields: Array<[number, number]>) {
  const properties = fields.flatMap(([field, value]) => {
    const property = [...__test__.varint_encode(field * 8), ...__test__.varint_encode(value)];
    return [0x12, ...__test__.varint_encode(property.length), ...property];
  });
  const update = [0x22, ...__test__.varint_encode(properties.length), ...properties];
  const root = [0x12, ...__test__.varint_encode(update.length), ...update];
  const escaped = root.flatMap(byte => byte === 0xc0 ? [0xdb, 0xdc] : byte === 0xdb ? [0xdb, 0xdd] : [byte]);
  return Buffer.from([0xc0, ...escaped, 0xc0]);
}

function testCoordinatedServiceLifecycleAndFragmentedReports() {
  const { state, accessory } = createDualLightTestState();
  __test__.makeServices(state);
  assert.ok(accessory.getServiceById('Lightbulb', 'white-light'));
  assert.equal(accessory.getServiceById('Lightbulb', 'light-1'), undefined);
  assert.equal(accessory.getServiceById('Lightbulb', 'light-2'), undefined);
  assert.equal(state.lightModeServices.size, 3);
  assert.ok(accessory.getServiceById('Lightbulb', 'light-3'));
  assert.equal(accessory.getServiceById('Switch', 'switch-7'), undefined);

  // Mode intentionally appears after brightness in the same update.
  const frame = reportFrame([[69, 67], [68, 1], [82, 0], [71, 3008], [78, 2700], [79, 4000]]);
  for (const byte of frame) {
    __test__.onData(state, Buffer.from([byte]));
  }
  assert.equal(state.whiteLight?.ready, true);
  assert.equal(state.whiteLight?.state.selection, 0);
  assert.equal(state.whiteLight?.memory.down, 67);
  assert.equal(accessory.getServiceById('Lightbulb', 'white-light')?.values.get('Brightness'), 67);
  assert.equal(accessory.context.whiteLightMemory?.down, 67);

  __test__.onData(state, Buffer.concat([
    reportFrame([[82, 2], [69, 80], [68, 1]]),
    reportFrame([[82, 1], [69, 25], [68, 1]]),
  ]));
  assert.deepEqual(state.whiteLight?.memory, { down: 25, up: 80 });
  state.dualLightModeControl = 'channels';
  accessory.addService('Lightbulb', 'Both Lights', 'light-4');
  __test__.makeServices(state);
  assert.equal(accessory.getServiceById('Lightbulb', 'light-4'), undefined);
  assert.equal(state.lightModeServices.size, 2);
  assert.equal(accessory.getServiceById('Switch', 'white-mode-0'), undefined);

  state.noLights = true;
  __test__.makeServices(state);
  assert.equal(state.whiteLight, undefined);
  assert.equal(accessory.getServiceById('Lightbulb', 'white-light'), undefined);
  assert.equal(accessory.getServiceById('Lightbulb', 'light-3'), undefined);
}

function testUplightOnlyIsNotMistakenForDualLight() {
  const { state, accessory } = createDualLightTestState();
  state.capabilities.hasLight = false;
  state.capabilities.hasStandbyLED = false;
  __test__.reconcileCapabilities(state, { ...state.capabilities });
  assert.equal(state.capabilities.hasLight, false);
  __test__.makeServices(state);
  assert.equal(state.whiteLight, undefined);
  assert.equal(accessory.getServiceById('Lightbulb', 'white-light'), undefined);
  assert.ok(accessory.getServiceById('Lightbulb', 'light-2'));
  assert.equal(accessory.getServiceById('Lightbulb', 'light-3'), undefined);
}

async function testBothUpSingleSwitchLayout() {
  const { state, accessory } = createDualLightTestState();
  __test__.makeServices(state);
  __test__.onData(state, reportFrame([[82, 1], [68, 1], [69, 25]]));
  __test__.onData(state, reportFrame([[82, 2], [68, 1], [69, 75]]));
  state.dualLightModeControl = 'both-up';
  __test__.makeServices(state);
  assert.equal(state.lightModeServices.size, 1);
  const both = accessory.getServiceById('Switch', 'white-mode-0')!;
  const white = accessory.getServiceById('Lightbulb', 'white-light')!;
  assert.ok(both);
  assert.match(both.name!, /Both Lights$/);
  assert.equal(accessory.getServiceById('Switch', 'white-mode-1'), undefined);
  assert.equal(accessory.getServiceById('Switch', 'white-mode-2'), undefined);

  const light = state.whiteLight!;
  try {
    const on = both.setters.get('On')!(true);
    light.flush();
    await on;
    assert.equal(light.state.selection, 0);
    assert.equal(light.state.brightness, 25);
    assert.equal(both.values.get('On'), true);
    light.report({ ...light.state });

    const dim = white.setters.get('Brightness')!(45);
    light.flush();
    await dim;
    light.report({ ...light.state });
    const up = both.setters.get('On')!(false);
    light.flush();
    await up;
    assert.equal(light.state.selection, 2);
    assert.equal(light.state.brightness, 75);
    assert.equal(light.state.power, 1, 'Turning the mode switch off selects Up, not light power off');
    assert.equal(both.values.get('On'), false);
    light.report({ ...light.state });

    const back = both.setters.get('On')!(true);
    light.flush();
    await back;
    assert.equal(light.state.brightness, 45);
    light.report({ ...light.state });
    const off = white.setters.get('On')!(false);
    light.flush();
    await off;
    assert.equal(light.state.power, 0);
    assert.equal(both.values.get('On'), true, 'Mode is retained when White Light turns off');

    const selectUpWhileOff = both.setters.get('On')!(false);
    light.flush();
    await selectUpWhileOff;
    assert.equal(light.state.power, 0);
    assert.equal(light.state.selection, 2);
    assert.equal(both.values.get('On'), false);
    const selectBothWhileOff = both.setters.get('On')!(true);
    light.flush();
    await selectBothWhileOff;
    assert.equal(light.state.power, 0);
    assert.equal(light.state.selection, 0);
    assert.equal(both.values.get('On'), true);

    const socket = state.client as unknown as FakeSocket;
    const writes = socket.writes.length;
    __test__.onData(state, reportFrame([[82, 2], [68, 1], [69, 60]]));
    assert.equal(both.values.get('On'), false);
    assert.equal(white.values.get('Brightness'), 60);
    assert.equal(socket.writes.length, writes);
    state.dualLightModeControl = 'exclusive';
    __test__.makeServices(state);
    assert.equal(state.lightModeServices.size, 3);
    assert.ok(accessory.getServiceById('Switch', 'white-mode-1'));
    assert.ok(accessory.getServiceById('Switch', 'white-mode-2'));
  } finally {
    light.disconnect();
    state.nightLight?.disconnect();
  }
}

async function testExternalLightReportWinsDuringHomeKitWrite() {
  const { state, accessory } = createDualLightTestState();
  __test__.makeServices(state);
  __test__.onData(state, reportFrame([[82, 1], [68, 1], [69, 25]]));
  const change = state.whiteLight!.setBrightness(60);
  state.whiteLight!.flush();
  await change;
  const socket = state.client as unknown as FakeSocket;
  const writes = socket.writes.length;
  __test__.onData(state, reportFrame([[69, 35]]));
  assert.equal(accessory.getServiceById('Lightbulb', 'white-light')?.values.get('Brightness'), 35);
  assert.equal(accessory.context.whiteLightMemory?.down, 35);
  assert.equal(socket.writes.length, writes, 'Reflecting a BAF change must not send it back to the fan');
  __test__.sendLightStateRefreshRequest(state);
  assert.deepEqual(socket.writes.at(-1), Buffer.from([0xc0, 0x12, 0x04, 0x1a, 0x02, 0x08, 0x02, 0xc0]));
  state.whiteLight!.disconnect();
}

async function testHomeKitAckDoesNotTurnZeroBrightnessBackOn() {
  const { state, accessory } = createDualLightTestState();
  __test__.makeServices(state);
  __test__.onData(state, reportFrame([[82, 1], [68, 1], [69, 25]]));
  const service = accessory.getServiceById('Lightbulb', 'white-light')!;
  const on = Promise.resolve(service.setters.get('On')!(true)).then(() => service.updateCharacteristic('On', true));
  const brightness = Promise.resolve(service.setters.get('Brightness')!(0)).then(() => service.updateCharacteristic('Brightness', 0));
  state.whiteLight!.flush();
  await Promise.all([on, brightness]);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(service.values.get('On'), false);
  state.whiteLight!.disconnect();
}

function testStandbyMessageEnvelope() {
  const message = Buffer.from(nightLightCommand({ enabled: true, brightness: 35, preset: 0, red: 128, green: 255, blue: 64 }));
  // ApiMessage -> Job -> repeated Property -> StandbyLed. There must be no protobuf group delimiters.
  let bytes: Buffer = message;
  for (const expectedKey of [0x12, 0x12, 0x1a, 0x29a]) {
    let key: number;
    let length: number;
    [bytes, key] = __test__.getVarint(bytes);
    assert.equal(key, expectedKey);
    [bytes, length] = __test__.getVarint(bytes);
    assert.equal(bytes.length, length);
  }
  assert.equal(message[0], 0x12);
}

/** Decode the actual socket write and require a complete six-field StandbyLed. */
function decodeNightLightWrite(frame: Buffer) {
  assert.equal(frame[0], 0xc0);
  assert.equal(frame.at(-1), 0xc0);
  let bytes = __test__.unstuff(frame.subarray(1, -1));
  for (const expectedKey of [0x12, 0x12, 0x1a, 0x29a]) {
    let key: number;
    let length: number;
    [bytes, key] = __test__.getVarint(bytes);
    assert.equal(key, expectedKey);
    [bytes, length] = __test__.getVarint(bytes);
    assert.equal(bytes.length, length);
  }
  const fields: Record<number, number> = {};
  while (bytes.length) {
    let key: number;
    let value: number;
    [bytes, key] = __test__.getVarint(bytes);
    [bytes, value] = __test__.getVarint(bytes);
    assert.equal(key & 7, 0);
    fields[key >> 3] = value;
  }
  assert.deepEqual(Object.keys(fields), ['1', '2', '3', '4', '5', '6']);
  return fields;
}

function nightLightReportFrame(fields: Array<[number, number]>) {
  const inner = fields.flatMap(([field, value]) => [...__test__.varint_encode(field * 8), ...__test__.varint_encode(value)]);
  const property = [0x9a, 0x05, ...__test__.varint_encode(inner.length), ...inner];
  const properties = [0x12, ...__test__.varint_encode(property.length), ...property];
  const update = [0x22, ...__test__.varint_encode(properties.length), ...properties];
  const root = [0x12, ...__test__.varint_encode(update.length), ...update];
  const escaped = root.flatMap(byte => byte === 0xc0 ? [0xdb, 0xdc] : byte === 0xdb ? [0xdb, 0xdd] : [byte]);
  return Buffer.from([0xc0, ...escaped, 0xc0]);
}

async function testNightLightControlsPreserveEnableAndIntensity() {
  const { state, accessory } = createDualLightTestState();
  __test__.makeServices(state);
  // BAF enables the red night light at 35%; zero channels are omitted in the report.
  __test__.onData(state, nightLightReportFrame([[1, 1], [2, 1], [3, 35]]));
  const light = state.nightLight!;
  const socket = state.client as unknown as FakeSocket;
  const service = accessory.getServiceById('Lightbulb', 'light-3')!;
  assert.equal(service.values.get('On'), true);
  const writesBeforeColor = socket.writes.length;
  const hue = state.setStandbyLEDHue(240);
  const saturation = state.setStandbyLEDSaturation(100);
  light.flush();
  await Promise.all([hue, saturation]);
  assert.equal(socket.writes.length, writesBeforeColor + 1, 'Hue and saturation should share one command');
  assert.deepEqual(decodeNightLightWrite(socket.writes.at(-1)!), { 1: 0, 2: 1, 3: 35, 4: 0, 5: 0, 6: 255 });

  const intensity = state.setStandbyLEDBrightness(60);
  light.flush();
  await intensity;
  assert.deepEqual(decodeNightLightWrite(socket.writes.at(-1)!), { 1: 0, 2: 1, 3: 60, 4: 0, 5: 0, 6: 255 });
  __test__.onData(state, nightLightReportFrame([[2, 1], [3, 60], [6, 255]]));
  assert.equal(accessory.context.nightLightBrightness, 60);

  const off = state.setStandbyLEDOnState(false);
  light.flush();
  await off;
  assert.deepEqual(decodeNightLightWrite(socket.writes.at(-1)!), { 1: 0, 2: 0, 3: 60, 4: 0, 5: 0, 6: 255 });
  // A disabled report can omit enabled and intensity; both must reset to zero.
  __test__.onData(state, nightLightReportFrame([[6, 255]]));
  assert.equal(service.values.get('On'), false);
  assert.equal(light.state.brightness, 0);
  const on = state.setStandbyLEDOnState(true);
  light.flush();
  await on;
  assert.deepEqual(decodeNightLightWrite(socket.writes.at(-1)!), { 1: 0, 2: 1, 3: 60, 4: 0, 5: 0, 6: 255 });

  // The BAF app changes its preset/enable while a HomeKit command awaits feedback.
  const writes = socket.writes.length;
  __test__.onData(state, nightLightReportFrame([[1, 2], [3, 20]]));
  assert.equal(service.values.get('On'), false);
  assert.equal(service.values.get('Brightness'), 20);
  assert.equal(service.values.get('Hue'), 106);
  assert.equal(socket.writes.length, writes, 'A BAF report must not cause an outgoing command');
  const nextOn = state.setStandbyLEDOnState(true);
  light.flush();
  await nextOn;
  assert.deepEqual(decodeNightLightWrite(socket.writes.at(-1)!), { 1: 2, 2: 1, 3: 20, 4: 0, 5: 0, 6: 0 });
  const scene = [state.setStandbyLEDOnState(false), state.setStandbyLEDBrightness(15),
    state.setStandbyLEDHue(0), state.setStandbyLEDSaturation(50)];
  light.flush();
  await Promise.all(scene);
  assert.deepEqual(decodeNightLightWrite(socket.writes.at(-1)!), { 1: 0, 2: 0, 3: 15, 4: 255, 5: 128, 6: 128 });
  const colorWhileOff = state.setStandbyLEDHue(120);
  light.flush();
  await colorWhileOff;
  assert.equal(decodeNightLightWrite(socket.writes.at(-1)!)[2], 0, 'Color alone must not override Off');
  light.disconnect();
  state.whiteLight!.disconnect();
}

async function testNightLightInitialEnableAndZeroIntensityScene() {
  for (const zeroFirst of [false, true]) {
    const { state, accessory } = createDualLightTestState();
    __test__.makeServices(state);
    const light = state.nightLight!;
    const socket = state.client as unknown as FakeSocket;
    await assert.rejects(state.setStandbyLEDOnState(true), (error: unknown) =>
      error instanceof FakeHapStatusError && error.hapStatus === -70402);
    // Empty StandbyLed is disabled, zero intensity and custom black.
    __test__.onData(state, nightLightReportFrame([]));
    const on = state.setStandbyLEDOnState(true);
    light.flush();
    await on;
    assert.deepEqual(decodeNightLightWrite(socket.writes.at(-1)!), { 1: 7, 2: 1, 3: 25, 4: 255, 5: 255, 6: 255 });
    assert.equal(accessory.context.nightLightBrightness, undefined, 'Do not persist unconfirmed fallback intensity');
    const service = accessory.getServiceById('Lightbulb', 'light-3')!;
    const writes = socket.writes.length;
    const changes: Array<[string, boolean | number]> = [['On', true], ['Brightness', 0]];
    if (zeroFirst) {
      changes.reverse();
    }
    const pending = changes.map(([key, value]) => Promise.resolve(service.setters.get(key)!(value))
      .then(() => service.updateCharacteristic(key, value)));
    light.flush();
    await Promise.all(pending);
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(socket.writes.length, writes + 1);
    const command = decodeNightLightWrite(socket.writes.at(-1)!);
    assert.equal(command[2], 0);
    assert.equal(command[3], 0);
    assert.equal(service.values.get('On'), false, 'HAP acknowledgements must not undo the coordinated Off');
    light.disconnect();
    state.whiteLight!.disconnect();
  }
}

async function testNightLightFeedbackTimeoutAndDisconnect() {
  const commands: NightLightState[] = [];
  const warnings: string[] = [];
  let queries = 0;
  let fail = false;
  const light = new NightLightCoordinator(45, state => {
    if (fail) {
      throw new Error('Socket failed');
    }
    commands.push(state);
  }, () => { queries++; }, () => undefined, message => warnings.push(message));
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    light.report({ ...emptyNightLightState(), preset: 3 });
    const firstOn = light.setPower(true);
    light.flush();
    await firstOn;
    assert.equal(commands[0].brightness, 45, 'Restore confirmed brightness saved before a restart');
    light.report({ ...light.state, brightness: 30 });
    mock.timers.tick(3000);
    assert.equal(queries, 0, 'A fan report cancels readback and timeout');
    assert.equal(warnings.length, 0);

    const brightness = light.setBrightness(70);
    light.flush();
    await brightness;
    mock.timers.tick(250);
    assert.equal(queries, 1);
    mock.timers.tick(2250);
    assert.equal(warnings.length, 1);
    assert.equal(light.state.brightness, 30);
    assert.equal(light.rememberedBrightness, 30);
    assert.equal(commands.length, 2, 'Timeout must not retry a previous command');

    fail = true;
    const failed = assert.rejects(light.setPower(false), /Socket failed/);
    light.flush();
    await failed;
    assert.equal(light.state.enabled, true, 'A failed socket write must not change cached state');
    const disconnected = assert.rejects(light.setBrightness(90), /disconnected/);
    light.disconnect();
    await disconnected;
    mock.timers.tick(3000);
    assert.equal(commands.length, 2);
    assert.equal(queries, 1);
    await assert.rejects(light.setPower(true), /Waiting for the fan/);
  } finally {
    light.disconnect();
    mock.timers.reset();
  }
}

function testSeparateLightAccessories() {
  const { state, accessory } = createDualLightTestState();
  accessory.context.device = { name: 'Test Fan', mac: state.MAC };
  state.capabilities.hasFan = true;
  state.dualLightModeControl = 'channels';
  accessory.addService('Lightbulb', 'Both Lights', 'light-4');
  __test__.makeServices(state);
  assert.equal(accessory.getServiceById('Lightbulb', 'light-4'), undefined);
  const white = state.whiteLightService;
  const fan = state.fanService;
  const coordinator = state.whiteLight;
  const cached = [accessory] as unknown as PlatformAccessory<BigAssFansAccessoryContext>[];
  const registrations: PlatformAccessory[][] = [];
  const removals: PlatformAccessory[][] = [];
  const api = {
    platformAccessory: FakeAccessory,
    hap: { Service: state.platform.Service, Characteristic: state.platform.Characteristic, uuid: { generate: (s: string) => s } },
    registerPlatformAccessories: (_p: string, _n: string, items: PlatformAccessory[]) => registrations.push(items),
    unregisterPlatformAccessories: (_p: string, _n: string, items: PlatformAccessory[]) => removals.push(items),
    updatePlatformAccessories: () => undefined,
  } as unknown as API;
  const layout = new AccessoryLayout(api, cached, 'plugin', 'platform');
  Object.assign(state.platform, { layout });
  __test__.makeServices(state);
  assert.equal(cached.length, 4);
  assert.equal(state.whiteLightService, white, 'Migration reuses the existing service and handlers');
  assert.equal(state.whiteLight, coordinator, 'Tiles share the same coordinator and socket');
  assert.equal(state.fanService, fan);
  assert.equal(accessory.getServiceById('Lightbulb', 'white-light'), undefined);
  assert.equal(accessory.getServiceById('Lightbulb', 'light-3'), undefined);
  const tiles = state.lightTiles;
  assert.equal(tiles.white!.services.filter(s => s.subtype === 'white-light').length, 1);
  assert.equal(tiles.night!.services.filter(s => s.subtype === 'light-3').length, 1);
  assert.equal(tiles.modes!.services.filter(s => s.subtype?.startsWith('white-mode-')).length, 2);
  assert.equal(registrations.flat().length, 3);
  __test__.makeServices(state);
  assert.equal(registrations.flat().length, 3, 'Repeated capability reports must not register duplicates');

  // A restarted platform restores child identities and does not create a handler per child.
  Object.assign(state.platform, { layout: new AccessoryLayout(api, cached, 'plugin', 'platform') });
  state.dualLightModeControl = 'both-up';
  __test__.makeServices(state);
  assert.equal(state.lightTiles.modes, tiles.modes);
  assert.equal(tiles.modes!.services.filter(s => s.subtype?.startsWith('white-mode-')).length, 1);
  assert.equal(registrations.flat().length, 3);
  state.showStandbyLED = false;
  __test__.makeServices(state);
  assert.equal(cached.length, 3);
  assert.equal(removals.flat().length, 1);
  state.noLights = true;
  __test__.makeServices(state);
  assert.equal(cached.length, 1);
  assert.equal(removals.flat().length, 3);
  assert.equal(state.fanService, fan);
  state.noLights = false;
  state.capabilities.hasUplight = false;
  __test__.makeServices(state);
  assert.equal(cached.length, 1, 'Single-light fans stay on their existing accessory');
  assert.ok(accessory.getServiceById('Lightbulb', 'light-1'));
  assert.equal(state.fanService, fan);
}

async function main() {
  testSeparateLightAccessories();
  assert.equal(normalizeDualLightModeControl('legacy'), 'exclusive');
  assert.equal(normalizeDualLightModeControl(undefined), 'exclusive');
  for (const mode of ['exclusive', 'channels', 'both-up', 'legacy']) {
    for (const uplight of [false, true]) {
      const { state, accessory } = createDualLightTestState();
      state.capabilities.hasLight = !uplight;
      state.capabilities.hasUplight = uplight;
      state.capabilities.hasStandbyLED = false;
      state.dualLightModeControl = normalizeDualLightModeControl(mode);
      for (const cached of [...accessory.services]) {
        if (cached.UUID === 'Lightbulb') {
          accessory.removeService(cached);
        }
      }
      const existing = accessory.addService('Lightbulb', uplight ? 'uplight' : 'downlight', uplight ? 'light-2' : 'light-1');
      __test__.makeServices(state);
      assert.equal(state.whiteLight, undefined, 'Single-light fans must retain the existing control path');
      assert.equal(accessory.getServiceById('Lightbulb', 'white-light'), undefined);
      assert.equal(state.lightModeServices.size, 0);
      const service = accessory.getServiceById('Lightbulb', uplight ? 'light-2' : 'light-1');
      assert.ok(service);
      assert.equal(service, existing, 'Single-light fans must preserve their cached service identity');
      assert.ok(service.setters.has('On'));
      assert.ok(service.setters.has('Brightness'));
    }
  }
  {
    const { state, accessory } = createDualLightTestState();
    state.dualLightModeControl = normalizeDualLightModeControl('legacy');
    __test__.makeServices(state);
    assert.ok(accessory.getServiceById('Lightbulb', 'white-light'));
    assert.equal(state.lightModeServices.size, 3);
    state.whiteLight?.disconnect();
    state.nightLight?.disconnect();
  }
  await testBothUpSingleSwitchLayout();
  testMacDiscoveryReadsOnlyFanIdentity();
  await testNightLightControlsPreserveEnableAndIntensity();
  await testNightLightInitialEnableAndZeroIntensityScene();
  await testNightLightFeedbackTimeoutAndDisconnect();
  await testExternalLightReportWinsDuringHomeKitWrite();
  await testHomeKitAckDoesNotTurnZeroBrightnessBackOn();
  testCoordinatedServiceLifecycleAndFragmentedReports();
  testUplightOnlyIsNotMistakenForDualLight();
  testStandbyMessageEnvelope();
  testGetVarintSupportsLargeValues();
  testStandbyLEDColorMessageUsesVarints();
  testMalformedFrameIsDropped();
  testAutoModeStateSync();
  testRotationSpeedPercentAllowsZero();
  testPercentToRotationSpeedClampsNonZeroToMinimum();
  await testFanActiveDiagnosticsAreRecorded();
  await testFanActiveOptimisticallyUpdatesHomeKitState();
  await testDuplicateFanActiveWriteIsSuppressed();
  await testSettledSpeedNotifications();
  await testFanSpeedFeedbackAndRestore();
  testFanUpdatesAreNotBlockedByUnknownTargetBulb();
  testColorTemperatureCapabilityImpliesDownlight();
  testDownlightOverrideWinsOverInference();
  testAutoLightOverrideNormalizesToAutodetect();
  testCapabilityParserExtractsLiveCapabilities();
  testCapabilitySuggestionsOnlyHideUnsupportedOptions();
  testUnsupportedCapabilityServicesAreRemovedFromCache();
  await testReconnectOnClose();
  await testProbeRequestsStateRefresh();
  console.log('Regression tests passed.');
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

