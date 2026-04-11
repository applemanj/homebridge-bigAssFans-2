<span align="center">
<h1 align="center"><img src="https://raw.githubusercontent.com/oogje/homebridge-i6-bigAssFans/main/IMG_3799.jpg"/>
<img src="https://raw.githubusercontent.com/oogje/homebridge-i6-bigAssFans/main/HaikuH.jpg"/>
<img src="https://raw.githubusercontent.com/oogje/homebridge-i6-bigAssFans/main/es6.jpeg"/>
</h1>

## homebridge-bigassfans-2 v1.0.3

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
sudo npm install -g applemanj/homebridge2-bigAssFans
```

### Configuration

Add the `BigAssFans-i6` platform in `config.json` inside your Homebridge configuration directory.

> **Note:** The `platform` value remains `"BigAssFans-i6"` for compatibility.

#### Minimal Example

```json
{
  "platforms": [
    {
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
| `probeFrequency` | `60000` | Keep-alive probe interval in milliseconds (`0` disables probing) |
| `noLights` | `false` | Hide all light controls |
| `showHumidity` | `true` | Expose humidity sensor |
| `showTemperature` | `true` | Expose temperature sensor |
| `downlightEquipped` | auto | Override downlight detection (`true`/`false`) |
| `uplightEquipped` | auto | Override uplight detection (`true`/`false`) |
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

### Troubleshooting

1. **Make sure you can control your fan from the official Big Ass Fans app** before troubleshooting the plugin.

2. **Run Homebridge in debug mode** for additional diagnostics:
   ```sh
   homebridge -D
   ```

3. **Clear the accessory cache** if you see duplicate or stale services after upgrading from the original plugin.

4. **Check the [Issues](https://github.com/applemanj/homebridge2-bigAssFans/issues)** for known problems and solutions.
5. **If `enableDebugPort` is enabled**, connect from the Homebridge host itself. The debug port now listens on `127.0.0.1` only.

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
