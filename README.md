<p align="center">
  <img src="https://raw.githubusercontent.com/applemanj/homebridge-bigAssFans-2/main/IMG_3799.jpg" alt="Big Ass Fans i6" />
  <img src="https://raw.githubusercontent.com/applemanj/homebridge-bigAssFans-2/main/HaikuH.jpg" alt="Haiku fan" />
  <img src="https://raw.githubusercontent.com/applemanj/homebridge-bigAssFans-2/main/es6.jpeg" alt="Big Ass Fans es6" />
</p>

# homebridge-bigassfans-2 v1.1.39

`homebridge-bigassfans-2` is a Homebridge platform plugin for Big Ass Fans i6, es6, Haiku H/I Series, and Haiku L Series ceiling fans running firmware 3.0 or newer.

This fork builds on [`homebridge-i6-bigAssFans`](https://github.com/oogje/homebridge-i6-bigAssFans) by [@oogje](https://github.com/oogje), modernizing the plugin for current Homebridge releases with Fanv2 controls, improved reconnect/state handling, safer parsing, live diagnostics, and a custom Homebridge Settings UI.

## Highlights

- Compatible with Homebridge 1.8+ and Homebridge 2.0.
- Uses HomeKit `Fanv2` for native fan controls.
- Maps Big Ass Fans **Whoosh** mode to HomeKit `SwingMode`.
- Maps Big Ass Fans fan auto mode to HomeKit `TargetFanState`.
- Supports fan speed, on/off, direction, lights, color temperature, Eco Mode, occupancy, temperature, humidity, UVC, and standby LED features when supported by the fan.
- Keeps HomeKit state in sync with changes made outside HomeKit, including the Big Ass Fans app, on the next state refresh.
- Includes a custom Settings UI with per-fan diagnostics and conservative capability-based suggestions.

See [Release Notes.md](https://github.com/applemanj/homebridge-bigAssFans-2/blob/main/Release%20Notes.md) for the full release history.

## What's New

**v1.1.39**

- Removed the large platform-name panel from the normal admin UI flow.
- Moved Save Settings and configuration status into the page header.
- Improved status badge contrast for better readability in Homebridge dark mode.
- Tightened this README for public npm/GitHub presentation.

## Requirements

- Homebridge 1.8.0 or newer, including Homebridge 2.0.
- Node.js 20.15.1 or newer. Node 20, 22, and 24 are tested in CI.
- A supported Big Ass Fans / Haiku fan on the same network as Homebridge.
- The fan's IP address or hostname and MAC address from the Big Ass Fans app Wi-Fi settings.

## Installation

Install through the Homebridge UI, or install from npm:

```sh
sudo npm install -g homebridge-bigassfans-2
```

For a GitHub install:

```sh
sudo npm install -g applemanj/homebridge-bigAssFans-2
```

## Configuration

Add the `BigAssFans-i6` platform in your Homebridge `config.json`.

The `platform` value intentionally remains `"BigAssFans-i6"` for compatibility with the original plugin. The Homebridge Settings UI includes a custom admin page for this plugin and is the easiest way to configure fans, test connectivity, and review detected capabilities.

### Minimal Example

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

### Multi-Fan Example

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
          "showEcoModeSwitch": true
        }
      ]
    }
  ]
}
```

### Recommended Approach

Start with the required fields only:

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

Then let the plugin detect each fan's capabilities at startup. Add optional fields only when you want to expose extra HomeKit services or override detection.

Common optional choices:

- Use `noLights: true` to hide all light-related controls.
- Use `disableDirectionControl: true` to hide the fan reverse/direction control.
- Use `downlightEquipped` or `uplightEquipped` only when auto-detection is wrong.
- Use `showTemperature` or `showHumidity` to control sensor exposure when the fan supports those sensors.

## Configuration Fields

### Platform Fields

| Field | Required | Description |
|-------|----------|-------------|
| `platform` | Yes | Must be `"BigAssFans-i6"`. |
| `name` | Yes | Display name for this Homebridge platform instance. |
| `fans` | Yes | Array of fan objects to expose. |

### Fan Identity Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Display name for the fan in HomeKit. |
| `ip` | Yes | IP address, DNS hostname, or mDNS `.local` hostname. |
| `mac` | Yes | Fan MAC address from the Big Ass Fans app Wi-Fi settings. |

### Optional HomeKit Services

| Field | Default | Description |
|-------|---------|-------------|
| `showFanAutoSwitch` | `false` | Adds a legacy separate Fan Auto switch. Fan Auto is also available natively in the fan tile. |
| `showLightAutoSwitch` | `false` | Adds Light Auto when the fan has lights. |
| `showDimToWarmSwitch` | `false` | Adds Dim to Warm when supported by the fan. |
| `showEcoModeSwitch` | `false` | Adds Eco Mode when supported by the fan. |
| `showHumidity` | `true` | Exposes humidity when supported by the fan. |
| `showTemperature` | `true` | Exposes temperature when supported by the fan. |
| `showFanOccupancySensor` | `false` | Exposes fan occupancy when supported by the fan. |
| `showLightOccupancySensor` | `false` | Exposes light occupancy when supported by the fan. |
| `showStandbyLED` | `false` | Exposes night light / standby LED controls when supported by the fan. Hidden if `noLights` is enabled. |
| `enableIncrementalButtons` | `false` | Adds momentary +/- buttons for brightness and fan speed. |

### Advanced Fields

| Field | Default | Description |
|-------|---------|-------------|
| `probeFrequency` | `60000` | Keep-alive and state-refresh interval in milliseconds. Set to `0` to disable periodic probing. |
| `noLights` | `false` | Hides all light-related services, including downlight, uplight, UVC, and standby LED controls. |
| `disableDirectionControl` | `false` | Hides the fan direction/reverse control in HomeKit. |
| `downlightEquipped` | `"auto"` | Downlight detection mode. Use `"auto"` or omit for detection, `true` to force visible, or `false` to force hidden. |
| `uplightEquipped` | `"auto"` | Uplight detection mode. Use `"auto"` or omit for detection, `true` to force visible, or `false` to force hidden. |
| `incrementalButtonsDelay` | `500` | Auto-reset delay for optional +/- buttons, in milliseconds. |
| `enableDebugPort` | `false` | Enables a localhost-only TCP debug port for runtime debug level changes and detailed timing diagnostics. Leave off for normal use. |

## Custom Settings UI

The custom Homebridge Settings UI provides:

- A compact fan list focused on the fields most users need.
- Per-fan **Test Connection** checks.
- **Test All Fans** diagnostics.
- Live capability summaries when the fan reports capability details.
- Conservative suggested settings for options enabled in config but not reported by the fan.

Suggested settings only hide unsupported or inactive options. They do not automatically enable optional services or undo intentional light-control overrides. After applying suggestions, save settings and restart the child bridge so HomeKit can remove hidden services.

## Home App Terminology

Because this plugin uses Apple's native `Fanv2` service, the Home app uses Apple's generic fan labels:

| Home App Label | Big Ass Fans Feature |
|---|---|
| `Oscillate` | `Whoosh` |
| `Fan Mode: Manual` | Fan manual mode |
| `Fan Mode: Auto` | Big Ass Fans fan auto mode |

The behavior is mapped correctly; only the labels are Apple's.

## Migrating from homebridge-i6-bigAssFans

1. Uninstall the old plugin and install `homebridge-bigassfans-2`.
2. Keep `"platform": "BigAssFans-i6"` in your config.
3. Remove `showWhooshSwitch`; Whoosh is now native `SwingMode` in the fan tile.
4. Treat `showFanAutoSwitch` as optional; Fan Auto is now native `TargetFanState` in the fan tile.
5. Clear the Homebridge accessory cache if HomeKit shows duplicate or stale services after migration.

## Troubleshooting

1. Confirm the fan works in the official Big Ass Fans app.
2. Use the plugin Settings UI **Test Connection** or **Test All Fans** diagnostics.
3. Check the Homebridge startup log for each fan's detected capability summary.
4. If external app changes are slow to appear in HomeKit, lower `probeFrequency` from the default `60000` to a value such as `10000` or `15000`.
5. If stale services remain after changing optional service settings, save settings, restart the child bridge, and clear the Homebridge accessory cache if needed.
6. If HomeKit shows stale state, `No Response`, or ignores changes while plugin logs look healthy, reboot your Apple Home Hubs.
7. Leave `enableDebugPort` off unless actively troubleshooting. When enabled, it listens on `127.0.0.1` only.

## Tips

- If Apple's Home app will not let you change the fan icon while grouped as one tile, switch to **Show as Separate Tiles**, change the icon, then switch back to **Show as Single Tile**.
- If a fan has no light and no optional services, temporarily add `"showTemperature": false`, restart, change the icon, then remove that setting.

## Acknowledgments

This fork builds on the work of [@oogje](https://github.com/oogje) and the contributors to [homebridge-i6-bigAssFans](https://github.com/oogje/homebridge-i6-bigAssFans).

Special thanks to:

- [@bdraco](https://github.com/bdraco) for identifying the protobuf protocol.
- [@jfroy](https://github.com/jfroy) for building a working BAF protobuf controller.
- [@pponce](https://github.com/pponce), [@knmorgan](https://github.com/knmorgan), [@aveach](https://github.com/aveach), and the users who reported issues and helped debug.
- [HAP-NodeJS](https://github.com/KhaosT/HAP-NodeJS), [Homebridge](https://github.com/homebridge/homebridge), and [Big Ass Fans](https://www.bigassfans.com).

## License

MIT
