/** The white emitters share one output level; selection is a global fan mode. */
export type LightSelection = 0 | 1 | 2; // Both, Down, Up
export type DualLightModeControl = 'exclusive' | 'channels' | 'both-up';

export function normalizeDualLightModeControl(value: unknown): DualLightModeControl {
  return value === 'channels' || value === 'both-up' ? value : 'exclusive';
}

export type LightPower = 0 | 1 | 2; // Off, On, Auto
export interface LightMemory { down?: number; up?: number }
export interface WhiteLightState {
  selection: LightSelection;
  power: LightPower;
  brightness: number;
  kelvin?: number;
  minKelvin?: number;
  maxKelvin?: number;
}
export type LightCommand = { field: number; value: number };
type Intent = Partial<Pick<WhiteLightState, 'selection' | 'power' | 'brightness' | 'kelvin'>>;

export class DualLightCoordinator {
  public state: WhiteLightState = { selection: 1, power: 0, brightness: 50 };
  public memory: LightMemory = {};
  public ready = false;
  private reported: Partial<WhiteLightState> = {};
  private intent: Intent = {};
  private expected?: WhiteLightState;
  private awaiting = new Set<keyof WhiteLightState>();
  private memoryBeforeWrite?: LightMemory;
  private brightnessReportedDuringModeChange = false;
  private pending: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  private debounce?: ReturnType<typeof setTimeout>;
  private confirmation?: ReturnType<typeof setTimeout>;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private sliderTimer?: ReturnType<typeof setTimeout>;
  private sliderMemory?: LightMemory;
  private sliderValue?: number;

  private finishSlider(restore = false) {
    clearTimeout(this.sliderTimer);
    if (restore && this.sliderMemory) {
      this.memory = { ...this.sliderMemory };
      if (this.memoryBeforeWrite) {
        this.memoryBeforeWrite = { ...this.sliderMemory };
      }
    }
    this.sliderMemory = undefined;
    this.sliderValue = undefined;
  }

