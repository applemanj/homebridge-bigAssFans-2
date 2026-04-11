## Release Notes

### v1.0.2

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
