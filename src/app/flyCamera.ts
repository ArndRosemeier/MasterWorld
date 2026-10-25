/**
 * A free camera for looking at the land (F in game, `?fly` from the start): WASD to move, Shift fast,
 * Space/C up and down, the wheel sets the speed, right mouse button held to look. Never goes below the
 * ground. Takes input only while `active`.
 */
import { Euler, Vector3, type PerspectiveCamera } from 'three/webgpu';
import { lookFromDegrees } from './look';

export class FlyCamera {
  /** Direction (rad), as the hero camera's. */
  yaw = 0;
  pitch = 0;
  private on = false;
  private readonly keys = new Set<string>();
  private looking = false;
  speed = 30;

  constructor(private readonly camera: PerspectiveCamera, el: HTMLElement, private readonly groundAt: (x: number, z: number) => number) {
    window.addEventListener('keydown', (e) => { if (this.on) this.keys.add(e.code); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => { if (this.on && e.button === 2) { this.looking = true; void el.requestPointerLock?.(); } });
    window.addEventListener('mouseup', (e) => { if (this.looking && e.button === 2) { this.looking = false; document.exitPointerLock?.(); } });
    window.addEventListener('mousemove', (e) => {
      if (!this.looking) return;
      this.yaw -= e.movementX * 0.0025;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - e.movementY * 0.0025));
      this.apply();
    });
    window.addEventListener('blur', () => { this.active = this.on; }); // lets go of the keys
    window.addEventListener('wheel', (e) => { if (this.on) this.speed = Math.max(2, Math.min(3000, this.speed * (e.deltaY < 0 ? 1.25 : 0.8))); });
  }

  get active(): boolean { return this.on; }

  /** Taking input (flying); off lets go of the keys and the mouse. */
  set active(on: boolean) {
    this.on = on;
    this.keys.clear();
    if (this.looking) document.exitPointerLock?.();
    this.looking = false;
  }

  /** Look the way the camera looks now (on taking over from the hero camera). */
  takeOver(): void {
    const e = new Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = e.y;
    this.pitch = e.x;
    this.apply();
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
