## Release Notes

### v1.1.27

**Polish**
- Gated speed and on-off diagnostic timing logs behind `enableDebugPort`, keeping normal installations quiet while preserving the troubleshooting path.
- Updated the Homebridge UI schema wording for `probeFrequency` to reflect that it controls both keep-alive probes and state refreshes.
- Added the regression harness to `prepublishOnly` so manual npm publishes run the same safety checks as CI.

---

### v1.1.26

**HomeKit Control**
- Accepted matching fan speed reports that arrive during the debounce window instead of ignoring them as stale, which should prevent the first low-speed request from appearing to take a full probe cycle.
- Added regression coverage for the matching-report-during-debounce path.

---

### v1.1.25

**HomeKit Control**
- Updated the `Active` on-off path to update HomeKit immediately instead of waiting for the fan echo, which should make the first on request feel more responsive.
- Suppressed rapid duplicate `Active` writes so HomeKit bursts do not resend the same on-off command multiple times.
- Added regression coverage for the optimistic `Active` update and duplicate-write suppression.

---

### v1.1.24

**Diagnostics**
- Cleared stale speed-diagnostic state when the fan turns off or the socket/write path fails, so later off-state speed echoes no longer get logged against an older speed request.
- Added regression coverage for resetting speed-diagnostic state after a fan-off event.

---

### v1.1.23

**Diagnostics**
- Added temporary `Active` / on-off diagnostics so logs now show when HomeKit sends an on-off request and when the fan reports its on-off state back.
- Added regression coverage for the on-off diagnostic path.

---

### v1.1.22

**HomeKit Control**
- Fixed low-end slider mapping so very small nonzero HomeKit percentages now clamp to the fan's minimum real speed instead of rounding down to off.
- Added regression coverage for low nonzero slider values such as `1%`.

---

### v1.1.21

**HomeKit Control**
- Deferred the HomeKit preset snap until the debounced speed write actually fires, so slider drags are no longer rewritten to intermediate presets while the user is still moving the control.
- Added regression coverage to ensure rapid slider drags collapse to one final discrete fan-speed write.

---

### v1.1.20

**HomeKit Control**
- Smoothed out HomeKit speed slider drags by coalescing rapid slider writes into the final discrete fan step instead of sending every intermediate percentage.
- Briefly ignores mismatched fan speed echoes right after a HomeKit speed change so older device reports do not snap the slider back to a stale preset.
- Added regression coverage for the stale-echo suppression path.

---

### v1.1.19

**HomeKit Control**
- Updated the HomeKit speed slider path to snap immediately to the nearest supported preset instead of waiting for the fan's state echo.
- This keeps the UI aligned with the fan's 7-step speed model as soon as the command is sent, while still reconciling against the real device report afterward.
- Added regression coverage for the optimistic snap behavior.

---

### v1.1.18

**Diagnostics**
- Added temporary speed-path diagnostics so logs show when HomeKit sends a slider speed request and when the fan first reports a speed back.
- Included the requested percentage, mapped device speed, write payload, and elapsed time to the first fan speed report.
- Added regression coverage to ensure the diagnostic state is recorded and cleared correctly.

---

### v1.1.17

**Code Cleanup**
- Added a shared internal types module so platform config and accessory context stay in sync.
- Broke the remaining `platform.ts` / `platformAccessory.ts` circular dependency by moving the shared platform shape into a neutral module.
- Removed one confirmed dead-code mystery-tracker path and tightened a few low-risk internal helper/property types.
- Improved socket write warnings to include the underlying error message for easier troubleshooting.

---

### v1.1.16

**Verification / Packaging**
- Removed the `homebridge` `peerDependencies` entry so npm no longer auto-installs Homebridge during plugin installation.
- This also prevents `hap-nodejs` from being pulled in through Homebridge as part of the plugin install tree.
- Kept the supported Homebridge versions declared in `engines.homebridge`, which is what the current Homebridge template and verifier expect.

---

### v1.1.15

**Verification / Packaging**
- Added the explicit `homepage` package metadata expected by the Homebridge verification checks.
- Updated `config.schema.json` to use proper object-level `required` arrays instead of per-field `required` booleans.
- Added the top-level platform `name` field to the schema and aligned the README config examples with the Homebridge Settings UI.

**Documentation**
- Added a troubleshooting note to reboot Home Hubs when the plugin logs look healthy but HomeKit still shows stale state or `No Response`.
- Clarified that `enableDebugPort` should usually be turned back off after a debugging session.

---

### v1.1.14

**HomeKit Control**
- Simplified the HomeKit fan-speed control path by removing the recent auto-to-manual handoff, stale-speed suppression guard, and queued-write delay logic.
- This intentionally moves the plugin back toward the simpler direct-write behavior from earlier fork releases while keeping the unrelated parser, reconnect, and cache fixes.
- Added regression coverage for the simplified direct speed-write path.

