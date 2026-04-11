import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as net from 'net';

import { __test__ } from '../src/platformAccessory';

class FakeSocket extends EventEmitter {
  public writes: Buffer[] = [];
  public keepAlive = false;
  public destroyed = false;

  write(buffer: Buffer) {
    this.writes.push(buffer);
    return true;
  }

  setKeepAlive(enabled: boolean) {
    this.keepAlive = enabled;
    return this;
  }

  override removeAllListeners(eventName?: string | symbol): this {
    super.removeAllListeners(eventName);
    return this;
  }

  destroy(_error?: Error) {
    this.destroyed = true;
    return this;
  }
}

function createTestAccessoryState() {
  const warnings: string[] = [];
  const debugs: string[] = [];
  const infos: string[] = [];

  return {
    warnings,
    debugs,
    infos,
    state: {
      ProbeFrequency: 0,
      client: undefined as FakeSocket | undefined,
      IP: '127.0.0.1',
      Name: 'Test Fan',
      chunkFragment: Buffer.alloc(0),
      funQueue: [],
      targetBulb: -1,
      capabilitiesEstablished: false,
      uptimeMinutes: 0,
      enableDebugPort: false,
      debugLevels: {
        network: 0,
        reconnect: 0,
        progress: 0,
        protoparse: 0,
        light: 0,
        funstack: 0,
        cluing: 0,
        redflags: 0,
      },
      lastDebugMessage: '',
      lastDebugMessageTag: '',
      platform: {
        log: {
          warn: (message: string) => warnings.push(message),
          error: (_message: string) => undefined,
          info: (message: string) => infos.push(message),
          debug: (message: string) => debugs.push(message),
        },
      },
    },
  };
}

function testGetVarintSupportsLargeValues() {
  const encoded = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x7f]);
  const [rest, value] = __test__.getVarint(encoded);
  assert.equal(rest.length, 0);
  assert.equal(value, 34359738367);
}

function testStandbyLEDColorMessageUsesVarints() {
  const message = __test__.buildStandbyLEDColorMessage(128, 255, 64);
  const hex = Buffer.from(message).toString('hex');
  assert.match(hex, /208001/);
  assert.match(hex, /28ff01/);
  assert.match(hex, /3040/);
}

function testMalformedFrameIsDropped() {
  const { state, warnings } = createTestAccessoryState();
  const malformed = Buffer.from([0xc0, 0x12, 0x05, 0xc0]);

  assert.doesNotThrow(() => {
    __test__.onData(state as never, malformed);
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /dropped malformed protobuf frame/i);
}

async function testReconnectOnClose() {
  const { state } = createTestAccessoryState();
  const originalSetTimeout = global.setTimeout;
  const sockets: FakeSocket[] = [];

  try {
    __test__.setConnectSocketForTest(((_: net.NetConnectOpts, listener?: () => void) => {
        const socket = new FakeSocket();
        sockets.push(socket);
        if (listener) {
          listener();
        }
        return socket as unknown as net.Socket;
      }) as typeof net.connect);

    global.setTimeout = (((
      callback: (...args: never[]) => void,
      _delay?: number,
      ..._args: never[]
    ) => {
      callback();
      return { ref() { return this; }, unref() { return this; } } as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout);

    __test__.networkSetup(state as never);
    assert.equal(sockets.length, 1);

    sockets[0].emit('close');

    assert.equal(sockets.length, 2);
    assert.equal(sockets[0].destroyed, true);
    assert.equal(state.client, sockets[1]);
  } finally {
    __test__.resetConnectSocketForTest();
    global.setTimeout = originalSetTimeout;
  }
}

async function main() {
  testGetVarintSupportsLargeValues();
  testStandbyLEDColorMessageUsesVarints();
  testMalformedFrameIsDropped();
  await testReconnectOnClose();
  console.log('Regression tests passed.');
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
