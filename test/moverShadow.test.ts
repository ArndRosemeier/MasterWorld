import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DepthTexture, DirectionalLight, FloatType, Group, Mesh, PointLight, Scene, ShadowNode, type Object3D } from 'three/webgpu';
import { MOVER_RANGE, MoverShadow, mover, type ShadowFrame } from '../src/render/moverShadow';

test('MoverShadow: the whole map leaves the near movers out and is kept; every frame they are drawn over the kept copy', () => {
  // Each draw records what it would draw (three's own draw needs a GPU), and how.
  const log: string[] = [];
  const seen = (scene: Scene): string => {
    const names: string[] = [];
    scene.traverseVisible((o: Object3D) => { if (o.name) names.push(o.name); });
    return names.sort().join(' ');
  };
  const proto = ShadowNode.prototype as unknown as { renderShadow(frame: ShadowFrame): void };
  const was = proto.renderShadow;
  proto.renderShadow = function (frame) { log.push(`whole: ${seen(frame.scene)}`); };
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
    assert.equal((sun.shadow as unknown as { shadowNode?: unknown }).shadowNode, split.node, 'the sun shades with this node');
    const map = new DepthTexture(8, 8, FloatType);
    split.node.shadowMap = { depthTexture: map };
    const renderer = {
      autoClear: true,
      render(s: Scene) { log.push(`movers${this.autoClear ? ' (cleared!)' : ''}: ${seen(s)}`); },
      copyTextureToTexture(src: DepthTexture, dst: DepthTexture) { log.push(`copy ${src === map ? 'map' : 'kept'} to ${dst === map ? 'map' : 'kept'}`); },
    };
    const frame = { scene, renderer } as ShadowFrame;
    split.node.renderShadow(frame);
    split.node.renderShadow(frame);
    split.stillDue = true;
    split.node.renderShadow(frame);
    assert.deepEqual(log, [
      'whole: cart farFolk house lamp people world',
      'copy map to kept',
      'movers: hero heroBody lamp people',
      'copy kept to map',
      'movers: hero heroBody lamp people',
      'whole: cart farFolk house lamp people world',
      'copy map to kept',
      'movers: hero heroBody lamp people',
    ]);
    assert.equal(renderer.autoClear, true, 'the renderer clears again afterwards');
    // Everything shown as it was afterwards.
    assert.equal(seen(scene), 'cart farFolk hero heroBody house lamp people world');
    assert.equal(hidden.visible, false);
  } finally {
    proto.renderShadow = was;
  }
});
