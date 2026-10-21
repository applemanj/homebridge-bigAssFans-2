const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const script = fs.readFileSync(path.join(__dirname, "../homebridge-ui/public/index.js"), "utf8");
const clone = (value) => JSON.parse(JSON.stringify(value));
const tick = () => new Promise((resolve) => setImmediate(resolve));

// Small DOM fixture: run the shipped page and its event handlers without a browser dependency.
class Element {
  constructor(tag = "div") {
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.listeners = {};
    this.className = "";
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.classList = {
      add: (...names) => { this.className = [...new Set([...this.classes(), ...names])].join(" "); },
      remove: (...names) => { this.className = this.classes().filter((name) => !names.includes(name)).join(" "); },
      toggle: (name, on) => { this.classList[on ? "add" : "remove"](name); },
    };
  }
  classes() { return this.className.split(/\s+/).filter(Boolean); }
  set innerHTML(value) { assert.equal(value, ""); this.children = []; }
  append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
  appendChild(node) { node.parent = this; this.children.push(node); return node; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  dispatch(type) {
    for (const listener of this.listeners[type] || []) { listener({ target: this }); }
    if (type === "input" || type === "change") { this.parent?.dispatch(type); }
  }
  matches(selector) {
    if (selector.startsWith(".")) { return this.classes().includes(selector.slice(1)); }
    const attr = /^\[data-([\w-]+)="([^"]+)"\]$/.exec(selector);
    if (attr) { return this.dataset[attr[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())] === attr[2]; }
    return this.tagName === selector;
  }
  querySelectorAll(selector) {
    const parts = selector.split(" ");
    const result = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child.matches(parts.at(-1))) {
          let parent = child.parent;
          let index = parts.length - 2;
          while (parent && index >= 0) {
            if (parent.matches(parts[index])) { index--; }
            parent = parent.parent;
          }
          if (index < 0) { result.push(child); }
        }
        visit(child);
      }
    };
    visit(this);
    return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector); }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter((node) => node !== this); } }
}

const existingFan = { name: "Existing fan", ip: "existing.local", mac: "00:11:22:33:44:55", customOption: "keep" };
const config = {
  platform: "BigAssFans-i6", name: "Big Ass Fans", fans: [existingFan],
  _bridge: { username: "00:00:00:00:00:01", port: 30101 }, customPlatformOption: "keep",
};

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function openPage(configs = [config], options = {}) {
  const elements = new Map();
  const listeners = {};
  const host = {
    draft: clone(configs), saved: clone(configs), saveEnabled: true,
    updates: [], saves: 0, requests: [], toasts: [], failUpdate: false,
    updateGate: undefined, getGate: options.getGate,
  };
  const homebridge = {
    addEventListener: (event, callback) => { listeners[event] = callback; },
    getPluginConfig: async () => {
      if (host.getGate) { await host.getGate.promise; }
      return clone(host.draft);
    },
    updatePluginConfig: async (configs) => {
      const snapshot = clone(configs);
      host.updates.push(snapshot);
      if (host.updateGate) { await host.updateGate.promise; }
      if (host.failUpdate) { throw new Error("Simulated config update failure"); }
      host.draft = snapshot;
      return clone(snapshot);
    },
    savePluginConfig: async () => { host.saved = clone(host.draft); host.saves++; },
    disableSaveButton: () => { host.saveEnabled = false; },
    enableSaveButton: () => { host.saveEnabled = true; },
    request: async (route, body) => {
      host.requests.push({ route, body: clone(body) });
      if (options.requestGate) { await options.requestGate.promise; }
      return { ok: true, result: { ok: true, mac: "AA:BB:CC:DD:EE:FF", capabilities: { hasLight: true, hasUplight: true } } };
    },
    toast: Object.fromEntries(["success", "warning", "error"].map((level) => [level, (message) => host.toasts.push({ level, message })])),
  };
  const context = vm.createContext({
    window: { homebridge },
    document: {
      getElementById: (id) => {
        if (!elements.has(id)) { elements.set(id, new Element()); }
        return elements.get(id);
      },
      createElement: (tag) => new Element(tag),
    },
    setTimeout: (callback, delay) => { const timer = setTimeout(callback, delay); timer.unref(); return timer; },
  });
  vm.runInContext(script, context, { filename: "homebridge-ui/public/index.js" });
  listeners.ready();
  const settle = async () => { for (let i = 0; i < 12; i++) { await tick(); } };
  await settle();
  const cards = () => elements.get("fans-list").querySelectorAll(".fan-card");
  const edit = (index, key, value) => {
    const input = cards()[index].querySelector(`[data-fan-field="${key}"]`);
    assert.ok(input, `Missing ${key}`);
    if (input.type === "checkbox") { input.checked = value; } else { input.value = value; }
    input.dispatch(input.type === "checkbox" ? "change" : "input");
  };
  const add = () => {
    elements.get("add-fan").dispatch("click");
    const index = cards().length - 1;
    edit(index, "name", "New es6");
    edit(index, "ip", "new-fan.local");
    edit(index, "mac", "AA:BB:CC:DD:EE:FF");
    return index;
  };
  const hostSave = async () => {
    assert.equal(host.saveEnabled, true, "Homebridge Save should be enabled");
    await homebridge.savePluginConfig();
  };
  return { host, elements, context, cards, edit, add, hostSave, settle };
}

