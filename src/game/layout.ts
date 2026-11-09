import { WORLD_MARGIN } from './feel';
import { type Vec } from './geom';

export interface WorldLayout {
    unit: number;
    originX: number;
    originY: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    worldW: number;
    worldH: number;
}

export function fitLayout(
    points: Vec[],
    width: number,
    height: number,
    viewScale = 1,
    panX = 0,
    panY = 0,
    padding = 28,
): WorldLayout {
    if (points.length === 0 || width <= 0 || height <= 0) {
        return {
            unit: 1,
            originX: 0,
            originY: 0,
            minX: 0,
            maxX: 0,
            minY: 0,
            maxY: 0,
            worldW: 0,
            worldH: 0,
        };
    }
    let minX = points[0].x;
    let maxX = points[0].x;
    let minY = points[0].y;
    let maxY = points[0].y;
    for (const point of points) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
    }
    minX -= WORLD_MARGIN;
    maxX += WORLD_MARGIN;
    minY -= WORLD_MARGIN;
    maxY += WORLD_MARGIN;
    const worldW = Math.max(1, maxX - minX);
    const worldH = Math.max(1, maxY - minY);
    const availW = Math.max(0, width - padding * 2);
    const availH = Math.max(0, height - padding * 2);
    const unit = Math.min(availW / worldW, availH / worldH) * viewScale;
    const drawnW = worldW * unit;
    const drawnH = worldH * unit;
    return {
        unit,
        originX: (width - drawnW) / 2 + panX,
        originY: (height - drawnH) / 2 + panY,
        minX,
        maxX,
        minY,
        maxY,
        worldW,
        worldH,
    };
}

export function toCanvas(layout: WorldLayout, world: Vec): Vec {
    return {
        x: layout.originX + (world.x - layout.minX) * layout.unit,
        y: layout.originY + (layout.maxY - world.y) * layout.unit,
    };
}

export function toWorld(layout: WorldLayout, canvas: Vec): Vec {
    if (layout.unit <= 0) return { x: 0, y: 0 };
    return {
        x: layout.minX + (canvas.x - layout.originX) / layout.unit,
        y: layout.maxY - (canvas.y - layout.originY) / layout.unit,
    };
}
