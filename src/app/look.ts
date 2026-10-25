/** A view direction from the URL's degrees (yaw 0 looks north, 90 east; pitch up positive) to the cameras' radians. */
export function lookFromDegrees(yawDeg: number, pitchDeg: number): { yaw: number; pitch: number } {
  return { yaw: (-yawDeg * Math.PI) / 180, pitch: (pitchDeg * Math.PI) / 180 };
}