test("add, test connection, and use Homebridge Save: the new fan survives reopening", async () => {
  const page = await openPage();
  const index = page.add();
  const button = page.cards()[index].querySelectorAll("button").find((b) => b.textContent === "Test Connection");
  button.dispatch("click");
  await page.settle();
  assert.equal(page.host.requests[0].body.fan.name, "New es6");
  assert.equal(page.host.saves, 0, "Editing and testing must not save to disk");
  await page.hostSave();
  assert.equal(page.host.saved[0].fans.length, 2);
  assert.deepEqual(page.host.saved[0]._bridge, config._bridge);
  assert.equal(page.host.saved[0].fans[0].customOption, "keep");
  assert.equal(page.host.saved[0].customPlatformOption, "keep");
  const reopened = await openPage(page.host.saved);
  assert.equal(reopened.cards().length, 2);
  assert.equal(reopened.cards()[1].querySelector('[data-fan-field="name"]').value, "New es6");
});

test("edits, layout changes, platform name, and removing a fan reach Homebridge Save", async () => {
  const extra = { accessory: "Unrelated", name: "Preserve block" };
  const page = await openPage([config, extra]);
  page.add();
  page.edit(1, "dualLightModeControl", "channels");
  page.edit(1, "showStandbyLED", true);
  page.elements.get("platform-name").value = "Fans at home";
  page.elements.get("platform-name").dispatch("input");
  const remove = page.cards()[0].querySelectorAll("button").find((b) => b.textContent === "Remove Fan");
  remove.dispatch("click");
  await page.settle();
  await page.hostSave();
  assert.equal(page.host.saved[0].name, "Fans at home");
  assert.equal(page.host.saved[0].fans.length, 1);
  assert.equal(page.host.saved[0].fans[0].dualLightModeControl, "channels");
  assert.equal(page.host.saved[0].fans[0].showStandbyLED, true);
  assert.deepEqual(page.host.saved[1], extra);
});

test("an incomplete fan cannot save the previous configuration by mistake", async () => {
  const page = await openPage();
  page.elements.get("add-fan").dispatch("click");
  await page.settle();
  assert.equal(page.host.saveEnabled, false);
  page.edit(1, "name", "New es6");
  page.edit(1, "ip", "new-fan.local");
  page.edit(1, "mac", "not-a-mac");
  await page.settle();
  assert.equal(page.host.saveEnabled, false);
  page.edit(1, "mac", "AA:BB:CC:DD:EE:FF");
  await page.settle();
  assert.equal(page.host.saveEnabled, true);
});

