# Dual-light controls

Fans that report both a downlight and an uplight get one **White Light** tile with power, brightness and (when supported) color temperature.

When adding a fan, enter its name and either its IP address/hostname or MAC address, then use **Test Connection** directly below those fields. The test reads supported features and fills an empty MAC address field from the fan's identity report. Select your options and save. If the fan does not report its MAC, enter it from the BAF app's Wi-Fi settings before saving. Existing MAC addresses are preserved because they identify paired HomeKit accessories; a mismatch is shown for review. Testing does not save the configuration.

Choose **Dual-light mode controls** in the plugin settings:

- **Down / Up / Both — one selected** (`exclusive`, default): exactly one mode remains selected, including while the light is off. Turning the selected mode switch off leaves it selected.
- **Down + Up — combine switches** (`channels`): Down on / Up off selects Down; Up on / Down off selects Up; both on selects Both. Turning off the last selected switch turns on the other switch, so a valid mode always remains selected.
- **Both / Up — single switch** (`both-up`): one **Both Lights** switch. On selects Both; Off selects Up only. The switch retains the selected mode while the light is off. Both restores Down/Both's remembered brightness and Up restores Up's. There is no Down-only selector in this layout. Changes made in the BAF app or with the remote are still honored, including Down-only; select Both Lights on or off to return to Both or Up.

The legacy separate-dimmer option has been removed for dual-light fans. Existing `legacy` configurations use Down / Up / Both instead, and the settings UI saves the replacement value. Single-light fans keep their existing dimmer and accessory identity. For dual-light fans migrating from legacy controls, HomeKit scenes referencing the replaced dimmers may need updating.

In all coordinated layouts, mode switches select which lights the White Light dimmer controls. They do not control power. Turning White Light off or dimming it to zero retains the selected mode. Changing modes while off leaves the lights off; turning White Light on restores the selected mode's brightness. Mode changes while off do not send a brightness command, and off-state reports do not overwrite an existing remembered brightness.

Down and Up remember separate brightness levels. Entering Both restores Down's remembered level. Dimming in Both changes the shared output and Down's memory, leaving Up's memory alone. Memory is kept per accessory in Homebridge's cache and survives restarts. Until an individual mode has been used, it inherits the current level. Removing the accessory/cache also removes its brightness memory.

Changes made in the BAF app or with the remote are authoritative. Their reported brightness updates the memory for the reported mode. The plugin applies its restore rule when changing modes from HomeKit; it does not fight changes made by other controllers.

Incoming fan reports update HomeKit even while a HomeKit command is awaiting feedback. The protocol does not identify which controller made a change, so a differing report is accepted rather than held until it matches an older HomeKit target. Reports never generate a corrective brightness write. When two controllers send commands at once, the fan's processing order determines the resulting setting.

White-light readbacks are coalesced after slider changes and query lighting state only. Push feedback can cancel a pending readback. A feedback-timeout warning names the missing fields and includes the requested and reported states; it triggers a read query, not a retry of the command. It cannot establish why the fan failed to report. Color-temperature and Off commands do not restore brightness while the light is off.

## White temperature

HomeKit's white-temperature picker sends a Kelvin value through the local API, without restricting it to the four BAF app presets. The fan's reported minimum and maximum temperatures set the available range. Until those bounds arrive, the plugin uses a conservative 2700–4000 K range, expanded to include an already reported current temperature.

If firmware rounds a request to a supported value, the returned value is shown in HomeKit. API support for a numeric value does not establish the physical resolution of the LEDs. Dim to Warm can also change the reported temperature as brightness changes.

## Supported features

Capability detection uses the fan's local DeviceCapabilities report. The combined layout requires both white lights. A color-temperature capability by itself is not taken as evidence of a downlight when an uplight is present. Existing light-presence overrides remain available for firmware with incorrect reports.

Night-light controls require `hasStandbyLED` and the **Show standby LED controls** option. On the combined layout, the color tile replaces the redundant enable switch. **Off disables the night-light feature. On enables it**, preserving its color and restoring the last confirmed nonzero intensity if needed. The first On uses 25% if no previous intensity is known, and white if the fan reports an unconfigured custom black color. Firmware still decides when the standby light actually illuminates.

Enable, intensity, preset and RGB are sent together as a complete `StandbyLed` setting. Changing color or intensity must not clear the enable flag. HomeKit scene writes are combined into one update; explicit Off stays disabled, and zero intensity wins over a companion On command. Color-only changes preserve the current enable state. A positive intensity enables the feature unless the same scene explicitly turns it off.

Fan reports from the BAF app replace the displayed settings immediately, including reports that disable the feature. Only confirmed intensity is saved for later restoration. A missing response triggers a readback and a diagnostic warning, never a retry of an older command. The controls wait for the fan's first night-light settings report after connecting.

