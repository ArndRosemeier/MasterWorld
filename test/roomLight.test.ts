import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planInterior, planTown } from '@futuremagic/settlement';
import { skyLight, skyPath, type SkyWeather } from '@futuremagic/sky';
import { roomBounce, roomSun } from '../src/game/roomLight';

const plan = planTown({ seed: 7, x: 0, z: 0, radius: 130, height: () => 10 });
const inn = plan.buildings.find((b) => b.kind === 'inn')!;
const room = roomSun(inn, planInterior(inn), 0);
const moon = { dir: [0, -1, 0] as [number, number, number], sunSide: [1, 0, 0] as [number, number, number], lit: 0.5 };
/** The room's thrown-about light at `hour` under `wx` (the sun's strength as the sky gives it). */
const at = (hour: number, wx?: SkyWeather): number => {
  const sun = skyPath(hour, [0, 1, 0]);
  return roomBounce(room, sun, skyLight(sun, moon, wx).lightIntensity);
};

test('room light: a room lets the sun in by its windows and its open door, over a room of some size', () => {
  // This inn stands in a row: its taproom has only its door; a cottage has windows all round.
  assert.ok(room.openings.length >= 1, `${room.openings.length} openings`);
  const cot = plan.buildings.find((b) => b.kind === 'cottage')!;
  assert.ok(roomSun(cot, planInterior(cot), 0).openings.length >= 4);
  for (const o of room.openings) { assert.ok(Math.abs(Math.hypot(o.nx, o.nz) - 1) < 1e-6); assert.ok(o.area > 0); }
  assert.ok(room.surface > 30, `${room.surface} m²`);
  // Shut, the door lets nothing in.
  assert.ok(roomSun(inn, planInterior(inn), 0, false).openings.length < room.openings.length);
});

test('room light: rises with the sun that comes in, is nothing at night, falls under cloud', () => {
  // The more an opening faces the sun, the more comes in; facing away, none.
  const one = { openings: [{ nx: 1, nz: 0, area: 1 }], surface: 100, floor: 0.2, wall: 0.6 };
  const facing = roomBounce(one, [Math.SQRT1_2, Math.SQRT1_2, 0], 3), slant = roomBounce(one, [0.4, Math.SQRT1_2, 0.58], 3), away = roomBounce(one, [-Math.SQRT1_2, Math.SQRT1_2, 0], 3);
  assert.ok(facing > slant && slant > 0 && away === 0, `${facing} ${slant} ${away}`);
  assert.ok(roomBounce({ ...one, openings: [{ nx: 1, nz: 0, area: 2 }] }, [Math.SQRT1_2, Math.SQRT1_2, 0], 3) > facing, 'more window, more light');
  assert.ok(roomBounce(one, [Math.SQRT1_2, Math.SQRT1_2, 0], 6) > facing, 'stronger sun, more light');
  // Over the day in the inn: some light by day, none at midnight.
  const day = Math.max(...[8, 10, 12, 14, 16].map((h) => at(h)));
  assert.ok(day > 0.05, `by day ${day}`);
  assert.equal(at(0), 0);
  assert.equal(at(23), 0);
  // Heavy overcast: the sun hardly gets through, and the room gets as good as nothing of it.
  const grey: SkyWeather = { cover: 1, density: 1, dark: 0.6, sun: 0.05, fog: 0, rain: 0.3 };
  const dayGrey = Math.max(...[8, 10, 12, 14, 16].map((h) => at(h, grey)));
  assert.ok(dayGrey < day * 0.1, `overcast ${dayGrey} against ${day}`);
});