test("an older update cannot overwrite newer edits or enable Save early", async () => {
  const page = await openPage();
  const gate = deferred();
  page.host.updateGate = gate;
  page.edit(0, "name", "First edit");
  await page.settle();
  page.edit(0, "name", "Latest edit");
  assert.equal(page.host.saveEnabled, false);
  gate.resolve();
  await page.settle();
  await page.hostSave();
  assert.equal(page.host.saved[0].fans[0].name, "Latest edit");
});

test("the top Save waits for draft updates and persists the latest edit", async () => {
  const page = await openPage();
  const gate = deferred();
  page.host.updateGate = gate;
  page.add();
  const saving = vm.runInContext("saveSettings()", page.context);
  await page.settle();
  assert.equal(page.host.saves, 0);
  page.edit(1, "name", "Final es6 name");
  gate.resolve();
  await saving;
  assert.equal(page.host.saved[0].fans[1].name, "Final es6 name");
  assert.equal(page.host.saves, 1);
});

test("reverting an edit still waits for the older in-flight draft to finish", async () => {
  const page = await openPage();
  const gate = deferred();
  page.host.updateGate = gate;
  page.edit(0, "name", "Temporary edit");
  await page.settle();
  page.edit(0, "name", existingFan.name);
  assert.equal(page.host.saveEnabled, false);
  gate.resolve();
  await page.settle();
  await page.hostSave();
  assert.equal(page.host.saved[0].fans[0].name, existingFan.name);
});

test("a failed draft update blocks Save and can be retried with the top button", async () => {
  const page = await openPage();
  page.host.failUpdate = true;
  page.add();
  await page.settle();
  assert.equal(page.host.saveEnabled, false);
  assert.equal(page.host.saved[0].fans.length, 1);
  assert.ok(page.host.toasts.some((toast) => toast.level === "error"));
  page.host.failUpdate = false;
  await vm.runInContext("saveSettings()", page.context);
  assert.equal(page.host.saved[0].fans.length, 2);
  assert.equal(page.host.saveEnabled, true);
});

test("first-time setup creates a config block and preserves it on reopen", async () => {
  const page = await openPage([]);
  page.add();
  await page.settle();
  await page.hostSave();
  assert.equal(page.host.saved.length, 1);
  const reopened = await openPage(page.host.saved);
  assert.equal(reopened.cards().length, 1);
});

test("Homebridge Save stays disabled while the existing configuration loads", async () => {
  const gate = deferred();
  const page = await openPage([config], { getGate: gate });
  assert.equal(page.host.saveEnabled, false);
  gate.resolve();
  await page.settle();
  assert.equal(page.host.saveEnabled, true);
  assert.equal(page.cards().length, 1);
});

test("name and IP can be tested before options; the discovered MAC and selected options save", async () => {
  const page = await openPage([]);
  page.elements.get("add-fan").dispatch("click");
  page.edit(0, "name", "New es6");
  page.edit(0, "ip", "new-fan.local");
  await page.settle();
  assert.equal(page.host.saveEnabled, false, "Missing MAC still prevents saving");
  const card = page.cards()[0];
  const button = card.querySelectorAll("button").find((b) => b.textContent === "Test Connection");
  const controls = card.querySelectorAll("input");
  assert.deepEqual(controls.slice(0, 2).map((input) => input.dataset.fanField), ["name", "ip"]);
  assert.ok(card.children.indexOf(button.parent) < card.children.indexOf(card.querySelector(".setting-section")));
  button.dispatch("click");
  await page.settle();
  assert.equal(page.host.requests[0].body.fan.mac, "");
  assert.equal(page.cards()[0].querySelector('[data-fan-field="mac"]').value, "AA:BB:CC:DD:EE:FF");
  assert.equal(page.cards()[0].querySelector(".pill").textContent, "Features detected");
  page.edit(0, "dualLightModeControl", "channels");
  page.edit(0, "showStandbyLED", true);
  await page.settle();
  assert.equal(page.cards()[0].querySelector(".pill").textContent, "Features detected");
  await page.hostSave();
  assert.equal(page.host.saved[0].fans[0].mac, "AA:BB:CC:DD:EE:FF");
  assert.equal(page.host.saved[0].fans[0].dualLightModeControl, "channels");
  assert.equal(page.host.saved[0].fans[0].showStandbyLED, true);
});