Temperature, humidity, occupancy and Eco services remain gated by their capability flags. Whoosh and Fan Auto can have named switches alongside native fan controls. Dim to Warm requires a color-temperature-capable light. Use **Test Connection** to inspect reported capabilities.

Example additional fields in an existing fan entry:

```json
{
  "dualLightModeControl": "exclusive",
  "showWhooshSwitch": true,
  "showFanAutoSwitch": true,
  "showLightAutoSwitch": true,
  "showDimToWarmSwitch": true,
  "showEcoModeSwitch": true,
  "showStandbyLED": true,
  "showTemperature": true,
  "showHumidity": true,
  "showFanOccupancySensor": true,
  "showLightOccupancySensor": true
}
```

Single-light and unlit fans retain their existing white-light layout. Hidden lights do not expose night-light controls. Switching layouts removes the replaced services; HomeKit scenes targeting an old light tile may need to be updated.

## Device validation

Automated tests cannot establish undocumented firmware behavior. Check these on the actual fan before installing this branch as the normal build:

1. Set Down to 25%, Up to 75%, then alternate modes. Each should return to its own level.
2. Enter Both from Up. Expect 25% on both emitters. Set Both to 45%, then check Down is 45% and Up is still 75%.
3. In the two-switch layout, start at Both 67% and turn Up off. Down must remain lit at 67%.
4. With only Down selected, turn Down off: Up should become selected. Reverse the test. Turn White Light off, change modes, and confirm the lights remain off while the switches show the new mode. Turn White Light on and check the selected mode and restored brightness.
5. Change modes and brightness through the remote and BAF app; check all HomeKit switches update together.
6. Run a scene that selects a mode and brightness together. Repeat with a different mode/level.
7. Move HomeKit's white-temperature picker between the app's presets. Inspect the returned value and whether the hardware rounds it.
8. With the white light off, disable the night light in BAF, then turn the HomeKit Night Light tile on. Confirm it becomes enabled in BAF. Change its color and intensity in HomeKit and confirm it stays enabled. Turn the tile off and confirm BAF shows disabled. Also change settings in BAF and confirm HomeKit follows, then check the fan's standby behavior with white lighting on/off.
9. Restart Homebridge and confirm memory survives. Disconnect the fan and confirm commands fail, then recover after reconnection.
10. Check another fan with one light and a device without a night light: neither should gain unsupported tiles.


### Zero brightness and restoring the light

Setting the White Light dimmer to zero sends Off. Turning it on again (including with Siri) restores the selected mode's remembered brightness. Both shares Down's memory; Up has its own. Waking the light explicitly sends its selected mode before brightness and power.

HomeKit does not report when a slider drag ends. Positive brightness writes less than 1.2 seconds apart are treated as one gesture. If that gesture ends in zero or Off, the brightness from before the gesture is retained instead of an intermediate value such as 1%. Pausing at a positive level for 1.2 seconds saves it, including an intentional 1%. A pause during a slow drag can therefore save an intermediate level. Different brightness values reported by the fan remain authoritative.

Mode-only feedback updates the HomeKit mode switches immediately, even when brightness arrives in a later frame. The plugin requests refreshed state without writing back over external changes.

### Separate HomeKit tiles for dual-light fans

Dual-light fans expose the following accessories through the same Homebridge bridge:

- The original Fan accessory, retaining its fan controls and optional sensors/switches.
- White Ambiance: one white-light dimmer with On/Off and supported color temperature.
- LED Back Light: one color-light accessory, only when supported and enabled in configuration.
- Light Mode: the configured Down/Up/Both or Down+Up switches together on one accessory. Both/Up has just one switch.

All tiles share one fan connection and lighting coordinator. Mode selection, brightness memory, BAF app feedback, and standby behavior are unchanged. Apple Home controls the visual presentation of each accessory; the mode accessory can be shown together without grouping it with the fan or lights.

This migration retains the original fan identity and stored brightness memory. The lights and mode controls gain separate accessory identities, so their room assignment, names, favorites, and scene/automation references may need updating in Apple Home. Do not delete or re-pair the bridge. Single-light fans retain their existing accessory layout. Disabling a light feature removes its separate accessory; removing a fan removes all its child accessories.

### Partial feedback during changes

A power-only or color-temperature-only report must not replay cached mode or
brightness values over a pending HomeKit change. Pending properties retain their
requested values until those properties are actually reported, or the existing
2.5-second feedback timeout restores the last reported state. Explicit differing
values still take effect immediately, including changes from the BAF app; the
plugin does not retry writes to fight them. Mode and brightness feedback can
arrive in either order without discarding a freshly reported brightness.