---

### v1.1.13

**HomeKit Control**
- Added a short-lived expected-speed guard so stale inbound fan updates do not immediately overwrite a speed change that HomeKit just sent.
- Clear that guard as soon as the commanded speed is observed so normal follow-up state changes keep flowing without waiting for the full timeout.
- Added regression coverage for the stale-update suppression path.

---

### v1.1.12

**HomeKit Control**
- Added a small per-fan outbound command queue so repeated HomeKit commands are serialized with a short gap instead of being blasted to the fan back-to-back.
- This is intended to reduce command storms that can leave the accessory in a `No Response` state after several rapid HomeKit interactions.
- Added regression coverage for queued client writes alongside the earlier auto-to-manual speed-control tests.

---

### v1.1.11

**HomeKit Control**
- Adjusted the HomeKit manual speed-control path again so the plugin waits briefly after switching the fan out of Big Ass Fans auto mode before sending the requested manual speed.
- This better mirrors the older “turn auto off, then change speed” flow and is intended to stop the speed slider from snapping back to the externally managed value.
- Added regression coverage for the delayed auto-to-manual speed transition.

---

### v1.1.10

**HomeKit Control**
- Fixed HomeKit fan speed changes while Big Ass Fans auto mode is active by explicitly switching the fan to manual mode before sending the requested speed.
- This prevents the next fan refresh from snapping the Home app slider back to the externally managed auto-mode speed.
- Added regression coverage for the auto-to-manual speed-control transition.

---

### v1.1.9

**HomeKit Compatibility**
- Adjusted the auto-mode idle mapping so fans in Big Ass Fans auto mode at speed `0` are reported to HomeKit as inactive instead of active at `0%`.
- This avoids the Home app control path that could leave the accessory in a `Not Responding` state after the earlier zero-speed sync changes.
- `TargetFanState` still remains `Auto`, so the fan stays in automatic mode while HomeKit sees a safer inactive current state.

---

### v1.1.8

**State Sync**
- Reissued the zero-speed auto-mode state sync fix under a new npm version so the latest release can be published cleanly.
- Fans running in Big Ass Fans auto mode at speed `0` now report `RotationSpeed = 0%` in HomeKit instead of leaving a stale nonzero percentage behind.
- `Active` / `CurrentFanState` continue to reflect the correct auto idle state, with regression coverage retained for the zero-speed mapping path.

---

### v1.1.7

**State Sync**
- Fixed auto-mode state reporting so a fan running in Big Ass Fans auto mode at speed `0` no longer leaves a stale nonzero speed in HomeKit.
- HomeKit `RotationSpeed` now updates back to `0%` when the fan reports zero speed, while `Active` / `CurrentFanState` continue to reflect the correct auto idle state.
- Added regression coverage for zero-speed rotation updates and percentage mapping.

---

### v1.1.6

**Light Detection**
- Improved downlight auto-detection compatibility for fans that expose color-temperature control but underreport the primary downlight capability flag.
- Downlight services now refresh correctly if capability information improves after the initial startup message.
- Added regression coverage for downlight inference and override precedence.

---

### v1.1.5

**State Sync**
- Fixed fan-only and `noLights` configurations so inbound fan updates are no longer blocked waiting for a light target selector message.
- External fan changes from the Big Ass Fans app now propagate back into HomeKit correctly even when the accessory has no light services.
- Added regression coverage for fan state dispatch when `targetBulb` is unknown.

---

### v1.1.4

**State Sync**
- External fan changes made in the Big Ass Fans app are now pulled back into HomeKit on the next probe cycle, even when the fan does not send an unsolicited state update.
- HomeKit `Active` and `CurrentFanState` now stay in sync more reliably for external auto-mode transitions.
- Added regression coverage for periodic state refresh and external auto-mode synchronization.

---

### v1.1.3

**State Sync**
- External fan changes made in the Big Ass Fans app now update HomeKit `Active` and `CurrentFanState` more reliably, including auto-mode transitions.
- Added a regression test covering external auto-mode state synchronization.

---

### v1.1.2

**UX / Logging**
- Added startup capability summary logging so users can see which fan capabilities were detected and which services are exposed or hidden by config.
- Added README guidance recommending a minimal config first, then adding overrides only when needed.

---

### v1.1.1

**Testing / Packaging**
- Added a lightweight regression harness covering parser and reconnect edge cases.
- Synchronized package metadata and lockfile versioning with the current release.

---

### v1.1.0

