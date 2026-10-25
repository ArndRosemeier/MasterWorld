/**
 * A free camera for looking at the land until the player walks (milestone 1): WASD to move, Shift fast,
 * Space/C up and down, right mouse button held to look. Never goes below the ground.
 */
import { Euler, Vector3, type PerspectiveCamera } from 'three/webgpu';
import { lookFromDegrees } from './look';

export class FlyCamera {
  private yaw = 0;
  private pitch = 0;
  private readonly keys = new Set<string>();
  private looking = false;
  speed = 30;

  constructor(private readonly camera: PerspectiveCamera, el: HTMLElement, private readonly groundAt: (x: number, z: number) => number) {
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => { if (e.button === 2) { this.looking = true; void el.requestPointerLock?.(); } });
    window.addEventListener('mouseup', (e) => { if (e.button === 2) { this.looking = false; document.exitPointerLock?.(); } });
    window.addEventListener('mousemove', (e) => {
      if (!this.looking) return;
      this.yaw -= e.movementX * 0.0025;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - e.movementY * 0.0025));
      this.apply();
    });
    window.addEventListener('wheel', (e) => { this.speed = Math.max(2, Math.min(3000, this.speed * (e.deltaY < 0 ? 1.25 : 0.8))); });
  }

  /** Put the camera at a point; `absolute` takes y as it is, otherwise y is clamped above the ground. */
  place(x: number, z: number, y: number, absolute = false): void {
    this.camera.position.set(x, absolute ? y : Math.max(y, this.groundAt(x, z) + 1), z);
    this.apply();
  }

  /** Yaw 0 looks north (−z), 90 east; pitch up is positive. Degrees. */
  setLook(yawDeg: number, pitchDeg: number): void {
    ({ yaw: this.yaw, pitch: this.pitch } = lookFromDegrees(yawDeg, pitchDeg));
    this.apply();
  }

  private apply(): void {
    this.camera.quaternion.setFromEuler(new Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }

  update(dt: number): void {
    const k = this.keys, v = new Vector3();
    if (k.has('KeyW')) v.z -= 1;
    if (k.has('KeyS')) v.z += 1;
    if (k.has('KeyA')) v.x -= 1;
    if (k.has('KeyD')) v.x += 1;
    if (k.has('Space')) v.y += 1;
    if (k.has('KeyC')) v.y -= 1;
    if (!v.lengthSq()) return;
    v.normalize().multiplyScalar(this.speed * (k.has('ShiftLeft') ? 6 : 1) * dt).applyQuaternion(this.camera.quaternion);
    const p = this.camera.position.add(v);
    p.y = Math.max(p.y, this.groundAt(p.x, p.z) + 1);
  }
}
