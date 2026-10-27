import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bone, Group } from 'three/webgpu';
import { JOLT_TIME, Jolt, joltAt, joltOf, joltRoot, joltSpine } from '../src/render/jolt';

test('jolt: up at once, strongest early, gone by its end', () => {
  assert.equal(joltAt(0), 0);
  assert.equal(joltAt(-1), 0);
  assert.ok(joltAt(0.07) > 0.99 && joltAt(0.07) <= 1);
  assert.ok(joltAt(0.03) > 0.5, 'shows within two frames');
  assert.ok(joltAt(0.3) < 0.2);
  assert.equal(joltAt(JOLT_TIME), 0);
  assert.ok(joltOf('crit') > joltOf('hit') && joltOf('hit') > joltOf('block'));
});

test('jolt: a struck body is pushed and tipped away from the blow, then stands as before', () => {
  const j = new Jolt();
  const o = new Group();
  j.hit(3, 0);
  j.step(0.07);
  joltRoot(o, j, 0.1, 0.2);
  assert.ok(o.position.x > 0.09 && Math.abs(o.position.z) < 1e-9, 'pushed along the blow');
  // Tipped away: its up leans along +x.
  const up = o.up.clone().applyQuaternion(o.quaternion);
  assert.ok(up.x > 0.15, `leans away: ${up.x}`);
  j.step(JOLT_TIME);
  const still = new Group();
  joltRoot(still, j, 0.1, 0.2);
  assert.equal(still.position.x, 0);
});

test('jolt: a person bends back at the spine, away from whoever struck', () => {
  const names = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head'];
  const bones = names.map((n) => { const b = new Bone(); b.name = n; return b; });
  for (let i = 1; i < bones.length; i++) { bones[i].position.y = 0.15; bones[i - 1].add(bones[i]); }
  const j = new Jolt();
  j.hit(0, -1);
  j.step(0.07);
  joltSpine(bones, names, j, 0.4, 0);
  bones[0].updateWorldMatrix(true, true);
  const head = bones[5].getWorldPosition(bones[0].position.clone());
  assert.ok(head.z < -0.05, `the head goes back: ${head.z}`);
});
