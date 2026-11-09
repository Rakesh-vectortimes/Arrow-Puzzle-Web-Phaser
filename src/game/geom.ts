export interface Vec {
    x: number;
    y: number;
}

/** Top is the smaller Y, matching the Flutter rect used by the ray test. */
export interface Rect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export function vec(x: number, y: number): Vec {
    return { x, y };
}

export function add(a: Vec, b: Vec): Vec {
    return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec, b: Vec): Vec {
    return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec, s: number): Vec {
    return { x: a.x * s, y: a.y * s };
}

export function length(a: Vec): number {
    return Math.hypot(a.x, a.y);
}

export function distance(a: Vec, b: Vec): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function normalize(value: Vec, fallback: Vec): Vec {
    const d = length(value);
    if (d < 1e-6) return fallback;
    return { x: value.x / d, y: value.y / d };
}

export function distancePointToSegment(point: Vec, a: Vec, b: Vec): number {
    const ab = sub(b, a);
    const length2 = ab.x * ab.x + ab.y * ab.y;
    if (length2 < 1e-12) return distance(point, a);
    const t = clamp(((point.x - a.x) * ab.x + (point.y - a.y) * ab.y) / length2, 0, 1);
    return distance(point, { x: a.x + ab.x * t, y: a.y + ab.y * t });
}

export function minDistanceToPolyline(point: Vec, points: Vec[]): number {
    if (points.length === 0) return Number.POSITIVE_INFINITY;
    if (points.length === 1) return distance(point, points[0]);
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < points.length - 1; i++) {
        const d = distancePointToSegment(point, points[i], points[i + 1]);
        if (d < best) best = d;
    }
    return best;
}

export function polylineLength(points: Vec[]): number {
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
        total += distance(points[i], points[i + 1]);
    }
    return total;
}

export function circleHitsPolyline(center: Vec, radius: number, points: Vec[]): boolean {
    return minDistanceToPolyline(center, points) <= radius;
}

export function rayDistanceToRectEdge(from: Vec, direction: Vec, rect: Rect): number {
    let best = Number.POSITIVE_INFINITY;
    if (direction.x > 1e-6) best = Math.min(best, (rect.right - from.x) / direction.x);
    else if (direction.x < -1e-6) best = Math.min(best, (rect.left - from.x) / direction.x);
    if (direction.y > 1e-6) best = Math.min(best, (rect.bottom - from.y) / direction.y);
    else if (direction.y < -1e-6) best = Math.min(best, (rect.top - from.y) / direction.y);
    if (!Number.isFinite(best) || best < 0) return 0;
    return best;
}

export function boundsOfPoints(points: Vec[], margin = 0): Rect {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const point of points) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
    }
    if (minX > maxX) return { left: 0, top: 0, right: 0, bottom: 0 };
    return {
        left: minX - margin,
        top: minY - margin,
        right: maxX + margin,
        bottom: maxY + margin,
    };
}

export function trimPolylineFromStart(points: Vec[], distanceAlong: number): Vec[] {
    if (points.length === 0) return [];
    if (points.length === 1 || distanceAlong <= 0) return points.map((point) => ({ ...point }));
    let left = distanceAlong;
    for (let i = 0; i < points.length - 1; i++) {
        const segment = sub(points[i + 1], points[i]);
        const segmentLength = length(segment);
        if (left < segmentLength - 1e-9) {
            const t = segmentLength < 1e-12 ? 0 : left / segmentLength;
            return [
                { x: points[i].x + segment.x * t, y: points[i].y + segment.y * t },
                ...points.slice(i + 1).map((point) => ({ ...point })),
            ];
        }
        left -= segmentLength;
    }
    return [{ ...points[points.length - 1] }];
}

export interface PolylineMetric {
    pts: Vec[];
    cum: number[];
    length: number;
}

export function metricOf(points: Vec[]): PolylineMetric {
    const cum = [0];
    for (let i = 1; i < points.length; i++) {
        cum.push(cum[i - 1] + distance(points[i - 1], points[i]));
    }
    return { pts: points, cum, length: cum[cum.length - 1] ?? 0 };
}

export function pointAlong(poly: PolylineMetric, distanceAlong: number): { p: Vec; dir: Vec } {
    const d = clamp(distanceAlong, 0, poly.length);
    for (let i = 1; i < poly.pts.length; i++) {
        if (d <= poly.cum[i] + 1e-9) {
            const span = poly.cum[i] - poly.cum[i - 1];
            const t = span < 1e-12 ? 0 : (d - poly.cum[i - 1]) / span;
            return {
                p: {
                    x: poly.pts[i - 1].x + (poly.pts[i].x - poly.pts[i - 1].x) * t,
                    y: poly.pts[i - 1].y + (poly.pts[i].y - poly.pts[i - 1].y) * t,
                },
                dir: normalize(sub(poly.pts[i], poly.pts[i - 1]), { x: 1, y: 0 }),
            };
        }
    }
    const last = poly.pts.length - 1;
    const dir = last >= 1
        ? normalize(sub(poly.pts[last], poly.pts[last - 1]), { x: 1, y: 0 })
        : { x: 1, y: 0 };
    return { p: { ...poly.pts[Math.max(0, last)] }, dir };
}

/** Vertices of the path between two arc-length positions, inclusive. */
export function extractPolyline(poly: PolylineMetric, start: number, end: number): Vec[] {
    const s = clamp(start, 0, poly.length);
    const e = clamp(Math.max(start, end), 0, poly.length);
    const a = pointAlong(poly, s);
    const b = pointAlong(poly, e);
    const pts: Vec[] = [a.p];
    for (let i = 1; i < poly.pts.length - 1; i++) {
        if (poly.cum[i] > s + 1e-4 && poly.cum[i] < e - 1e-4) pts.push(poly.pts[i]);
    }
    if (distance(pts[pts.length - 1], b.p) > 0.4) pts.push(b.p);
    else if (pts.length === 1) pts.push(b.p);
    return pts;
}
