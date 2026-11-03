/**
 * The floor under a point as the rig reads it: in the frame things are drawn in (a matrixWorld is relative to the floating origin `at`, so
 * a point's world place is it plus `at`), where the den's own floor is read at the point's place in the den's frame (`den` is where the
 * group sits in the world), `y` the height to look from and `fallback` the floor when there is none; the answer back in the drawn frame.
 */
export function renderGround(floorAt: (x: number, z: number, y: number) => number | null, den: { x: number; y: number; z: number }, at: { x: number; y: number; z: number }, from: () => number, fallback: () => number): (x: number, z: number) => number {
  return (x, z) => (floorAt(x + at.x - den.x, z + at.z - den.z, from()) ?? fallback()) + den.y - at.y;
}