  constructor(
    memory: LightMemory | undefined,
    private readonly send: (commands: LightCommand[]) => void,
    private readonly refresh: () => void,
    private readonly changed: () => void,
    private readonly warn: (message: string) => void,
  ) {
    for (const key of ['down', 'up'] as const) {
      const value = memory?.[key];
      if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 100) {
        this.memory[key] = value;
      }
    }
  }

  get persistedMemory(): LightMemory {
    return this.sliderMemory ?? this.memoryBeforeWrite ?? this.memory;
  }

  get view(): WhiteLightState {
    const selection = this.intent.selection ?? this.state.selection;
    const remembered = this.memory[selection === 2 ? 'up' : 'down'];
    const turningOn = this.intent.power !== undefined && this.intent.power > 0;
    const restoring = selection !== this.state.selection || (turningOn && (this.state.power === 0 || this.state.brightness === 0));
    const brightness = this.intent.brightness ?? (restoring ? (remembered ?? (this.state.brightness || 50)) : this.state.brightness);
    const power = this.intent.brightness === 0 ? 0 : this.intent.power ??
      (this.intent.brightness !== undefined ? 1 : this.state.power);
    return { ...this.state, selection, power, brightness, kelvin: this.intent.kelvin ?? this.state.kelvin };
  }

  channelOn(channel: 1 | 2): boolean {
    const view = this.view;
    return view.selection === 0 || view.selection === channel;
  }

  setChannel(channel: 1 | 2, on: boolean): Promise<void> {
    const down = channel === 1 ? on : this.channelOn(1);
    const up = channel === 2 ? on : this.channelOn(2);
    // Keep a valid mode: deselecting the last channel selects the other channel.
    return this.request({ selection: down && up ? 0 : down ? 1 : up ? 2 : channel === 1 ? 2 : 1 });
  }

  select(selection: LightSelection, on: boolean): Promise<void> {
    // Radio selectors stay selected when power is off. Ignore deselection.
    return this.request(on ? { selection } : {});
  }

  setPower(on: boolean): Promise<void> {
    if (!on) {
      this.finishSlider(true);
    }
    return this.request({ power: on ? 1 : 0 });
  }

  setAuto(on: boolean): Promise<void> {
    return this.request({ power: on ? 2 : this.view.brightness > 0 ? 1 : 0 });
  }

  setBrightness(value: number): Promise<void> {
    if (!Number.isFinite(value)) {
      return Promise.reject(new Error('Invalid brightness'));
    }
    if (!this.ready) {
      return Promise.reject(new Error('Waiting for the fan to report its lighting state'));
    }
    const brightness = Math.max(0, Math.min(100, Math.round(value)));
    if (brightness === 0) {
      this.finishSlider(true);
    } else {
      this.sliderMemory ??= { ...this.persistedMemory };
      this.sliderValue = brightness;
      clearTimeout(this.sliderTimer);
      // HomeKit has no slider-release event. Treat nearby writes as one gesture.
      this.sliderTimer = setTimeout(() => {
        this.finishSlider();
        this.changed();
      }, 1200);
      this.sliderTimer.unref?.();
    }
    return this.request({ brightness });
  }

  setTemperature(mired: number): Promise<void> {
    if (!Number.isFinite(mired) || mired <= 0) {
      return Promise.reject(new Error('Invalid color temperature'));
    }
    const { min, max } = this.temperatureLimits();
    return this.request({ kelvin: Math.max(min, Math.min(max, Math.round(1000000 / mired))) });
  }

  temperatureLimits() {
    // Conservative fallback, replaced by the fan's reported bounds (fields 78/79).
    const min = this.state.minKelvin ?? Math.min(2700, this.state.kelvin ?? 2700);
    const max = this.state.maxKelvin ?? Math.max(4000, this.state.kelvin ?? 4000);
    return { min: Math.min(min, max), max: Math.max(min, max) };
  }

  private request(intent: Intent): Promise<void> {
    if (!this.ready) {
      return Promise.reject(new Error('Waiting for the fan to report its lighting state'));
    }
    if (Object.keys(intent).length === 0) {
      return Promise.resolve();
    }
    if (intent.selection !== undefined && intent.selection !== this.view.selection) {
      this.finishSlider();
    }
    this.intent = { ...this.intent, ...intent };
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.flush(), 80);
    return new Promise((resolve, reject) => this.pending.push({ resolve, reject }));
  }

  /** Coalesce scene writes, then send separate properties in a defined order. */
  flush() {
    clearTimeout(this.debounce);
    this.debounce = undefined;
    const next = this.view;
    const previous = this.state;
    const commands: LightCommand[] = [];
    const changedMode = next.selection !== previous.selection;
    const waking = next.power > 0 && next.brightness > 0 && (previous.power === 0 || previous.brightness === 0);
    if (changedMode || waking) {
      commands.push({ field: 82, value: next.selection });
    }
    if (next.power > 0 && next.brightness > 0 &&
        (changedMode || next.brightness !== previous.brightness || previous.power === 0)) {
      commands.push({ field: 69, value: next.brightness });
    }
    if (next.kelvin !== undefined && next.kelvin !== previous.kelvin) {
      commands.push({ field: 71, value: next.kelvin });
    }
    if (next.power !== previous.power || changedMode || waking || this.intent.brightness === 0) {
      commands.push({ field: 68, value: next.power });
    }
    this.intent = {};
    const pending = this.pending.splice(0);
    try {
      if (commands.length) {
        this.send(commands);
        this.memoryBeforeWrite ??= { ...this.memory };
        this.state = next;
        this.remember();
        this.expected = next;
        const keys: Record<number, keyof WhiteLightState> = { 82: 'selection', 69: 'brightness', 71: 'kelvin', 68: 'power' };
        if (commands.some(command => command.field === 82)) {
          this.brightnessReportedDuringModeChange = false;
        }
        commands.forEach(command => this.awaiting.add(keys[command.field]));
        clearTimeout(this.confirmation);
        this.confirmation = setTimeout(() => {
          const missing = [...this.awaiting].join(', ');
          const requested = JSON.stringify(this.expected);
          this.expected = undefined;
          this.awaiting.clear();
          this.memory = this.memoryBeforeWrite ?? this.memory;
          this.memoryBeforeWrite = undefined;
          this.acceptReport();
          this.warn(`White-light feedback timed out (missing: ${missing}); using the last reported fan state. ` +
            `Requested: ${requested}; reported: ${JSON.stringify(this.reported)}.`);
          this.scheduleRefresh();
        }, 2500);
        this.confirmation.unref?.();
        this.scheduleRefresh();
      }
      this.changed();
      pending.forEach(waiter => waiter.resolve());
    } catch (error) {
      pending.forEach(waiter => waiter.reject(error instanceof Error ? error : new Error(String(error))));
      this.changed();
    }
  }

  private scheduleRefresh() {
    // Let push updates arrive first. Slider changes share one readback query
    // after they settle instead of requesting a full snapshot on every write.
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      this.refresh();
    }, 250);
    this.refreshTimer.unref?.();
  }

  /** Apply a complete frame together so a mode change cannot corrupt another mode's memory. */
  report(update: Partial<WhiteLightState>) {
    if (this.sliderMemory && ((update.selection !== undefined && update.selection !== this.state.selection) ||
        (update.brightness !== undefined && update.brightness > 0 && update.brightness !== this.sliderValue && update.power !== 0))) {
      // A different device value is authoritative, including BAF app changes.
      this.finishSlider();
    }
    if (update.selection !== undefined && update.selection !== this.reported.selection && update.brightness === undefined) {
      if (!this.awaiting.has('selection') || !this.brightnessReportedDuringModeChange) {
        delete this.reported.brightness;
      }
      // Selection is independently authoritative; do not leave switches stale
      // while waiting for the selected mode's brightness in another frame.
      this.state.selection = update.selection;
      this.changed();
      this.scheduleRefresh();
    }
    if (this.awaiting.has('selection') && update.brightness !== undefined) {
      this.brightnessReportedDuringModeChange = true;
    }
    this.reported = { ...this.reported, ...update };
    Object.keys(update).forEach(key => this.awaiting.delete(key as keyof WhiteLightState));
    const r = this.reported;
    if (r.selection === undefined || r.power === undefined || r.brightness === undefined) {
      return;
    }
    this.ready = true;
    // Reports do not identify which controller changed the light. A differing
    // value may be a BAF app/remote/Matter change or firmware rounding, so it
    // must update HomeKit immediately, even while another write awaits feedback.
    // Discard speculative memory before remembering the actual reported mode.
    if (this.awaiting.size === 0) {
      this.memory = this.memoryBeforeWrite ?? this.memory;
      this.memoryBeforeWrite = undefined;
      clearTimeout(this.confirmation);
      clearTimeout(this.refreshTimer);
      this.expected = undefined;
    }
    this.acceptReport();
  }

  private acceptReport() {
    if (this.reported.selection === undefined || this.reported.power === undefined || this.reported.brightness === undefined) {
      this.ready = false;
      this.changed();
      return;
    }
    const current = { ...this.reported };
    // A partial report only confirms the properties it contains. Cached values
    // for other outstanding writes are not fresh feedback and must not roll
    // their optimistic state back. Explicit differing reports still win.
    for (const key of this.awaiting) {
      delete current[key];
    }
    this.state = { ...this.state, ...current };
    this.remember();
    this.changed();
  }

  private remember() {
    if (this.awaiting.has('selection') || this.awaiting.has('brightness') ||
        (this.expected?.power === 0 && this.awaiting.has('power'))) {
      return;
    }
    const key = this.state.selection === 2 ? 'up' : 'down';
    // An off-state mode report may carry the previous mode's output level.
    // Preserve known per-mode levels until the light is actually operating.
    if (this.state.brightness > 0 && (this.state.power !== 0 || this.memory[key] === undefined)) {
      this.memory[key] = this.state.brightness;
    }
  }

  disconnect() {
    this.finishSlider(true);
    clearTimeout(this.debounce);
    clearTimeout(this.confirmation);
    clearTimeout(this.refreshTimer);
    this.ready = false;
    this.reported = {};
    this.intent = {};
    this.expected = undefined;
    this.awaiting.clear();
    this.memory = this.memoryBeforeWrite ?? this.memory;
    this.memoryBeforeWrite = undefined;
    this.pending.splice(0).forEach(waiter => waiter.reject(new Error('Fan disconnected')));
  }
}

/** One scalar property in a Job, wrapped in ApiMessage, without SLIP delimiters. */
export function lightCommand(field: number, value: number): number[] {
  const property = [...encodeVarint(field * 8), ...encodeVarint(value)];
  const job = [0x1a, ...encodeVarint(property.length), ...property];
  const api = [0x12, ...encodeVarint(job.length), ...job];
  return [0x12, ...encodeVarint(api.length), ...api];
}

function encodeVarint(value: number): number[] {
  const bytes: number[] = [];
  do {
    const byte = value & 0x7f;
    value = Math.floor(value / 128);
    bytes.push(byte | (value ? 0x80 : 0));
  } while (value);
  return bytes;
}

export function rgbToHueSaturation(red: number, green: number, blue: number): [number, number] {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (delta === 0) {
    return [0, 0];
  }
  const hue = max === red ? (green - blue) / delta : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
  return [(hue * 60 + 360) % 360, max === 0 ? 0 : delta / max * 100];
}

