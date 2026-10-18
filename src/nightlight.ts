import { rgbToHueSaturation } from './lighting';

/** Property 83 is one complete StandbyLed value, including its enable flag. */
export interface NightLightState {
  enabled: boolean;
  brightness: number;
  preset: number;
  red: number;
  green: number;
  blue: number;
}

type NightLightIntent = Partial<Pick<NightLightState, 'enabled' | 'brightness'>> & { hue?: number; saturation?: number };

export function emptyNightLightState(): NightLightState {
  return { enabled: false, brightness: 0, preset: 0, red: 0, green: 0, blue: 0 };
}

export function nightLightColor(state: NightLightState): [number, number] {
  const presets: Array<[number, number]> = [
    [0, 0], [0, 100], [106, 100], [220, 100], [180, 100],
    [60, 100], [280, 100], [0, 0], [30, 100], [300, 100],
  ];
  return state.preset > 0 && presets[state.preset]
    ? presets[state.preset] : rgbToHueSaturation(state.red, state.green, state.blue);
}

export class NightLightCoordinator {
  public state = emptyNightLightState();
  public ready = false;
  public rememberedBrightness = 0;
  private reported?: NightLightState;
  private intent: NightLightIntent = {};
  private pending: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  private debounce?: ReturnType<typeof setTimeout>;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private confirmation?: ReturnType<typeof setTimeout>;

  constructor(
    rememberedBrightness: number | undefined,
    private readonly send: (state: NightLightState) => void,
    private readonly refresh: () => void,
    private readonly changed: () => void,
    private readonly warn: (message: string) => void,
  ) {
    if (typeof rememberedBrightness === 'number' && Number.isFinite(rememberedBrightness) && rememberedBrightness > 0) {
      this.rememberedBrightness = Math.min(100, Math.round(rememberedBrightness));
    }
  }

  get view(): NightLightState {
    const next = { ...this.state };
    const intent = this.intent;
    next.brightness = intent.brightness ??
      (intent.enabled === true && next.brightness === 0 ? (this.rememberedBrightness || 25) : next.brightness);
    // HomeKit may send On=true together with Brightness=0. Zero intensity wins.
    next.enabled = intent.brightness === 0 ? false : intent.enabled ??
      (intent.brightness !== undefined ? true : next.enabled);
    if (intent.hue !== undefined || intent.saturation !== undefined) {
      const [hue, saturation] = nightLightColor(next);
      [next.red, next.green, next.blue] = hueSaturationToRGB(intent.hue ?? hue, intent.saturation ?? saturation);
      next.preset = 0;
    }
    const activating = intent.enabled === true || (intent.brightness !== undefined && intent.brightness > 0 && intent.enabled !== false);
    if (activating && next.preset === 0 && next.red + next.green + next.blue === 0) {
      // A never-configured light can report custom black. Make the first On usable.
      next.preset = 7;
      next.red = next.green = next.blue = 255;
    }
    return next;
  }

  setPower(enabled: boolean) {
    return this.request({ enabled });
  }

  setBrightness(value: number) {
    return this.setNumber('brightness', value, 100);
  }

  setHue(value: number) {
    return this.setNumber('hue', value, 360);
  }

  setSaturation(value: number) {
    return this.setNumber('saturation', value, 100);
  }

  private setNumber(key: 'brightness' | 'hue' | 'saturation', value: number, max: number) {
    if (!Number.isFinite(value)) {
      return Promise.reject(new Error(`Invalid night-light ${key}`));
    }
    return this.request({ [key]: Math.max(0, Math.min(max, Math.round(value))) });
  }

  private request(intent: NightLightIntent): Promise<void> {
    if (!this.ready) {
      return Promise.reject(new Error('Waiting for the fan to report its night-light settings'));
    }
    this.intent = { ...this.intent, ...intent };
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.flush(), 80);
    return new Promise((resolve, reject) => this.pending.push({ resolve, reject }));
  }

  flush() {
    clearTimeout(this.debounce);
    this.debounce = undefined;
    if (!this.pending.length) {
      return;
    }
    const next = this.view;
    this.intent = {};
    const pending = this.pending.splice(0);
    try {
      this.send(next);
      this.state = next;
      clearTimeout(this.confirmation);
      this.confirmation = setTimeout(() => {
        if (this.reported) {
          this.state = { ...this.reported };
        }
        this.warn('Night-light feedback timed out; using the last reported fan settings. ' +
          `Requested: ${JSON.stringify(next)}; reported: ${JSON.stringify(this.reported)}.`);
        this.changed();
        this.scheduleRefresh();
      }, 2500);
      this.confirmation.unref?.();
      this.scheduleRefresh();
      this.changed();
      pending.forEach(waiter => waiter.resolve());
    } catch (error) {
      this.changed();
      pending.forEach(waiter => waiter.reject(error instanceof Error ? error : new Error(String(error))));
    }
  }

  private scheduleRefresh() {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      this.refresh();
    }, 250);
    this.refreshTimer.unref?.();
  }

  /** Fan/app reports always win; never re-send an earlier requested setting. */
  report(state: NightLightState) {
    clearTimeout(this.confirmation);
    clearTimeout(this.refreshTimer);
    this.reported = { ...state };
    this.state = { ...state };
    this.ready = true;
    if (state.brightness > 0 && state.brightness <= 100) {
      this.rememberedBrightness = state.brightness;
    }
    this.changed();
  }

  disconnect() {
    clearTimeout(this.debounce);
    clearTimeout(this.confirmation);
    clearTimeout(this.refreshTimer);
    this.ready = false;
    this.intent = {};
    if (this.reported) {
      this.state = { ...this.reported };
    }
    this.pending.splice(0).forEach(waiter => waiter.reject(new Error('Fan disconnected')));
  }
}

function hueSaturationToRGB(hue: number, saturation: number): [number, number, number] {
  const h = (hue % 360) / 60;
  const s = saturation / 100;
  const f = h - Math.floor(h);
  const p = 255 * (1 - s);
  const q = 255 * (1 - s * f);
  const t = 255 * (1 - s * (1 - f));
  const colors = [[255, t, p], [q, 255, p], [p, 255, t], [p, q, 255], [t, p, 255], [255, p, q]];
  const [red, green, blue] = colors[Math.floor(h)];
  return [Math.round(red), Math.round(green), Math.round(blue)];
}

/** Write every field, including zero values, so a color write cannot disable the feature. */
export function nightLightCommand(state: NightLightState): number[] {
  const inner = [
    0x08, ...varint(state.preset),
    0x10, state.enabled ? 1 : 0,
    0x18, ...varint(state.brightness),
    0x20, ...varint(state.red),
    0x28, ...varint(state.green),
    0x30, ...varint(state.blue),
  ];
  const property = [0x9a, 0x05, ...varint(inner.length), ...inner];
  const job = [0x1a, ...varint(property.length), ...property];
  const api = [0x12, ...varint(job.length), ...job];
  return [0x12, ...varint(api.length), ...api];
}

function varint(value: number): number[] {
  const bytes: number[] = [];
  do {
    const byte = value & 0x7f;
    value = Math.floor(value / 128);
    bytes.push(byte | (value ? 0x80 : 0));
  } while (value);
  return bytes;
}