test("testing preserves an existing HomeKit MAC and warns about a different fan", async () => {
  const page = await openPage();
  page.cards()[0].querySelectorAll("button").find((b) => b.textContent === "Test Connection").dispatch("click");
  await page.settle();
  assert.equal(page.cards()[0].querySelector('[data-fan-field="mac"]').value, existingFan.mac);
  assert.match(page.cards()[0].querySelector(".connection-result").textContent, /reported MAC differs/);
  page.edit(0, "ip", "another-fan.local");
  assert.equal(page.cards()[0].querySelector(".pill").textContent, "Not tested");
});

test("a test for a previous IP cannot fill the MAC or mark the new address detected", async () => {
  const gate = deferred();
  const page = await openPage([], { requestGate: gate });
  page.elements.get("add-fan").dispatch("click");
  page.edit(0, "name", "Fan");
  page.edit(0, "ip", "first.local");
  page.cards()[0].querySelectorAll("button").find((b) => b.textContent === "Test Connection").dispatch("click");
  page.edit(0, "ip", "second.local");
  gate.resolve();
  await page.settle();
  assert.equal(page.cards()[0].querySelector('[data-fan-field="mac"]').value, "");
  assert.equal(page.cards()[0].querySelector(".pill").textContent, "Not tested");
  assert.equal(page.host.saveEnabled, false);
});

test("Both / Up single-switch mode survives Save and reopening", async () => {
  const page = await openPage();
  page.edit(0, "dualLightModeControl", "both-up");
  await page.settle();
  await page.hostSave();
  assert.equal(page.host.saved[0].fans[0].dualLightModeControl, "both-up");
  const reopened = await openPage(page.host.saved);
  assert.equal(reopened.cards()[0].querySelector('[data-fan-field="dualLightModeControl"]').value, "both-up");
});

test("Both only without mode switches survives Save and reopening", async () => {
  const page = await openPage();
  page.edit(0, "dualLightModeControl", "both-only");
  await page.settle();
  await page.hostSave();
  assert.equal(page.host.saved[0].fans[0].dualLightModeControl, "both-only");
  const reopened = await openPage(page.host.saved);
  assert.equal(reopened.cards()[0].querySelector('[data-fan-field="dualLightModeControl"]').value, "both-only");
});

for (const mode of ["separate-dimmers", "separate-dimmers-both"]) {
  test(`${mode} survives Save and reopening`, async () => {
    const page = await openPage();
    page.edit(0, "dualLightModeControl", mode);
    await page.settle();
    await page.hostSave();
    assert.equal(page.host.saved[0].fans[0].dualLightModeControl, mode);
    const reopened = await openPage(page.host.saved);
    assert.equal(reopened.cards()[0].querySelector('[data-fan-field="dualLightModeControl"]').value, mode);
  });
}

test("legacy dual-light settings migrate to exclusive with only supported layouts offered", async () => {
  const old = clone(config);
  old.fans[0].dualLightModeControl = "legacy";
  const page = await openPage([old]);
  const select = page.cards()[0].querySelector('[data-fan-field="dualLightModeControl"]');
  assert.deepEqual(select.children.map((option) => option.value),
    ["exclusive", "channels", "both-up", "both-only", "separate-dimmers", "separate-dimmers-both"]);
  assert.equal(select.value, "exclusive");
  await page.hostSave();
  assert.equal(page.host.saved[0].fans[0].dualLightModeControl, "exclusive");
  assert.equal(page.host.saved[0].fans[0].mac, existingFan.mac);
});

