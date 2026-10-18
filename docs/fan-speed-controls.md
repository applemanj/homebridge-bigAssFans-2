# Fan speed controls

These controls are shared by single-light and dual-light fans.

The fan uses seven speed levels, displayed as 14%, 29%, 43%, 57%, 71%, 86%, and 100%. Slider input is rounded to the nearest level. Nearby slider commands are coalesced over 125 ms before sending the final speed.

The HomeKit percentage remains at the requested value until 1.5 seconds after the last adjustment, then displays the mapped speed. Matching feedback does not interrupt that display delay. Differing fan feedback is authoritative and updates HomeKit immediately, including changes from the BAF app or remote. A readback is requested 300 ms after a speed write if speed feedback has not arrived.

Zero sends power Off without writing minimum speed into the fan's memory. Power On sets the last remembered nonzero speed before sending On. Reported nonzero speed is retained in Homebridge's accessory cache.

HomeKit does not identify the source of a 100% request. A 100% request sent alongside an Off-to-On action, with its queued write executing within 400 ms of that action, is treated as a companion wake request and restores the saved speed. This handles either command order. A standalone 100% slider request from Off, or a 100% request after the wake window, still selects maximum. An intentional maximum selection paired with power-on is indistinguishable from HomeKit's automatic request; select maximum again after the fan is on.

An Off report no longer cancels a queued slider command. An explicit HomeKit Off or disconnect still cancels pending writes and display/readback timers.

## Live checks

1. At 57%, select 40%. Expect hardware level 3 promptly; the display settles to 43% after the pause.
2. Select 50%. Expect level 4, settling to 57%.
3. Turn Off and then On. Expect the saved speed without a maximum-speed surge.
4. Once running, select 100%. Expect maximum speed.
5. Set speed through the BAF app. HomeKit should follow its reported value.
6. Try manual and automatic modes on both single-light and dual-light fans. Automated tests cannot confirm firmware timing on every model.

## Settled slider notifications

At the end of the 1.5-second display delay, the plugin forces a HomeKit event notification with the settled percentage. It repeats that notification once, one second later, even if the value is unchanged. A new slider request, differing speed feedback, Off, or disconnect cancels a pending repeat. These events do not send commands to the physical fan.

This is a compatibility experiment for Apple Home's expanded slider retaining the requested percentage while the main tile already displays the mapped value. Live testing is needed to establish whether Apple Home refreshes that view.

## Hiding reverse/direction control

`disableDirectionControl: true` removes the optional rotation-direction control
from the existing fan service, including cached accessories. Incoming direction
reports still update internal state but cannot recreate the HomeKit control.
Any stale direction-write handler rejects changes while the option is enabled.
Unchecking the option restores the control after saving and restarting.

This applies to fans with no light, one light, or dual lights. It is independent
of the lighting tile layout and does not hide Whoosh/SwingMode or prevent the
BAF app/remote from changing direction.
