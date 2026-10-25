import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordersOf, townOrder } from '../src/vgm/orders';
import type { DecisionLog } from '../src/world/decisions';

test('orders: a VGM order to a town is a logged decision, replayed for that town only', () => {
  let log: DecisionLog = [{ kind: 'town', id: 'town-1', x: 0, z: 0, radius: 70 }];
  const curfew = { kind: 'stayIn', from: 30, to: 32 } as const;
  log = [...log, townOrder(log, 'town-1', curfew)];
  log = [...log, townOrder(log, 'town-2', { kind: 'gather', x: 1, z: 2, radius: 10, from: 40, to: 41 })];
  assert.deepEqual(log.slice(1).map((d) => d.id), ['order-1', 'order-2']);
  assert.deepEqual(ordersOf(log, 'town-1'), [curfew]);
  assert.deepEqual(JSON.parse(JSON.stringify(log)), log, 'plain data');
});