for (const legacy of [true, false, undefined]) {
  test(`legacy bothlightsControl=${legacy} keeps its layout through an unrelated edit and reopening`, async () => {
    const old = clone(config);
    if (legacy !== undefined) { old.fans[0].bothlightsControl = legacy; }
    const expected = legacy === true ? "separate-dimmers-both" : "separate-dimmers";
    const page = await openPage([old]);
    assert.equal(page.cards()[0].querySelector('[data-fan-field="dualLightModeControl"]').value, expected);
    assert.equal(page.host.saves, 0, "Opening settings must not save to disk");
    page.edit(0, "name", "Renamed fan");
    await page.settle();
    await page.hostSave();
    const saved = page.host.saved[0].fans[0];
    assert.equal(saved.dualLightModeControl, expected);
    assert.equal(saved.bothlightsControl, legacy);
    assert.equal(saved.customOption, "keep");
    const reopened = await openPage(page.host.saved);
    assert.equal(reopened.cards()[0].querySelector('[data-fan-field="dualLightModeControl"]').value, expected);
  });
}

for (const legacy of [true, false]) {
  test(`explicit exclusive replaces legacy bothlightsControl=${legacy} and survives reopening`, async () => {
    const old = clone(config);
    old.fans[0].bothlightsControl = legacy;
    const page = await openPage([old]);
    page.edit(0, "dualLightModeControl", "exclusive");
    await page.settle();
    await page.hostSave();
    assert.equal(page.host.saved[0].fans[0].dualLightModeControl, "exclusive");
    const reopened = await openPage(page.host.saved);
    assert.equal(reopened.cards()[0].querySelector('[data-fan-field="dualLightModeControl"]').value, "exclusive");
  });
}

test("adding a fan explicitly saves exclusive without changing the existing legacy fan", async () => {
  const page = await openPage();
  const index = page.add();
  assert.equal(page.cards()[index].querySelector('[data-fan-field="dualLightModeControl"]').value, "exclusive");
  await page.settle();
  await page.hostSave();
  assert.equal(page.host.saved[0].fans[0].dualLightModeControl, "separate-dimmers");
  assert.equal(page.host.saved[0].fans[index].dualLightModeControl, "exclusive");
  const reopened = await openPage(page.host.saved);
  assert.equal(reopened.cards()[index].querySelector('[data-fan-field="dualLightModeControl"]').value, "exclusive");
});

test("MAC-only setup can test and save while retaining automatic discovery", async () => {
  const page = await openPage([]);
  page.add();
  page.edit(0, "name", "Discovered Fan");
  page.edit(0, "ip", "");
  page.edit(0, "mac", "AA:BB:CC:DD:EE:FF");
  await page.settle();
  assert.equal(page.host.saveEnabled, true);
  page.cards()[0].querySelectorAll("button").find(b => b.textContent === "Test Connection").dispatch("click");
  await page.settle();
  assert.equal(page.host.requests[0].body.fan.ip, "");
  assert.equal(page.host.requests[0].body.fan.mac, "AA:BB:CC:DD:EE:FF");
  await page.hostSave();
  assert.equal(page.host.saved[0].fans[0].ip, "");
  assert.equal(page.host.saved[0].fans[0].mac, "AA:BB:CC:DD:EE:FF");
});

test("a discovery response for an old MAC cannot update the edited fan", async () => {
  const gate = deferred();
  const page = await openPage([], { requestGate: gate });
  page.add();
  page.edit(0, "name", "Fan");
  page.edit(0, "ip", "");
  page.edit(0, "mac", "AA:BB:CC:DD:EE:FF");
  page.cards()[0].querySelectorAll("button").find(b => b.textContent === "Test Connection").dispatch("click");
  page.edit(0, "mac", "11:22:33:44:55:66");
  gate.resolve();
  await page.settle();
  assert.equal(page.cards()[0].querySelector(".pill").textContent, "Not tested");
  assert.equal(page.cards()[0].querySelector('[data-fan-field="mac"]').value, "11:22:33:44:55:66");
});
