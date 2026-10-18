import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mock } from 'node:test';
import { resolveFanIpViaMdns } from '../src/discovery';

async function main() {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const browser = Object.assign(new EventEmitter(), { stop() { stopped++; } });
    let stopped = 0;
    let destroyed = 0;
    const factory = async () => ({
      find: () => browser,
      destroy() { destroyed++; },
    });
    const result = resolveFanIpViaMdns('AA:BB:CC:DD:EE:FF', 5000, factory);
    await Promise.resolve();
    browser.emit('up', { txt: { mac: '11:22:33:44:55:66' }, addresses: ['192.0.2.1'] });
    browser.emit('up', { txt: { mac: 'aa-bb-cc-dd-ee-ff' }, addresses: ['bad address'] });
    assert.equal(stopped, 0);
    browser.emit('up', { txt: { mac: 'aa:bb:cc:dd:ee:ff' }, addresses: ['2001:db8::1', '192.0.2.2'] });
    assert.equal(await result, '192.0.2.2');
    assert.equal(stopped, 1);
    assert.equal(destroyed, 1);
    mock.timers.tick(6000);
    assert.equal(destroyed, 1);
    const timeout = resolveFanIpViaMdns('aa:bb:cc:dd:ee:ff', 5000, factory);
    await Promise.resolve();
    mock.timers.tick(5000);
    assert.equal(await timeout, undefined);
    assert.equal(destroyed, 2);
    assert.equal(await resolveFanIpViaMdns('invalid', 5000, factory), undefined);
    assert.equal(await resolveFanIpViaMdns('aa:bb:cc:dd:ee:ff', 5000, async () => { throw new Error('unavailable'); }), undefined);
    const failure = resolveFanIpViaMdns('aa:bb:cc:dd:ee:ff', 5000, async () => ({
      find() { throw new Error('browse failed'); }, destroy() { destroyed++; },
    }));
    assert.equal(await failure, undefined);
    assert.equal(destroyed, 3);
  } finally {
    mock.timers.reset();
  }
  console.log('Discovery tests passed.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
