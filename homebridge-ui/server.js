"use strict";

const { startBigAssFansUiServer } = require("../dist/ui/index.js");

(async () => {
  const { HomebridgePluginUiServer } = await import("@homebridge/plugin-ui-utils");
  startBigAssFansUiServer(HomebridgePluginUiServer);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
