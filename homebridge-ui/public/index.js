const PLATFORM_ALIAS = "BigAssFans-i6";
const DEFAULT_PLATFORM_NAME = "Big Ass Fans";

const elements = {
  platformName: document.getElementById("platform-name"),
  configStatus: document.getElementById("config-status"),
  fansEmpty: document.getElementById("fans-empty"),
  fansList: document.getElementById("fans-list"),
  addFan: document.getElementById("add-fan"),
  saveSettingsTop: document.getElementById("save-settings-top"),
  toastContainer: document.getElementById("toast-container"),
  refreshDiagnostics: document.getElementById("refresh-diagnostics"),
  diagnosticsSummary: document.getElementById("diagnostics-summary"),
  diagnosticsEmpty: document.getElementById("diagnostics-empty"),
  diagnosticsList: document.getElementById("diagnostics-list"),
};

const state = {
  configs: [],
  config: {
    platform: PLATFORM_ALIAS,
    name: DEFAULT_PLATFORM_NAME,
    fans: [],
  },
  diagnostics: {
    generatedAt: undefined,
    devices: [],
  },
};

const fanDefaults = {
  showFanAutoSwitch: false,
  showLightAutoSwitch: false,
  showDimToWarmSwitch: false,
  showEcoModeSwitch: false,
  disableDirectionControl: false,
  probeFrequency: 60000,
  noLights: false,
  showHumidity: true,
  showTemperature: true,
  downlightEquipped: "auto",
  uplightEquipped: "auto",
  showFanOccupancySensor: false,
  showLightOccupancySensor: false,
  showStandbyLED: false,
  enableIncrementalButtons: false,
  incrementalButtonsDelay: 500,
  enableDebugPort: false,
};

const booleanFields = [
  {
    key: "showFanAutoSwitch",
    label: "Fan Auto switch (legacy)",
    help: "Adds a separate Fan Auto switch. Fan Auto is also native in the fan tile.",
  },
  {
    key: "showLightAutoSwitch",
    label: "Light Auto switch",
    help: "Adds Light Auto when the fan has lights.",
  },
  {
    key: "showDimToWarmSwitch",
    label: "Dim to Warm switch",
    help: "Adds Dim to Warm when supported by the fan.",
  },
  {
    key: "showEcoModeSwitch",
    label: "Eco Mode switch",
    help: "Adds Eco Mode when supported by Haiku models.",
  },
  {
    key: "disableDirectionControl",
    label: "Disable direction control",
    help: "Hides the fan reverse/direction control in HomeKit.",
  },
  {
    key: "noLights",
    label: "Hide light controls",
    help: "Hides downlight, uplight, UVC, and standby LED services.",
  },
  {
    key: "showHumidity",
    label: "Show humidity sensor",
    help: "Exposes humidity when supported by the fan.",
  },
  {
    key: "showTemperature",
    label: "Show temperature sensor",
    help: "Exposes temperature when supported by the fan.",
  },
  {
    key: "showFanOccupancySensor",
    label: "Show fan occupancy sensor",
    help: "Exposes fan occupancy when supported by the fan.",
  },
  {
    key: "showLightOccupancySensor",
    label: "Show light occupancy sensor",
    help: "Exposes light occupancy when supported by the fan.",
  },
  {
    key: "showStandbyLED",
    label: "Show standby LED controls",
    help: "Exposes night light / standby LED controls when supported.",
  },
  {
    key: "enableIncrementalButtons",
    label: "Enable +/- buttons",
    help: "Adds momentary +/- buttons for brightness and fan speed.",
  },
  {
    key: "enableDebugPort",
    label: "Enable debug port",
    help: "Enables localhost-only runtime diagnostics. Leave off for normal use.",
  },
];

const knownFanFields = [
  "name",
  "ip",
  "mac",
  "probeFrequency",
  "incrementalButtonsDelay",
  "downlightEquipped",
  "uplightEquipped",
  ...booleanFields.map((field) => field.key),
];

function showToast(type, message) {
  if (
    window.homebridge &&
    window.homebridge.toast &&
    typeof window.homebridge.toast[type] === "function"
  ) {
    window.homebridge.toast[type](message);
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

async function request(path, body) {
  if (
    !window.homebridge ||
    typeof window.homebridge.request !== "function"
  ) {
    return {
      ok: false,
      message: "Homebridge UI request API is unavailable in preview.",
    };
  }

  try {
    return await window.homebridge.request(path, body);
  } catch (error) {
    return { ok: false, message: error.message || "Request failed." };
  }
}

async function loadConfig() {
  if (
    window.homebridge &&
    typeof window.homebridge.getPluginConfig === "function"
  ) {
    state.configs = await window.homebridge.getPluginConfig();
  }

  const existingConfig = state.configs.find(
    (entry) => entry.platform === PLATFORM_ALIAS
  );

  state.config = normalizeConfig(existingConfig);
  render();
}

function normalizeConfig(config) {
  const normalized = {
    ...(config || {}),
    platform: PLATFORM_ALIAS,
    name: (config && config.name) || DEFAULT_PLATFORM_NAME,
    fans: Array.isArray(config && config.fans) ? [...config.fans] : [],
  };

  return normalized;
}

function render() {
  elements.platformName.value = state.config.name || DEFAULT_PLATFORM_NAME;
  renderFans();
  renderDiagnostics();
  updateConfigStatus();
}

function renderFans() {
  elements.fansList.innerHTML = "";
  elements.fansEmpty.classList.toggle("hidden", state.config.fans.length > 0);

  state.config.fans.forEach((fan, index) => {
    elements.fansList.appendChild(createFanCard(fan, index));
  });
}

function createFanCard(fan, index) {
  const card = document.createElement("article");
  card.className = "fan-card";
  card.dataset.fanIndex = String(index);

  const header = document.createElement("div");
  header.className = "device-header";

  const title = document.createElement("h3");
  title.textContent = fan.name || `Fan ${index + 1}`;

  const status = document.createElement("span");
  const valid = getFanErrors(fan).length === 0;
  status.className = `pill ${valid ? "good" : "warn"}`;
  status.textContent = valid ? "Ready" : "Needs details";

  header.append(title, status);
  card.appendChild(header);

  const identityGrid = document.createElement("div");
  identityGrid.className = "settings-grid";
  identityGrid.append(
    createTextField(index, "name", "Fan name", fan.name || "", "Office Fan", "Display name for this fan in HomeKit."),
    createTextField(index, "ip", "Fan IP address or hostname", fan.ip || "", "192.168.1.150 or fan.local", "IP address, DNS hostname, or mDNS .local hostname."),
    createTextField(index, "mac", "MAC address", fan.mac || "", "20:F8:5E:00:00:00", "MAC address from the Big Ass Fans app Wi-Fi settings."),
    createNumberField(index, "probeFrequency", "Probe frequency (ms)", getValue(fan, "probeFrequency"), "Keep-alive and state refresh interval. Use 0 to disable probing.")
  );
  card.appendChild(identityGrid);

  card.appendChild(
    createSettingSection("Capability Detection", [
      createLightSelect(index, "downlightEquipped", "Downlight detection", getLightOverride(fan.downlightEquipped), "Auto-detect unless the plugin guesses wrong."),
      createLightSelect(index, "uplightEquipped", "Uplight detection", getLightOverride(fan.uplightEquipped), "Auto-detect unless the plugin guesses wrong."),
      createNumberField(index, "incrementalButtonsDelay", "Incremental button reset delay (ms)", getValue(fan, "incrementalButtonsDelay"), "Auto-reset delay for optional +/- buttons."),
    ])
  );

  const checkboxSection = document.createElement("section");
  checkboxSection.className = "setting-section";
  const checkboxTitle = document.createElement("h4");
  checkboxTitle.textContent = "HomeKit Services";
  const checkboxGrid = document.createElement("div");
  checkboxGrid.className = "checkbox-grid";
  booleanFields.forEach((field) => {
    checkboxGrid.appendChild(createCheckbox(index, field, getValue(fan, field.key)));
  });
  checkboxSection.append(checkboxTitle, checkboxGrid);
  card.appendChild(checkboxSection);

  const actions = document.createElement("div");
  actions.className = "actions";
  const test = document.createElement("button");
  test.type = "button";
  test.className = "secondary";
  test.textContent = "Test Connection";
  test.addEventListener("click", () => {
    testConnection(index, test).catch(() => {
      showToast("error", "Connection test failed.");
    });
  });

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "danger";
  remove.textContent = "Remove Fan";
  remove.addEventListener("click", () => removeFan(index));
  actions.append(test, remove);
  card.appendChild(actions);

  card.addEventListener("input", () => {
    updateConfigFromForm(false);
    clearLiveDiagnostic(index);
    refreshFanCardStatus(card);
    updateConfigStatus();
    renderDiagnostics();
  });
  card.addEventListener("change", () => {
    updateConfigFromForm(false);
    clearLiveDiagnostic(index);
    refreshFanCardStatus(card);
    updateConfigStatus();
    renderDiagnostics();
  });

  return card;
}

function createSettingSection(title, children) {
  const section = document.createElement("section");
  section.className = "setting-section";
  const heading = document.createElement("h4");
  heading.textContent = title;
  const grid = document.createElement("div");
  grid.className = "settings-grid";
  children.forEach((child) => grid.appendChild(child));
  section.append(heading, grid);
  return section;
}

function createTextField(index, key, label, value, placeholder, help) {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  wrapper.appendChild(createSpan(label));
  const input = document.createElement("input");
  input.type = "text";
  input.dataset.fanField = key;
  input.dataset.fanIndex = String(index);
  input.value = value;
  input.placeholder = placeholder;
  wrapper.appendChild(input);
  wrapper.appendChild(createSmall(help));
  return wrapper;
}

function createNumberField(index, key, label, value, help) {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  wrapper.appendChild(createSpan(label));
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = "1";
  input.dataset.fanField = key;
  input.dataset.fanIndex = String(index);
  input.value = String(value);
  wrapper.appendChild(input);
  wrapper.appendChild(createSmall(help));
  return wrapper;
}

function createLightSelect(index, key, label, value, help) {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  wrapper.appendChild(createSpan(label));
  const select = document.createElement("select");
  select.dataset.fanField = key;
  select.dataset.fanIndex = String(index);
  [
    ["auto", "Auto-detect"],
    ["true", "Force present"],
    ["false", "Force hidden"],
  ].forEach(([optionValue, text]) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = text;
    select.appendChild(option);
  });
  select.value = value;
  wrapper.appendChild(select);
  wrapper.appendChild(createSmall(help));
  return wrapper;
}

function createCheckbox(index, field, checked) {
  const label = document.createElement("label");
  label.className = "checkbox";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.dataset.fanField = field.key;
  input.dataset.fanIndex = String(index);
  input.checked = Boolean(checked);

  const text = document.createElement("span");
  text.textContent = field.label;
  text.appendChild(createSmall(field.help));

  label.append(input, text);
  return label;
}

function createSpan(text) {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

function createSmall(text) {
  const small = document.createElement("small");
  small.textContent = text;
  return small;
}

function getValue(fan, key) {
  return fan[key] === undefined ? fanDefaults[key] : fan[key];
}

function getLightOverride(value) {
  if (value === true) {
    return "true";
  }
  if (value === false) {
    return "false";
  }
  return "auto";
}

function getFanErrors(fan) {
  const errors = [];
  if (!String(fan.name || "").trim()) {
    errors.push("name");
  }
  if (!String(fan.ip || "").trim()) {
    errors.push("ip");
  }
  if (!isValidMac(fan.mac)) {
    errors.push("mac");
  }
  return errors;
}

function refreshFanCardStatus(card) {
  const index = Number(card.dataset.fanIndex);
  const fan = state.config.fans[index];
  if (!fan) {
    return;
  }

  const title = card.querySelector(".device-header h3");
  const pill = card.querySelector(".device-header .pill");
  if (title) {
    title.textContent = fan.name || `Fan ${index + 1}`;
  }
  if (pill) {
    const valid = getFanErrors(fan).length === 0;
    pill.className = `pill ${valid ? "good" : "warn"}`;
    pill.textContent = valid ? "Ready" : "Needs details";
  }
}

function isValidMac(value) {
  return /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(String(value || "").trim());
}

function addFan() {
  updateConfigFromForm(false);
  state.config.fans.push({
    name: "",
    ip: "",
    mac: "",
  });
  render();
  showToast("success", "Fan added.");
}

function removeFan(index) {
  updateConfigFromForm(false);
  state.config.fans.splice(index, 1);
  state.diagnostics.devices.splice(index, 1);
  render();
  showToast("warning", "Fan removed. Save settings to apply.");
}

function updateConfigFromForm(validate) {
  const nextConfig = {
    ...state.config,
    platform: PLATFORM_ALIAS,
    name: elements.platformName.value.trim() || DEFAULT_PLATFORM_NAME,
    fans: [],
  };

  const errors = [];
  const cards = Array.from(elements.fansList.querySelectorAll(".fan-card"));
  cards.forEach((card, index) => {
    const existing = { ...(state.config.fans[index] || {}) };
    knownFanFields.forEach((key) => {
      delete existing[key];
    });

    const fan = {
      ...existing,
      name: getFieldValue(card, "name").trim(),
      ip: getFieldValue(card, "ip").trim(),
      mac: getFieldValue(card, "mac").trim(),
    };

    setNumberOption(fan, card, "probeFrequency");
    setNumberOption(fan, card, "incrementalButtonsDelay");
    setLightOption(fan, card, "downlightEquipped");
    setLightOption(fan, card, "uplightEquipped");

    booleanFields.forEach((field) => {
      const checked = getCheckboxValue(card, field.key);
      setBooleanOption(fan, field.key, checked);
    });

    const fanErrors = getFanErrors(fan);
    if (!isValidNonNegativeInteger(getFieldValue(card, "probeFrequency"))) {
      fanErrors.push("probeFrequency");
    }
    if (!isValidNonNegativeInteger(getFieldValue(card, "incrementalButtonsDelay"))) {
      fanErrors.push("incrementalButtonsDelay");
    }
    if (fanErrors.length > 0) {
      errors.push(`Fan ${index + 1}: ${fanErrors.join(", ")}`);
    }

    nextConfig.fans.push(fan);
  });

  state.config = nextConfig;

  if (validate && nextConfig.fans.length === 0) {
    errors.push("Add at least one fan.");
  }

  return errors;
}

function getFieldValue(card, key) {
  const input = card.querySelector(`[data-fan-field="${key}"]`);
  return input ? input.value : "";
}

function getCheckboxValue(card, key) {
  const input = card.querySelector(`[data-fan-field="${key}"]`);
  return input ? input.checked : false;
}

function setNumberOption(fan, card, key) {
  const rawValue = getFieldValue(card, key);
  const value = rawValue === "" ? fanDefaults[key] : Number(rawValue);
  if (Number.isInteger(value) && value >= 0 && value !== fanDefaults[key]) {
    fan[key] = value;
  } else {
    delete fan[key];
  }
}

function isValidNonNegativeInteger(value) {
  if (value === "") {
    return true;
  }
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue >= 0;
}

function setLightOption(fan, card, key) {
  const value = getFieldValue(card, key);
  if (value === "true") {
    fan[key] = true;
  } else if (value === "false") {
    fan[key] = false;
  } else {
    delete fan[key];
  }
}

function setBooleanOption(fan, key, value) {
  if (value !== fanDefaults[key]) {
    fan[key] = value;
  } else {
    delete fan[key];
  }
}

async function saveSettings() {
  const errors = updateConfigFromForm(true);
  if (errors.length > 0) {
    showToast("error", `Fix config first: ${errors[0]}.`);
    updateConfigStatus();
    renderDiagnostics();
    return;
  }

  if (
    !window.homebridge ||
    typeof window.homebridge.updatePluginConfig !== "function"
  ) {
    showToast("warning", "Settings validated. Homebridge UI API is unavailable in preview.");
    return;
  }

  const configs = await window.homebridge.getPluginConfig();
  const index = configs.findIndex((entry) => entry.platform === PLATFORM_ALIAS);
  if (index >= 0) {
    configs[index] = state.config;
  } else {
    configs.push(state.config);
  }

  await window.homebridge.updatePluginConfig(configs);
  await window.homebridge.savePluginConfig();
  state.configs = configs;
  showToast("success", "Settings saved.");
  render();
}

async function testConnection(index, button) {
  updateConfigFromForm(false);
  const fan = state.config.fans[index];
  if (!fan) {
    showToast("error", "Fan not found.");
    return;
  }

  setButtonBusy(button, "Testing...");
  const result = await request("/fan/test-connection", { fan });
  restoreButton(button, "Test Connection");

  if (!result.ok) {
    showToast("error", result.message || "Connection test failed.");
    return;
  }

  state.diagnostics.devices[index] = {
    index,
    fan,
    result: result.result,
  };
  state.diagnostics.generatedAt = result.result?.checkedAt;
  renderDiagnostics();
  refreshFanCardStatusForIndex(index);

  if (result.result?.ok) {
    showToast("success", `${fan.name || "Fan"} responded.`);
  } else {
    showToast("warning", result.result?.message || `${fan.name || "Fan"} did not respond.`);
  }
}

async function loadLiveDiagnostics(button) {
  updateConfigFromForm(false);
  if (state.config.fans.length === 0) {
    renderDiagnostics();
    showToast("warning", "Add a fan before testing connectivity.");
    return;
  }

  setButtonBusy(button, "Testing...");
  const result = await request("/diagnostics/state", { fans: state.config.fans });
  restoreButton(button, "Test All Fans");

  if (!result.ok) {
    showToast("error", result.message || "Failed to load live diagnostics.");
    return;
  }

  state.diagnostics = {
    generatedAt: result.generatedAt,
    devices: result.devices || [],
  };
  renderDiagnostics();
  renderFans();
  showToast("success", "Live diagnostics refreshed.");
}

function setButtonBusy(button, text) {
  if (!button) {
    return;
  }
  button.disabled = true;
  button.textContent = text;
}

function restoreButton(button, text) {
  if (!button) {
    return;
  }
  button.disabled = false;
  button.textContent = text;
}

function updateConfigStatus() {
  const errors = updateConfigFromForm(false);
  const fanCount = state.config.fans.length;
  elements.configStatus.classList.remove("good", "warn");

  if (fanCount === 0) {
    elements.configStatus.textContent = "Add a fan";
    elements.configStatus.classList.add("warn");
    return;
  }

  if (errors.length > 0) {
    elements.configStatus.textContent = `${errors.length} issue(s)`;
    elements.configStatus.classList.add("warn");
    return;
  }

  elements.configStatus.textContent = `${fanCount} fan(s) ready`;
  elements.configStatus.classList.add("good");
}

function renderDiagnostics() {
  updateConfigFromForm(false);
  elements.diagnosticsList.innerHTML = "";

  const fanCount = state.config.fans.length;
  if (fanCount === 0) {
    elements.diagnosticsSummary.textContent = "No fans configured yet.";
    elements.diagnosticsEmpty.classList.remove("hidden");
    return;
  }

  elements.diagnosticsEmpty.classList.add("hidden");
  const invalidCount = state.config.fans.filter((fan) => getFanErrors(fan).length > 0).length;
  const debugCount = state.config.fans.filter((fan) => fan.enableDebugPort === true).length;
  const liveCount = state.diagnostics.devices.filter((device) => device?.result).length;
  const liveSummary = liveCount > 0
    ? `${liveCount} live check(s), last checked ${formatTimestamp(state.diagnostics.generatedAt)}`
    : "no live checks yet";
  elements.diagnosticsSummary.textContent =
    `${fanCount} configured fan(s), ${invalidCount} needing required details, ${debugCount} with debug port enabled, ${liveSummary}.`;

  state.config.fans.forEach((fan, index) => {
    elements.diagnosticsList.appendChild(createDiagnosticCard(fan, index));
  });
}

function createDiagnosticCard(fan, index) {
  const errors = getFanErrors(fan);
  const live = state.diagnostics.devices[index]?.result;
  const suggestions = getLiveSuggestions(live);
  const card = document.createElement("article");
  card.className = "diagnostic-device";

  const header = document.createElement("div");
  header.className = "device-header";
  const title = document.createElement("h3");
  title.textContent = fan.name || `Fan ${index + 1}`;
  const pill = document.createElement("span");
  const isReady = errors.length === 0;
  const isLiveOk = live?.ok === true;
  pill.className = `pill ${isLiveOk || (isReady && !live) ? "good" : "warn"}`;
  pill.textContent = live ? live.state : (isReady ? "Config ready" : "Needs details");
  header.append(title, pill);

  const list = document.createElement("dl");
  [
    ["Live Connection", live ? live.message : "not checked yet"],
    ["Latency", live?.latencyMs !== undefined ? `${live.latencyMs} ms` : "n/a"],
    ["Bytes Received", live?.bytesReceived !== undefined ? String(live.bytesReceived) : "n/a"],
    ["Last Check", live?.checkedAt ? formatTimestamp(live.checkedAt) : "n/a"],
    ["Detected Capabilities", describeLiveCapabilities(live)],
    ["Capability Exposure", describeLiveExposure(live)],
    ["Capability Guidance", describeLiveGuidance(live)],
    ["Address", fan.ip || "missing"],
    ["MAC", fan.mac || "missing"],
    ["State Refresh", `${getValue(fan, "probeFrequency")} ms`],
    ["Lights", describeLights(fan)],
    ["Sensors", describeSensors(fan)],
    ["Optional Services", describeOptionalServices(fan)],
    ["Debug Port", fan.enableDebugPort ? "enabled on localhost" : "disabled"],
  ].forEach(([label, value]) => {
    const wrapper = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    wrapper.append(dt, dd);
    list.appendChild(wrapper);
  });

  card.append(header, list);

  if (suggestions.length > 0) {
    const actions = document.createElement("div");
    actions.className = "actions diagnostic-actions";
    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "secondary";
    apply.textContent = `Apply ${suggestions.length} Suggested ${suggestions.length === 1 ? "Setting" : "Settings"}`;
    apply.addEventListener("click", () => applyCapabilitySuggestions(index));
    actions.appendChild(apply);
    card.appendChild(actions);
  }

  return card;
}

function describeLights(fan) {
  if (fan.noLights === true) {
    return "all light controls hidden";
  }
  return `downlight ${describeLightOverride(fan.downlightEquipped)}, uplight ${describeLightOverride(fan.uplightEquipped)}`;
}

function describeLightOverride(value) {
  if (value === true) {
    return "forced present";
  }
  if (value === false) {
    return "forced hidden";
  }
  return "auto-detected";
}

function describeSensors(fan) {
  const sensors = [];
  sensors.push(getValue(fan, "showTemperature") ? "temperature" : "temperature hidden");
  sensors.push(getValue(fan, "showHumidity") ? "humidity" : "humidity hidden");
  if (fan.showFanOccupancySensor) {
    sensors.push("fan occupancy");
  }
  if (fan.showLightOccupancySensor) {
    sensors.push("light occupancy");
  }
  return sensors.join(", ");
}

function describeOptionalServices(fan) {
  const services = [];
  if (fan.showFanAutoSwitch) {
    services.push("legacy fan auto switch");
  }
  if (fan.showLightAutoSwitch) {
    services.push("light auto");
  }
  if (fan.showDimToWarmSwitch) {
    services.push("dim to warm");
  }
  if (fan.showEcoModeSwitch) {
    services.push("eco mode");
  }
  if (fan.showStandbyLED) {
    services.push("standby LED");
  }
  if (fan.enableIncrementalButtons) {
    services.push("+/- buttons");
  }
  if (fan.disableDirectionControl) {
    services.push("direction hidden");
  }
  return services.length > 0 ? services.join(", ") : "none";
}

function describeLiveCapabilities(live) {
  const detected = live?.capabilitySummary?.detected;
  if (Array.isArray(detected) && detected.length > 0) {
    return detected.join(", ");
  }
  if (live?.capabilityMessage) {
    return live.capabilityMessage;
  }
  return "not checked yet";
}

function describeLiveExposure(live) {
  if (!live?.capabilitySummary) {
    return "not checked yet";
  }

  const exposed = Array.isArray(live.capabilitySummary.exposed)
    ? live.capabilitySummary.exposed
    : [];
  const hidden = Array.isArray(live.capabilitySummary.hiddenByConfig)
    ? live.capabilitySummary.hiddenByConfig
    : [];
  const parts = [];
  parts.push(`exposed: ${exposed.length > 0 ? exposed.join(", ") : "none"}`);
  if (hidden.length > 0) {
    parts.push(`hidden by config: ${hidden.join(", ")}`);
  }
  return parts.join("; ");
}

function describeLiveGuidance(live) {
  const suggestions = getLiveSuggestions(live);
  if (suggestions.length > 0) {
    return `Suggested updates: ${suggestions.map((suggestion) => suggestion.label).join(", ")}.`;
  }

  const missing = live?.capabilitySummary?.notReportedButEnabled;
  if (Array.isArray(missing) && missing.length > 0) {
    return `Configured but not reported by fan: ${missing.join(", ")}.`;
  }
  if (live?.capabilitySummary) {
    return "Configured options match the fan capability report.";
  }
  return "Run Test Connection or Test All Fans to compare settings with live fan capabilities.";
}

function getLiveSuggestions(live) {
  return Array.isArray(live?.capabilitySuggestions) ? live.capabilitySuggestions : [];
}

function applyCapabilitySuggestions(index) {
  updateConfigFromForm(false);
  const fan = state.config.fans[index];
  const suggestions = getLiveSuggestions(state.diagnostics.devices[index]?.result);

  if (!fan || suggestions.length === 0) {
    showToast("warning", "No suggested settings are available for this fan.");
    return;
  }

  suggestions.forEach((suggestion) => {
    if (suggestion.value === "auto") {
      delete fan[suggestion.key];
    } else {
      fan[suggestion.key] = suggestion.value;
    }
  });

  clearLiveDiagnostic(index);
  render();
  showToast("success", `Applied ${suggestions.length} suggested ${suggestions.length === 1 ? "setting" : "settings"}. Save settings to persist.`);
}

function clearLiveDiagnostic(index) {
  if (state.diagnostics.devices[index]) {
    state.diagnostics.devices[index] = undefined;
  }
}

function refreshFanCardStatusForIndex(index) {
  const card = elements.fansList.querySelector(`[data-fan-index="${index}"]`);
  if (card) {
    refreshFanCardStatus(card);
  }
}

function formatTimestamp(value) {
  if (!value) {
    return "unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  return date.toLocaleString();
}

function init() {
  loadConfig().catch(() => {
    showToast("error", "Failed to load current config.");
    render();
  });

  elements.addFan.addEventListener("click", addFan);
  elements.saveSettingsTop.addEventListener("click", () => {
    saveSettings().catch(() => {
      showToast("error", "Failed to save settings.");
    });
  });
  elements.refreshDiagnostics.addEventListener("click", () => {
    loadLiveDiagnostics(elements.refreshDiagnostics).catch(() => {
      showToast("error", "Failed to load live diagnostics.");
      restoreButton(elements.refreshDiagnostics, "Test All Fans");
    });
  });
  elements.platformName.addEventListener("input", () => {
    updateConfigFromForm(false);
    updateConfigStatus();
  });
}

if (window.homebridge) {
  window.homebridge.addEventListener("ready", () => {
    init();
  });
} else {
  document.addEventListener("DOMContentLoaded", init);
}
