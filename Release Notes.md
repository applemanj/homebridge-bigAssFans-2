## Release Notes

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
