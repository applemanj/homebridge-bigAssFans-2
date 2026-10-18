import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { DualLightCoordinator, lightCommand, rgbToHueSaturation, type LightCommand, type WhiteLightState } from '../src/lighting';

function harness(memory = { down: 25, up: 75 }) {
  const commands: LightCommand[][] = [];
  const warnings: string[] = [];
  let refreshes = 0;
  let fail = false;
  const light = new DualLightCoordinator(memory, batch => {
    if (fail) {
      throw new Error('Disconnected');
    }
    commands.push(batch);
  }, () => { refreshes++; }, () => undefined, message => warnings.push(message));
  light.report({ selection: 1, power: 1, brightness: 25, kelvin: 3000, minKelvin: 2700, maxKelvin: 4000 });
  return { light, commands, warnings, get refreshes() { return refreshes; }, fail: () => { fail = true; } };
}

async function apply(light: DualLightCoordinator, changes: Promise<void>[], actual?: Partial<WhiteLightState>) {
  light.flush();
  await Promise.all(changes);
  light.report({ ...light.view, ...actual });
}

async function main() {
  // Mode switches describe selection even at zero brightness, independently of power.
  for (const power of [0, 1, 2] as const) {
    for (const selection of [0, 1, 2] as const) {
      for (const channel of [1, 2] as const) {
        for (const on of [false, true]) {
          const modes = harness();
          modes.light.report({ selection, power, brightness: power === 0 ? 0 : 25 });
          assert.equal(modes.light.channelOn(1), selection === 0 || selection === 1);
          assert.equal(modes.light.channelOn(2), selection === 0 || selection === 2);
          const expected = on ? (selection === 0 || selection !== channel ? 0 : channel)
            : selection === 0 || selection === channel ? (channel === 1 ? 2 : 1) : selection;
          await apply(modes.light, [modes.light.setChannel(channel, on)]);
          assert.equal(modes.light.state.selection, expected);
          assert.equal(modes.light.state.power, power);
          assert.ok(modes.light.channelOn(1) || modes.light.channelOn(2));
          if (power === 0) {
            assert.ok(modes.commands.flat().every(command => command.field !== 69));
            assert.ok(modes.commands.flat().filter(command => command.field === 68).every(command => command.value === 0));
          }
          modes.light.disconnect();
        }
      }
    }
  }
  const offMode = harness();
  await apply(offMode.light, [offMode.light.setBrightness(0)], { power: 0, brightness: 0 });
  assert.equal(offMode.light.channelOn(1), true);
  await apply(offMode.light, [offMode.light.select(2, true)], { power: 0, brightness: 25 });
  assert.deepEqual(offMode.commands.at(-1), [{ field: 82, value: 2 }, { field: 68, value: 0 }]);
  assert.equal(offMode.light.memory.up, 75, 'An off-state report must not overwrite Up memory with Down brightness');
  await apply(offMode.light, [offMode.light.setPower(true)]);
  assert.equal(offMode.light.state.brightness, 75);
  assert.equal(offMode.light.state.selection, 2);
  offMode.light.disconnect();

  const { light, commands } = harness();
  await apply(light, [light.select(2, true)]);
  assert.equal(light.state.brightness, 75);
  assert.deepEqual(commands.at(-1), [{ field: 82, value: 2 }, { field: 69, value: 75 }, { field: 68, value: 1 }]);
  await apply(light, [light.setBrightness(60)]);
  await apply(light, [light.select(1, true)]);
  assert.equal(light.state.brightness, 25);
  await apply(light, [light.select(0, true)]);
  assert.equal(light.state.brightness, 25);
  await apply(light, [light.setBrightness(45)]);
  assert.deepEqual(light.memory, { down: 45, up: 60 });
  await apply(light, [light.select(2, true)]);
  assert.equal(light.state.brightness, 60);
  await apply(light, [light.select(0, true)]);
  assert.equal(light.state.brightness, 45);

  // The original issue: Both 67%, turning Up off must select Down and keep the light on.
  light.report({ selection: 0, power: 1, brightness: 67 });
  await apply(light, [light.setChannel(2, false)]);
  assert.equal(light.state.selection, 1);
  assert.equal(light.state.power, 1);
  assert.equal(light.state.brightness, 67);
  assert.equal(light.channelOn(1), true);
  assert.equal(light.channelOn(2), false);
  await apply(light, [light.setChannel(1, false)]);
  assert.equal(light.state.power, 1);
  assert.equal(light.state.selection, 2);
  assert.equal(light.channelOn(1), false);
  await apply(light, [light.setChannel(2, true)]);
  assert.equal(light.state.brightness, 60);
  await apply(light, [light.setChannel(1, true)]);
  assert.equal(light.state.selection, 0);
  assert.equal(light.state.brightness, 67);

  // Scene order must not reset an explicit brightness when the mode arrives later.
  await apply(light, [light.setBrightness(33), light.select(2, true)]);
  assert.equal(light.state.brightness, 33);
  await apply(light, [light.select(1, true), light.setBrightness(44)]);
  assert.equal(light.state.brightness, 44);
  // This is a settled level, not a slider gesture ending in Off.
  await new Promise(resolve => setTimeout(resolve, 1250));
  await apply(light, [light.select(1, false)]);
  assert.equal(light.state.selection, 1);
  await apply(light, [light.setPower(false)]);
  assert.equal(light.state.selection, 1);
  assert.equal(light.state.power, 0);
  await apply(light, [light.setPower(true)]);
  assert.equal(light.state.brightness, 44);

  // App/remote snapshots replace HomeKit state; a selector-only report must not overwrite brightness memory.
  light.report({ selection: 2 });
  assert.equal(light.channelOn(1), false, 'A selector-only report immediately clears Down');
  assert.equal(light.channelOn(2), true);
  assert.equal(light.memory.up, 33);
  light.report({ brightness: 80, power: 1 });
  assert.equal(light.state.selection, 2);
  assert.equal(light.memory.up, 80);
  light.report({ selection: 1, brightness: 22, power: 1 });
  assert.equal(light.memory.down, 22);
  await apply(light, [light.setBrightness(0)], { brightness: 22, power: 0 });
  assert.equal(light.memory.down, 22);
  await apply(light, [light.setPower(true)]);
  assert.equal(light.state.brightness, 22);

  // General HomeKit temperature, bounds, firmware rounding, and correct Kelvin protobuf encoding.
  await apply(light, [light.setTemperature(286)], { kelvin: 3500 });
  assert.equal(light.state.kelvin, 3500);
  assert.equal(commands.at(-1)?.[0].value, Math.round(1000000 / 286));
  await apply(light, [light.setTemperature(100)]);
  assert.equal(light.state.kelvin, 4000);
  assert.deepEqual(lightCommand(82, 2), [0x12, 7, 0x12, 5, 0x1a, 3, 0x90, 5, 2]);
  assert.deepEqual(lightCommand(71, 3000), [0x12, 8, 0x12, 6, 0x1a, 4, 0xb8, 4, 0xb8, 0x17]);
  assert.deepEqual(rgbToHueSaturation(255, 0, 0), [0, 100]);
  assert.deepEqual(rgbToHueSaturation(0, 255, 0), [120, 100]);
  assert.deepEqual(rgbToHueSaturation(0, 0, 255), [240, 100]);

  // Memory persists per accessory; a restart waits for actual state before accepting commands.
  const saved = { ...light.persistedMemory };
  light.disconnect();
  const restored = new DualLightCoordinator(saved, () => undefined, () => undefined, () => undefined, () => undefined);
  assert.deepEqual(restored.memory, saved);
  await assert.rejects(restored.select(2, true), /Waiting/);
  restored.report({ selection: 1, power: 0, brightness: saved.down! });
  await apply(restored, [restored.select(2, true)]);
  assert.equal(restored.state.brightness, saved.up);
  restored.disconnect();

  // Writes fail without optimistic memory changes; disconnect cancels queued writes.
  const failure = harness();
  failure.fail();
  const rejected = assert.rejects(failure.light.select(2, true), /Disconnected/);
  failure.light.flush();
  await rejected;
  assert.equal(failure.light.state.selection, 1);
  assert.deepEqual(failure.light.persistedMemory, { down: 25, up: 75 });
  const cancelled = assert.rejects(failure.light.select(2, true), /disconnected/);
  failure.light.disconnect();
  await cancelled;

  // Partial feedback must not replay cached properties over a pending request.
  const partial = harness();
  partial.light.report({ selection: 2, power: 1, brightness: 75 });
  const both = partial.light.setChannel(1, true);
  partial.light.flush();
  await both;
  partial.light.report({ power: 1 });
  assert.equal(partial.light.channelOn(1), true, 'Power-only feedback must not restore cached Up mode');
  assert.equal(partial.light.view.brightness, 25, 'Power-only feedback must not restore cached Up brightness');
  partial.light.report({ selection: 0 });
  assert.equal(partial.light.view.brightness, 25);
  partial.light.report({ brightness: 25 });
  assert.deepEqual(partial.light.memory, { down: 25, up: 75 });
  const dim = partial.light.setBrightness(60);
  partial.light.flush();
  await dim;
  partial.light.report({ kelvin: 3000 });
  partial.light.report({ power: 1 });
  assert.equal(partial.light.view.brightness, 60, 'Unrelated reports must not undo a brightness write');
  partial.light.report({ brightness: 60 });
  assert.equal(partial.light.memory.down, 60);
  partial.light.disconnect();

  // All property orders must converge without another query or corrupted memory.
  for (const fields of [
    ['selection', 'brightness', 'power'], ['selection', 'power', 'brightness'],
    ['brightness', 'selection', 'power'], ['brightness', 'power', 'selection'],
    ['power', 'selection', 'brightness'], ['power', 'brightness', 'selection'],
  ]) {
    const ordered = harness();
    ordered.light.report({ selection: 2, power: 1, brightness: 75 });
    const request = ordered.light.setChannel(1, true);
    ordered.light.flush();
    await request;
    const response = { selection: 0, brightness: 25, power: 1 };
    for (const field of fields) {
      ordered.light.report({ [field]: response[field as keyof typeof response] });
      assert.equal(ordered.light.channelOn(1), true);
      assert.equal(ordered.light.view.brightness, 25);
    }
    assert.deepEqual(ordered.light.persistedMemory, { down: 25, up: 75 });
    ordered.light.disconnect();
  }

  // Both-only is a HomeKit command policy, not a feedback rewrite loop.
  const fixed = harness();
  fixed.light.bothOnly = true;
  fixed.light.report({ selection: 2, power: 1, brightness: 75 });
  assert.equal(fixed.commands.length, 0, 'Configuration and external reports do not write a mode');
  await apply(fixed.light, [fixed.light.setPower(true)]);
  assert.deepEqual(fixed.commands.at(-1), [
    { field: 82, value: 0 }, { field: 69, value: 25 }, { field: 68, value: 1 },
  ]);
  await apply(fixed.light, [fixed.light.setBrightness(60)]);
  assert.deepEqual(fixed.commands.at(-1), [{ field: 82, value: 0 }, { field: 69, value: 60 }]);
  await apply(fixed.light, [fixed.light.setBrightness(0)], { power: 0 });
  assert.deepEqual(fixed.commands.at(-1), [{ field: 82, value: 0 }, { field: 68, value: 0 }]);
  await apply(fixed.light, [fixed.light.setPower(true)]);
  assert.equal(fixed.light.state.brightness, 25, 'A drag to zero keeps the pre-drag Both level');
  const count = fixed.commands.length;
  fixed.light.report({ selection: 2, power: 0, brightness: 75 });
  assert.equal(fixed.light.view.selection, 2, 'External state is reported honestly');
  assert.equal(fixed.commands.length, count);
  await apply(fixed.light, [fixed.light.setTemperature(286)]);
  assert.equal(fixed.light.state.selection, 0);
  assert.equal(fixed.light.state.power, 0, 'Temperature while off must not turn the light on');
  assert.ok(fixed.commands.at(-1)!.every(command => command.field !== 69));
  assert.equal(fixed.commands.at(-1)![0].field, 82);
  fixed.light.bothOnly = false;
  await apply(fixed.light, [fixed.light.select(2, true)]);
  assert.equal(fixed.light.state.selection, 2, 'Switching layouts restores selectable modes');
  fixed.light.disconnect();

  // The device report wins even during an outstanding HomeKit command.
  // There is no source/revision marker that can distinguish a BAF app change from an echo.
  const stale = harness();
  const change = stale.light.select(2, true);
  stale.light.flush();
  await change;
  assert.deepEqual(stale.light.persistedMemory, { down: 25, up: 75 });
  stale.light.report({ selection: 1, power: 1, brightness: 25 });
  assert.equal(stale.light.state.selection, 1);
  stale.light.report({ selection: 2, power: 1, brightness: 73 });
  assert.equal(stale.light.state.brightness, 73);
  assert.deepEqual(stale.light.memory, { down: 25, up: 73 });
  stale.light.disconnect();

  const external = harness();
  const homeChange = external.light.setBrightness(60);
  external.light.flush();
  await homeChange;
  // BAF sets 35% before the HomeKit request has been confirmed.
  external.light.report({ brightness: 35 });
  assert.equal(external.light.view.brightness, 35);
  assert.equal(external.light.persistedMemory.down, 35);
  assert.equal(external.commands.length, 1, 'A device report must never issue a write');
  await apply(external.light, [external.light.setTemperature(286)], { kelvin: 3500 });
  assert.deepEqual(external.commands.at(-1), [{ field: 71, value: 3497 }]);
  assert.equal(external.light.state.brightness, 35);
  external.light.disconnect();

  // Unrelated commands while off must not turn a remembered level into a brightness write.
  const zero = harness();
  zero.light.report({ brightness: 0, power: 0 });
  await apply(zero.light, [zero.light.setTemperature(286)], { kelvin: 3500 });
  assert.deepEqual(zero.commands.at(-1), [{ field: 71, value: 3497 }], 'Temperature while off must not restore brightness');
  const beforeOff = zero.commands.length;
  await apply(zero.light, [zero.light.setPower(false)]);
  assert.equal(zero.commands.length, beforeOff, 'Off while already off must not send brightness');
  await apply(zero.light, [zero.light.setPower(true), zero.light.setBrightness(0)], { power: 0, brightness: 0 });
  assert.equal(zero.commands.at(-1)?.find(command => command.field === 68)?.value, 0);
  assert.equal(zero.light.state.power, 0, 'Zero brightness takes precedence over a companion On=true write');
  zero.light.disconnect();

  // Push feedback cancels readback queries, even when the returned value differs.
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    for (const selection of [0, 1, 2] as const) {
      const gesture = harness();
      gesture.light.report({ selection, power: 1, brightness: 65 });
      for (const level of [40, 15, 1]) {
        await apply(gesture.light, [gesture.light.setBrightness(level)]);
        mock.timers.tick(200);
      }
      await apply(gesture.light, [gesture.light.setBrightness(0)], { power: 0, brightness: 1 });
      assert.equal(gesture.light.state.power, 0);
      await apply(gesture.light, [gesture.light.setPower(true)]);
      assert.equal(gesture.light.state.brightness, 65, 'On restores the level before the drag to zero');
      assert.equal(gesture.light.state.selection, selection);
      assert.deepEqual(gesture.commands.at(-1), [
        { field: 82, value: selection }, { field: 69, value: 65 }, { field: 68, value: 1 },
      ]);
      await apply(gesture.light, [gesture.light.setBrightness(1)]);
      mock.timers.tick(1300);
      await apply(gesture.light, [gesture.light.setPower(false)]);
      await apply(gesture.light, [gesture.light.setPower(true)]);
      assert.equal(gesture.light.state.brightness, 1, 'A settled 1% is a valid saved level');
      gesture.light.disconnect();
    }
    const splitOff = harness();
    await apply(splitOff.light, [splitOff.light.setBrightness(1)]);
    const off = splitOff.light.setBrightness(0);
    splitOff.light.flush();
    await off;
    splitOff.light.report({ brightness: 1 });
    splitOff.light.report({ power: 0 });
    await apply(splitOff.light, [splitOff.light.setPower(true)]);
    assert.equal(splitOff.light.state.brightness, 25, 'Split off feedback must preserve pre-gesture memory');
    splitOff.light.disconnect();

    const wake = harness();
    wake.light.report({ selection: 0, power: 0, brightness: 0 });
    await apply(wake.light, [wake.light.setBrightness(55)]);
    assert.deepEqual(wake.commands.at(-1), [
      { field: 82, value: 0 }, { field: 69, value: 55 }, { field: 68, value: 1 },
    ]);
    wake.light.report({ selection: 2 });
    assert.equal(wake.light.channelOn(1), false);
    assert.equal(wake.light.channelOn(2), true);
    wake.light.disconnect();

    const feedback = harness();
    const change = feedback.light.setBrightness(60);
    feedback.light.flush();
    await change;
    feedback.light.report({ brightness: 35 });
    mock.timers.tick(3000);
    assert.equal(feedback.light.state.brightness, 35);
    assert.equal(feedback.refreshes, 0);
    assert.equal(feedback.warnings.length, 0, 'A different reported value is not a feedback timeout');
    assert.equal(feedback.commands.length, 1);
    feedback.light.disconnect();

    const missing = harness();
    missing.light.report({ selection: 2, power: 1, brightness: 75 });
    const pendingMode = missing.light.setChannel(1, true);
    missing.light.flush();
    await pendingMode;
    missing.light.report({ power: 1 });
    assert.equal(missing.light.channelOn(1), true);
    mock.timers.tick(2600);
    assert.equal(missing.light.channelOn(1), false, 'Missing feedback eventually restores actual cached state');
    assert.equal(missing.warnings.length, 1);
    assert.equal(missing.commands.length, 1, 'Missing feedback does not retry commands');
    missing.light.disconnect();

    // Sliding continuously coalesces queries; lack of feedback never retries a write.
    const burst = harness();
    for (const value of [30, 40, 50, 60]) {
      const change = burst.light.setBrightness(value);
      burst.light.flush();
      await change;
      mock.timers.tick(100);
    }
    assert.equal(burst.refreshes, 0);
    mock.timers.tick(250);
    assert.equal(burst.refreshes, 1);
    mock.timers.tick(2500);
    assert.equal(burst.warnings.length, 1);
    assert.match(burst.warnings[0], /missing: brightness/);
    assert.equal(burst.light.state.brightness, 25);
    assert.equal(burst.commands.length, 4, 'Timeouts and readbacks must not retry brightness');
    burst.light.disconnect();
    const queries = burst.refreshes;
    mock.timers.tick(5000);
    assert.equal(burst.refreshes, queries, 'Disconnect cancels pending readbacks');
  } finally {
    mock.timers.reset();
  }

  console.log('Coordinated lighting tests passed.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });

