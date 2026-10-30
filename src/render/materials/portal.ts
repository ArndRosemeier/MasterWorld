// @ts-nocheck -- TSL node math; checked by rendering it (npm run shot:portal).
/**
 * A portal's opening (render/portal/PortalView.ts): it shows the view through it, drawn the frame before into
 * a twin of the scene target, at the same place on the screen. Unlit, no fog, no shadows: the light of the
 * place beyond is already in that view. It writes its own depth, so what stands in front of the opening on
 * this side hides it.
 */
import { DoubleSide, MeshBasicNodeMaterial, Texture } from 'three/webgpu';
import { screenUV, texture, vec4 } from 'three/tsl';
import { defineKind } from '../materials';

/** The view through the openings: the twin target's texture once the view is made (view.ts sets it before the warm-up). */
export const PORTAL_VIEW = texture(new Texture());

export const PORTAL = defineKind('portal', ['position'], () => {
  const m = new MeshBasicNodeMaterial({ side: DoubleSide, fog: false });
  m.colorNode = vec4(PORTAL_VIEW.sample(screenUV).rgb, 1);
  return m;
}, { cast: false, receive: false });
