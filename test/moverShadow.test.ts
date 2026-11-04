import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DirectionalLight, Group, Mesh, PointLight, Scene, type Object3D } from 'three/webgpu';
import { shadow } from 'three/tsl';
import { MOVER_RANGE, MoverShadow, mover } from '../src/render/moverShadow';

test('MoverShadow: near movers are drawn into their own map only, far ones and the world into the still map', () => {
  // Each draw of a map records what it would draw (three's own draw needs a renderer).
  const drawn: string[][] = [];
  const proto = Object.getPrototypeOf(shadow(new DirectionalLight())) as { renderShadow(frame: { scene: Scene }): void };
  const was = proto.renderShadow;
  proto.renderShadow = function (frame) {
    const seen: string[] = [];
    frame.scene.traverseVisible((o: Object3D) => { if (o.name) seen.push(o.name); });
    drawn.push(seen.sort());
  };
  try {
    const scene = new Scene();
    const named = <T extends Object3D>(o: T, name: string): T => { o.name = name; return o; };
    const world = named(new Group(), 'world');
    world.add(named(new Mesh(), 'house'));
    const people = named(new Group(), 'people');
    const hero = mover(named(new Group(), 'hero'));
    hero.add(named(new Mesh(), 'heroBody'));
    const farFolk = mover(named(new Group(), 'farFolk'));
    farFolk.position.set(MOVER_RANGE + 20, 0, 0);
    const hidden = mover(named(new Group(), 'hiddenFolk'));
    hidden.visible = false;
    people.add(named(new Mesh(), 'cart'), hero, farFolk, hidden);
    scene.add(world, people, named(new PointLight(), 'lamp'));
    scene.updateMatrixWorld(true);

    const sun = new DirectionalLight();
    sun.castShadow = true;
    const split = new MoverShadow(sun);
    split.follow();
    split.passes.still.renderShadow({ scene });
    split.passes.moving.renderShadow({ scene });
    assert.deepEqual(drawn[0], ['cart', 'farFolk', 'house', 'lamp', 'people', 'world'], 'still map: everything but the near movers');
    assert.deepEqual(drawn[1], ['hero', 'heroBody', 'lamp', 'people'], 'movers map: the near movers (and the lights)');
    // Everything shown as it was afterwards.
    const after: string[] = [];
    scene.traverseVisible((o) => { if (o.name) after.push(o.name); });
    assert.deepEqual(after.sort(), ['cart', 'farFolk', 'hero', 'heroBody', 'house', 'lamp', 'people', 'world']);
    assert.equal(hidden.visible, false);
    assert.ok((sun.shadow as unknown as { shadowNode?: unknown }).shadowNode, 'the sun shades with both maps');
    assert.equal(split.light.shadow.needsUpdate, true, 'the movers map is drawn every frame while the sun shines');
  } finally {
    proto.renderShadow = was;
  }
});
