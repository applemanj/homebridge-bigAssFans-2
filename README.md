<span align="center">
<h1 align="center"><img src="https://raw.githubusercontent.com/oogje/homebridge-i6-bigAssFans/main/IMG_3799.jpg"/>
<img src="https://raw.githubusercontent.com/oogje/homebridge-i6-bigAssFans/main/HaikuH.jpg"/>
<img src="https://raw.githubusercontent.com/oogje/homebridge-i6-bigAssFans/main/es6.jpeg"/>
</h1>

## homebridge-bigassfans-2 v1.1.24

</span>

`homebridge-bigassfans-2` is a Homebridge plugin for controlling Big Ass Fans i6, es6, Haiku H/I Series, and Haiku L Series ceiling fans with firmware version 3.0 or greater. Compatible with Homebridge 1.8+ and Homebridge 2.0.

This is a fork of [homebridge-i6-bigAssFans](https://github.com/oogje/homebridge-i6-bigAssFans) by [@oogje](https://github.com/oogje), updated and modernized with Fanv2 support, bug fixes, and improved code quality.

### What's New in This Fork

**Homebridge 2.0 / Fanv2 Service**
- Uses the modern `Fanv2` HomeKit service instead of the legacy `Fan` service.
- **Whoosh Mode** is now a native `SwingMode` characteristic in the fan tile -- no separate switch needed.
- **Fan Auto Mode** is now a native `TargetFanState` characteristic (Manual / Auto) in the fan tile -- no separate switch needed.
- `CurrentFanState` reports whether the fan is Inactive, Idle, or Blowing Air.
- Legacy cached `Fan` and `whooshSwitch` services are automatically cleaned up on upgrade.

> **Home App labeling note:** Apple labels the native `SwingMode` control as **Oscillate** in the Home app. In this plugin, **Oscillate = Big Ass Fans Whoosh**. Apple also labels `TargetFanState` as **Fan Mode: Manual / Auto**; in this plugin, **Auto = the fan's built-in Big Ass Fans auto mode**.

**Bug Fixes**
- **Connection stability** -- Reconnections now re-send the initialization and capability query to the fan, fixing the issue where a daily restart was required to restore communication (upstream [#41](https://github.com/oogje/homebridge-i6-bigAssFans/issues/41)).
- **Fans offline at startup** -- All connection errors (including `ECONNREFUSED`) now trigger automatic retry with exponential backoff, so fans that are powered off or unreachable at boot will connect once available (upstream [#35](https://github.com/oogje/homebridge-i6-bigAssFans/issues/35)).
- **mDNS hostname support** -- Removed forced IPv4 (`family: 4`) from the TCP connection, allowing mDNS `.local` hostnames and IPv6 to work correctly (upstream [#29](https://github.com/oogje/homebridge-i6-bigAssFans/issues/29)).
- **varint encoding bug** -- Fixed an operator-precedence bug in `varint_encode` where the continuation bit (`| 0x80`) was applied to the return value of `Array.push()` instead of the byte being pushed. This could cause incorrect protobuf encoding for values over 127 (e.g., color temperature).
- **Multi-fan shared state** -- Eight module-level variables (debug state, reboot tracking, occupancy tracking, etc.) were shared across all fan instances, causing cross-talk between fans in multi-fan setups. These are now per-instance.

**Code Quality**
- Removed unnecessary `declare const Buffer` that suppressed TypeScript type checking.
- Fixed `debugLevels` type from `number[]` to `Record<string, number>`.
- Modernized `import net = require('net')` to `import * as net from 'net'`.
- Updated ESLint config to remove deprecated rules from `@typescript-eslint` v8.
- Updated `tsconfig.json` with `skipLibCheck` for HB2 type compatibility.
- Stale chunk fragments are now cleared on reconnect to prevent corrupt protobuf data.

**v1.1.24**
- Cleared stale speed-diagnostic state when the fan turns off or the socket/write path fails, so later off-state echoes no longer get misattributed to an older speed request.
- Added regression coverage for the diagnostic reset path after a fan-off event.

**v1.1.23**
- Added temporary `Active` / on-off diagnostics so logs now show when HomeKit sends an on-off request and when the fan reports its on-off state back.
- Added regression coverage for the new on-off diagnostic path.

**v1.1.22**
- Fixed low-end slider mapping so very small nonzero HomeKit percentages now clamp to the fan's minimum real speed instead of rounding down to off.
- Added regression coverage for `1%` and other tiny nonzero slider values.

**v1.1.21**
- Smoothed the HomeKit slider further by deferring the preset snap until the debounced fan write actually fires, instead of snapping for every intermediate drag value.
- Added regression coverage to make sure rapid slider drags only send the final discrete fan speed.

**v1.1.20**
- Smoothed out HomeKit speed slider drags by coalescing rapid slider writes into the final fan step instead of sending every intermediate value.
- Briefly ignores mismatched fan speed echoes right after a HomeKit speed change so older fan reports do not yank the slider back to a previous preset.

**v1.1.19**
- Updated the HomeKit speed slider path to snap immediately to the nearest supported fan preset instead of waiting for the fan's state echo.
- This should make the slider feel more responsive while still reconciling against the real fan report afterward.

**v1.1.18**
- Added temporary speed-path diagnostics so logs show when HomeKit sends a slider speed request and when the fan first reports a speed back.
- The diagnostic lines include the requested percentage, mapped device speed, write payload, and elapsed time to the first fan speed report.

**v1.1.17**
- Added a shared internal types module so platform config and accessory context stay in sync across the codebase.
- Broke the remaining `platform.ts` / `platformAccessory.ts` circular dependency without changing runtime behavior.
- Removed one confirmed dead-code path and tightened a few internal helper types for safer maintenance.

**v1.1.16**
- Removed the `homebridge` `peerDependencies` entry so npm no longer auto-installs Homebridge and `hap-nodejs` when the plugin is installed.
- This matches the current Homebridge verification expectations while keeping the supported Homebridge range in `engines.homebridge`.

**v1.1.15**
- Added the explicit package `homepage` metadata required by the Homebridge verification checks.
- Updated `config.schema.json` to use proper object-level `required` arrays and added the expected top-level platform `name` field.
- Aligned the README examples with the Homebridge Settings UI by showing the top-level platform `name` in manual config examples.

**v1.1.14**
- Simplified the HomeKit fan-speed control path again by removing the recent auto-to-manual handoff, stale-speed suppression, and queued-write delay logic.
- This intentionally moves the plugin back toward the simpler control behavior from earlier fork releases while keeping the unrelated parser, reconnect, and cache fixes.
- Added regression coverage for the simplified direct speed-write path.

**v1.1.13**
- Added a short-lived expected-speed guard so a stale inbound fan update does not immediately overwrite a speed change that HomeKit just sent.
- The guard automatically clears once the commanded speed is observed, so normal follow-up state updates continue flowing right away.
- Added regression coverage for the stale-update suppression path.

**v1.1.12**
- Added a small per-fan outbound command queue so repeated HomeKit commands are serialized with a short gap instead of being blasted to the fan back-to-back.
- This is intended to reduce command storms that can leave the accessory in a `No Response` state after several rapid HomeKit interactions.
- Added regression coverage for queued client writes alongside the earlier auto-to-manual speed-control tests.

**v1.1.11**
- Adjusted the HomeKit manual speed-control path again so the plugin waits briefly after switching the fan out of Big Ass Fans auto mode before sending the requested manual speed.
- This better mirrors the older “turn auto off, then change speed” flow and is intended to stop the speed slider from snapping back to the externally managed value.
- Added regression coverage for the delayed auto-to-manual speed transition.

**v1.1.10**
- Fixed HomeKit fan speed changes while Big Ass Fans auto mode is active by explicitly switching the fan to manual mode before sending the requested speed.
- This prevents the next state refresh from snapping the Home app slider back to the externally managed auto-mode speed.
- Added regression coverage for the auto-to-manual speed-control transition.

**v1.1.9**
- Adjusted the auto-mode idle mapping so fans in Big Ass Fans auto mode at speed `0` are reported to HomeKit as inactive instead of active at `0%`.
- This avoids the Home app control path that could leave the accessory in a `Not Responding` state after the earlier zero-speed sync changes.
- `TargetFanState` still remains `Auto`, so the fan stays in automatic mode while HomeKit sees a safer inactive current state.

**v1.1.8**
- Reissued the zero-speed auto-mode state sync fix under a new npm version so the latest release can be published cleanly.
- Fans in Big Ass Fans auto mode at speed `0` now report `RotationSpeed = 0%` in the Home app instead of leaving a stale nonzero percentage behind.
- `Active` / `CurrentFanState` still show the correct idle-in-auto behavior, with the regression coverage carried forward.

**v1.1.7**
- Fixed auto-mode state reporting so fans that are in Big Ass Fans auto mode at speed `0` no longer leave a stale nonzero speed in the Home app.
- HomeKit `RotationSpeed` now returns to `0%` when the fan reports zero speed, while `Active` / `CurrentFanState` still show the correct idle-in-auto behavior.
- Added regression coverage for zero-speed rotation updates and percentage mapping.

**v1.1.6**
- Improved downlight auto-detection compatibility for fans that expose color-temperature control but underreport the primary downlight capability flag.
- Downlight services now refresh correctly if capability information improves after the initial startup message.
- Added regression coverage for downlight inference and override precedence.

**v1.1.5**
- Fixed fan-only and `noLights` setups so inbound fan state updates are no longer blocked waiting for a light target selector message that may never arrive.
- External fan changes from the Big Ass Fans app now flow back into HomeKit correctly even when the accessory has no light services.
- Added regression coverage for fan state dispatch when `targetBulb` is unknown.

**v1.1.4**
- External fan changes made in the Big Ass Fans app are now pulled back into HomeKit on the next probe cycle, even when the fan does not send an unsolicited state update.
- HomeKit `Active` / `CurrentFanState` now stay in sync more reliably for external auto-mode transitions.
- Added regression checks covering periodic state refresh and external auto-mode synchronization.

**v1.1.3**
- External fan changes made in the Big Ass Fans app now update HomeKit `Active` / `CurrentFanState` more reliably, including auto-mode transitions.
- Added a regression check covering external auto-mode state synchronization.

**v1.1.2**
- Added startup capability summary logging so users can see which features each fan actually reports and which are exposed in HomeKit.
- Added README guidance recommending a minimal config first, then adding overrides only when needed.

**v1.1.1**
- Added a lightweight regression harness for parser and reconnect edge cases.
- Package metadata now reflects the current release series consistently.

**v1.0.3**
- Hardened protobuf parsing so malformed or truncated frames are safely dropped instead of risking a stuck parse loop.
- The optional debug TCP port now listens on `127.0.0.1` only.
- Fans removed from `config.fans` are automatically cleaned out of the Homebridge accessory cache.
- The Homebridge UI now exposes the additional documented configuration options from this README.

---

### Features

- Turn fan and/or light(s) on or off
- Change fan speed and direction (Big Ass Fans discourages reversing speed)
- Ability to disable the fan direction control
- Change brightness level of LED light
- Adjust color temperature (i6 downlight)
- Control UV-C light
- Whoosh Mode (native SwingMode in the fan tile)
- Fan Auto Mode (native TargetFanState in the fan tile)
- Light Auto Mode (optional switch)
- Dim to Warm (optional switch, i6 fans)
- Eco Mode (optional switch, Haiku fans)
- Expose occupancy (motion) sensors
- Display temperature sensor (Haiku fans, i6 with remote)
- Display humidity sensor (i6 with remote)
- Night Light / Standby LED control (brightness, color)
- Incremental brightness and speed buttons (optional)

### Requirements

- **Homebridge** 1.8.0 or newer (including Homebridge 2.0)
- **Node.js** 20.15.1 or newer (20.x, 22.x, or 24.x)

### Installation

If you are not already running Homebridge, see the [Homebridge documentation](https://github.com/homebridge/homebridge#readme) to get started.

#### Install from npm

```sh
sudo npm install -g homebridge-bigassfans-2
```

#### Install from this repo

```sh
sudo npm install -g applemanj/homebridge-bigAssFans-2
```

### Configuration

Add the `BigAssFans-i6` platform in `config.json` inside your Homebridge configuration directory.

> **Note:** The `platform` value remains `"BigAssFans-i6"` for compatibility.

#### Minimal Example

```json
{
  "platforms": [
    {
      "name": "Big Ass Fans",
      "platform": "BigAssFans-i6",
      "fans": [
        {
          "name": "Living Room Fan",
          "mac": "20:F8:5E:00:00:00",
          "ip": "192.168.1.150"
        }
      ]
    }
  ]
}
```

#### Multi-Fan Example

```json
{
  "platforms": [
    {
      "name": "Big Ass Fans",
      "platform": "BigAssFans-i6",
      "fans": [
        {
          "name": "Living Room i6",
          "mac": "20:F8:5E:00:00:00",
          "ip": "livingroom-fan.local",
          "showLightAutoSwitch": true,
          "showDimToWarmSwitch": true
        },
        {
          "name": "Bedroom Haiku",
          "mac": "20:F8:5E:00:00:01",
          "ip": "192.168.1.151",
          "showLightAutoSwitch": true,
          "showEcoModeSwitch": true
        }
      ]
    }
  ]
}
```

#### Recommended Minimal Config

Start with the smallest config that identifies each fan:

```json
{
  "name": "Big Ass Fans",
  "platform": "BigAssFans-i6",
  "fans": [
    {
      "name": "Bedroom Fan",
      "ip": "192.168.1.150",
      "mac": "20:F8:5E:00:00:00"
    }
  ]
}
```

If you configure the plugin manually, include a top-level `"name"` alongside `"platform"` and `"fans"`. The Homebridge Settings UI also expects that field for platform plugins.

Then let the plugin detect the fan's capabilities at startup and only add override options if you actually need them, for example:
- `noLights` if you want to hide all lighting services
- `disableDirectionControl` if you want to hide reverse control
- `showTemperature` or `showHumidity` if you want to override the default sensor exposure behavior
- `downlightEquipped` / `uplightEquipped` only if auto-detection is wrong for your fan; omit these fields to use autodetection

### Configuration Fields

#### Required

| Field | Description |
|-------|-------------|
| `platform` | Must be `"BigAssFans-i6"` |
| `fans` | Array of fan objects |
| `name` | Display name for the fan |
| `ip` | IP address or hostname (mDNS `.local` names supported) |
| `mac` | MAC address (found in the Big Ass Fans app under Wi-Fi settings) |

#### Optional Switches

| Field | Default | Description |
|-------|---------|-------------|
| `showFanAutoSwitch` | `false` | Add a legacy separate switch for Fan Auto (also available natively in fan tile via TargetFanState) |
| `showLightAutoSwitch` | `false` | Add a switch for Light Auto mode |
| `showDimToWarmSwitch` | `false` | Add a switch for Dim to Warm (i6 fans) |
| `showEcoModeSwitch` | `false` | Add a switch for Eco Mode (Haiku fans) |
| `disableDirectionControl` | `false` | Hide the fan direction control |

#### Advanced

| Field | Default | Description |
|-------|---------|-------------|
| `probeFrequency` | `60000` | Keep-alive and state-refresh interval in milliseconds (`0` disables periodic probing) |
| `noLights` | `false` | Hide all light controls |
| `showHumidity` | `true` | Expose humidity sensor |
| `showTemperature` | `true` | Expose temperature sensor |
| `downlightEquipped` | auto | Override downlight detection with `true` or `false`; omit the field to use autodetection |
| `uplightEquipped` | auto | Override uplight detection with `true` or `false`; omit the field to use autodetection |
| `showFanOccupancySensor` | `false` | Expose fan occupancy sensor |
| `showLightOccupancySensor` | `false` | Expose light occupancy sensor |
| `showStandbyLED` | `false` | Expose night light / standby LED controls |
| `enableIncrementalButtons` | `false` | Add +/- buttons for brightness and fan speed |
| `incrementalButtonsDelay` | `500` | Auto-reset delay for incremental buttons (ms) |
| `enableDebugPort` | `false` | Enable a localhost-only TCP debug port for runtime debug level changes |

### Migrating from homebridge-i6-bigassfans

1. **Uninstall the old plugin** and install this one.
2. **Clear your Homebridge accessory cache** -- the switch from `Fan` to `Fanv2` service requires fresh accessories. (The plugin will attempt to remove the legacy `Fan` service automatically, but a cache clear ensures a clean state.)
3. **Remove `showWhooshSwitch`** from your config -- Whoosh is now built into the fan tile as SwingMode.
4. **`showFanAutoSwitch` is optional** -- Fan Auto is now built into the fan tile as TargetFanState. You can keep the legacy switch if you prefer a separate control.
5. The `platform` value stays `"BigAssFans-i6"` -- no config change needed there.

### Upgrading from the Original Plugin -- What Changes in HomeKit

| Before (Fan service) | After (Fanv2 service) |
|---|---|
| On/Off toggle | Active (Inactive / Active) |
| Separate Whoosh switch | SwingMode in fan tile |
| Separate Fan Auto switch | TargetFanState (Manual / Auto) in fan tile |
| No fan state feedback | CurrentFanState (Inactive / Idle / Blowing Air) |
| Rotation Speed (%) | Rotation Speed (%) -- unchanged |
| Rotation Direction | Rotation Direction -- unchanged |

### Home App Terminology

Because this plugin uses Apple's native `Fanv2` service, some labels in the Home app use Apple's generic fan wording instead of Big Ass Fans branding:

| Home App Label | Big Ass Fans Feature |
|---|---|
| `Oscillate` | `Whoosh` |
| `Fan Mode: Manual` | Fan manual mode |
| `Fan Mode: Auto` | Big Ass Fans fan auto mode |

The behavior is mapped correctly; only the labels are Apple's.

State changes made outside HomeKit, such as turning a fan on in the Big Ass Fans app, are also reflected back into HomeKit so the fan tile stays in sync. If the fan does not push that update on its own, the plugin will pick it up on the next probe/state-refresh cycle.

### Troubleshooting

1. **Make sure you can control your fan from the official Big Ass Fans app** before troubleshooting the plugin.

2. **Run Homebridge in debug mode** for additional diagnostics:
   ```sh
   homebridge -D
   ```

3. **Check the startup capability summary** in the Homebridge logs. After each fan connects, the plugin logs which features were detected and which ones are being exposed or hidden by config. This is the easiest way to confirm whether your fan actually reports temperature, humidity, lights, occupancy, standby LED support, and similar capabilities.

4. **If external app changes seem delayed in HomeKit, lower `probeFrequency`.** With the default `60000`, it can take up to about 60 seconds for a change made in the Big Ass Fans app to appear in HomeKit if the fan does not push an unsolicited update. A lower value such as `10000` or `15000` will refresh more quickly.

5. **Clear the accessory cache** if you see duplicate or stale services after upgrading from the original plugin.

6. **If HomeKit shows stale state, `No Response`, or ignores control changes while the plugin logs still look healthy, reboot your Home Hubs** (Apple TV / HomePod). In testing, hub-side issues can mimic plugin control failures even when the fan connection and state polling are working normally.

7. **Check the [Issues](https://github.com/applemanj/homebridge-bigAssFans-2/issues)** for known problems and solutions.
8. **If `enableDebugPort` is enabled**, connect from the Homebridge host itself. The debug port listens on `127.0.0.1` only, and you will usually want to turn it back off after debugging.

### Tips

- If you cannot change the fan icon in Apple's Home app and the fan is shown as a single tile, switch to **Show as Separate Tiles**, change the icon, then switch back to **Show as Single Tile**.
- If the Home app does not show the option to separate tiles (e.g., a Haiku with no light and no optional switches), temporarily add `"showTemperature": false` to your config, restart, change the icon, then remove the setting.

### Acknowledgments

This fork builds on the work of [@oogje](https://github.com/oogje) and the contributors to [homebridge-i6-bigAssFans](https://github.com/oogje/homebridge-i6-bigAssFans).

Special thanks to:
- [@bdraco](https://github.com/bdraco) for identifying the protobuf protocol
- [@jfroy](https://github.com/jfroy) for building a working BAF protobuf controller
- [@pponce](https://github.com/pponce) for Haiku implementation, testing, and collaboration
- [@knmorgan](https://github.com/knmorgan) for bug reports and code contributions
- [@aveach](https://github.com/aveach) and all users who reported issues and helped debug
- [homebridge-miot](https://github.com/merdok/homebridge-miot) -- style guide
- [HAP-NodeJS](https://github.com/KhaosT/HAP-NodeJS) & [Homebridge](https://github.com/homebridge/homebridge) -- for making this possible
- [Big Ass Fans](https://www.bigassfans.com) -- for their awesome products

### License

MIT
