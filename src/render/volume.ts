/** Rectangular masses are independent of building type; several can form a setback. */
export interface Point { x: number; y: number }
export interface Rect extends Point { w: number; h: number }
export type Side = 'north' | 'east' | 'south' | 'west';
export interface ProjectedFace {
  side: Side;
  /** Top edge first, followed by the matching fixed base edge. */
  corners: [Point, Point, Point, Point];
  visible: boolean;
  shade: number;
  depth: number;
}
export interface ProjectedVolume {
  base: Rect;
  height: number;
  z: Point;
  top: Rect;
  baseCorners: Point[];
  topCorners: Point[];
  faces: ProjectedFace[];
  bounds: Rect;
  depth: number;
}

export function projectHeightVector(base: Rect, height: number, W: number, H: number): Point {
  return { x: Math.round((base.x - W / 2) / (W / 2) * height * 0.34),
    y: Math.round(-height + (base.y - H / 2) / (H / 2) * height * 0.34 * 0.42) };
}

const corners = ({ x, y, w, h }: Rect): Point[] =>
  [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];

/** Pure geometry: changing the lens moves only the top, never the supplied base. */
export function projectVolume(base: Rect, height: number, vector: Point): ProjectedVolume {
  const z = height === 0 ? { x: 0, y: 0 } : vector;
  const top = { ...base, x: base.x + z.x, y: base.y + z.y };
  const b = corners(base), t = corners(top);
  const sides: Side[] = ['north', 'east', 'south', 'west'];
  const shown = [z.y > 0, z.x < 0, z.y < 0, z.x > 0];
  const shades = [0.16, 0.22, 0, 0.1];
  const faces = sides.map((side, i): ProjectedFace => {
    // South and west run in the opposite perimeter direction so their texture
    // begins at the familiar left/front edge, without mirroring its windows.
    const a = i < 2 ? i : (i + 1) % 4, c = i < 2 ? (i + 1) % 4 : i;
    return { side, corners: [t[a], t[c], b[c], b[a]], visible: height > 0 && shown[i],
      shade: shades[i], depth: Math.max(b[a].y, b[c].y) };
  });
  const x = Math.min(base.x, top.x), y = Math.min(base.y, top.y);
  return { base: { ...base }, height, z, top, baseCorners: b, topCorners: t, faces,
    bounds: { x, y, w: base.w + Math.abs(z.x), h: base.h + Math.abs(z.y) },
    depth: base.y + base.h };
}

export function intersectsViewport({ bounds: b }: ProjectedVolume, W: number, H: number): boolean {
  return b.x + b.w >= 0 && b.y + b.h >= 0 && b.x <= W && b.y <= H;
}

/** Map a cached face texture onto its parallelogram. No temporary canvases. */
export function drawFace(ctx: CanvasRenderingContext2D, face: ProjectedFace,
  texture: HTMLCanvasElement, shade = face.shade, grime = 0, id = 0): void {
  if (!face.visible) return;
  const [a, b, , d] = face.corners;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.transform((b.x - a.x) / texture.width, (b.y - a.y) / texture.width,
    (d.x - a.x) / texture.height, (d.y - a.y) / texture.height, a.x, a.y);
  ctx.drawImage(texture, 0, 0);
  if (shade > 0) {
    ctx.fillStyle = `rgba(8,14,24,${shade})`;
    ctx.fillRect(0, 0, texture.width, texture.height);
  }
  if (grime > 0.025) {
    ctx.fillStyle = `rgba(53,43,29,${grime})`;
    for (let x = 3 + id % 4; x < texture.width - 2; x += 9)
      ctx.fillRect(x, 0, 2, Math.min(texture.height, 3 + (x + id) % 7));
  }
  ctx.restore();
}