**Bug Fixes**
- **Standby LED naming crash** — `makeStandbyLED` was calling `setName` on `downlightBulbService` instead of `standbyLEDBulbService`, crashing on fans without a downlight and renaming the wrong service when present.
- **Standby LED color corruption** — RGB values ≥ 128 were sent as single bytes, but protobuf varints for 128-255 require two bytes. Messages now use proper varint encoding with dynamic length calculation.
- **Standby color preset crash** — Out-of-bounds preset index from the fan (≥ 10 or < 0) caused an uncaught TypeError. Now validated with a warning log.
- **Light auto switch crash** — `targetedlightOnState` called `updateCharacteristic` on the light auto switch service without checking if it was configured, crashing when `showLightAutoSwitch` was false.
- **Target bulb double execution** — `setTargetBulb` was called immediately AND inserted into the funStack, causing it to run twice and potentially re-setting the target to a stale value.
- **Incremental button cache cleanup** — `zapService` used wrong names (`downlightDarkenService` vs actual `downlightDarkenButton`), so cached button services were never cleaned up when `enableIncrementalButtons` was disabled.
- **ETIMEDOUT backoff typo** — Retry progression had a 5-day value (432000s) before the 1-day max (86400s). Fixed to 12 hours (43200s).
- **Silent disconnection** — Added `close` event handler on the TCP socket so clean FIN packets from the fan trigger reconnection instead of leaving the connection silently dead.
- **Socket leak on reconnect** — Old socket is now explicitly destroyed with listeners removed before creating a new connection, preventing dual event handling.
- **Varint decoding overflow** — Bitwise `r << 7` truncates at 2²⁸ for 32-bit signed integers. Replaced with `r * 128 + a[index]` to handle large values like uptime timestamps correctly.

**Improvements**
- `messagesLogged` changed from unbounded array to `Set` for O(1) lookup and to prevent memory growth over long runtimes.
- SLIP unstuffing now handles lone ESC at end of buffer gracefully instead of reading past the buffer.
- Removed dead code: `sortFunction`, `codeWatch`, `fanOnMeansAuto`, `lightOnMeansAuto`.
- Added type annotations: `client` (`net.Socket | undefined`), `probeTimeout` (`ReturnType<typeof setInterval> | undefined`).

---

### v1.0.3

**Security / Reliability**
- Hardened protobuf parsing so malformed or truncated frames are dropped with a warning instead of risking a stuck parse loop.
- Bound the optional debug TCP port to `127.0.0.1` only, preserving local debugging while removing LAN exposure.

**Behavior**
- Removed fans that are no longer present in `config.fans` are now automatically unregistered from the Homebridge accessory cache.

**UI / Docs**
- Expanded `config.schema.json` so the Homebridge UI now exposes the additional documented options from the README.
- Updated README configuration docs to match the current UI and debug-port behavior.

### v1.0.0 (homebridge-bigassfans-2 fork)

**Breaking Changes**
- Requires **Homebridge 1.8.0** or newer (including Homebridge 2.0).
- Requires **Node.js 20** or newer. Node 18 is no longer supported.
- Fan service upgraded from `Fan` to `Fanv2`. Clear your accessory cache after upgrading.
- `showWhooshSwitch` config option removed -- Whoosh is now native `SwingMode` in the fan tile.

**Fanv2 Upgrade**
- `Active` characteristic replaces `On` (0=Inactive, 1=Active).
- `TargetFanState` provides native Auto mode (0=Manual, 1=Auto) in the fan tile.
- `CurrentFanState` reports Inactive, Idle, or Blowing Air.
- `SwingMode` provides native Whoosh control (0=Disabled, 1=Enabled) in the fan tile.
- Legacy `Fan` service and `whooshSwitch` are automatically removed from cache on upgrade.
- `showFanAutoSwitch` still works for users who prefer a separate switch.

**Bug Fixes**
- Reconnection now re-sends init and capability query to the fan (fixes upstream #41 -- daily restart required).
- All connection errors trigger automatic retry with backoff (fixes upstream #35 -- fans offline at startup).
- Removed forced IPv4 from TCP connection (fixes upstream #29 -- mDNS hostnames broken).
- Fixed `varint_encode` operator precedence bug (`| 0x80` applied to wrong value).
- Fixed module-level state shared across fan instances (multi-fan cross-talk bug).

**Code Quality**
- Removed unnecessary `declare const Buffer`.
- Fixed `debugLevels` type from `number[]` to `Record<string, number>`.
- Fixed `mysteryProperties` type from `string|number[]` to `Record<string, string|number>`.
- Modernized `import net = require('net')` to ES module import syntax.
- Updated ESLint config (removed deprecated `@typescript-eslint/semi` and `member-delimiter-style`).
- Updated `tsconfig.json` with `skipLibCheck` for HB2 compatibility.
- Stale chunk fragments cleared on reconnect.

---

*Release notes for the original homebridge-i6-bigassfans plugin (v0.6.1 and earlier) can be found in the [upstream repository](https://github.com/oogje/homebridge-i6-bigAssFans/blob/main/Release%20Notes.md).*
