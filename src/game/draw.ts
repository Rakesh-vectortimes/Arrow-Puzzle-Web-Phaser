import type { GameObjects } from 'phaser';
import type { ArrowLine } from './arrowLine';
import type { BoardController } from './board';
import {
    ARROW,
    ARROW_BLOCKED,
    ARROW_HINTED,
    ARROW_MOVING,
    DOT,
    ESCAPE_FADE_FRACTION,
    EXIT_MARGIN,
    GUIDE,
    HEAD_LENGTH_FACTOR,
    HEAD_WIDTH_FACTOR,
    MAX_STROKE,
    MIN_STROKE,
    PRESS_STROKE_SCALE,
    REBOUND_OVERSHOOT,
    STROKE_FACTOR,
    lerpColor,
} from './feel';
import { extractPolyline, metricOf, normalize, pointAlong, sub, type Vec } from './geom';
import { toCanvas, type WorldLayout } from './layout';
import { pixelRatio } from './screen';

function strokePoly(g: GameObjects.Graphics, pts: Vec[], width: number, color: number, alpha: number): void {
    if (pts.length < 2 || alpha <= 0.01) return;
    g.lineStyle(width, color, alpha);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.strokePath();
    g.fillStyle(color, alpha);
    const radius = width / 2;
    for (const point of pts) g.fillCircle(point.x, point.y, radius);
}

function drawHead(
    g: GameObjects.Graphics,
    tip: Vec,
    direction: Vec,
    headLength: number,
    headWidth: number,
    color: number,
    alpha: number,
): void {
    const dir = normalize(direction, { x: 0, y: -1 });
    const perp = { x: -dir.y, y: dir.x };
    const base = { x: tip.x - dir.x * headLength, y: tip.y - dir.y * headLength };
    const left = { x: base.x + perp.x * (headWidth / 2), y: base.y + perp.y * (headWidth / 2) };
    const right = { x: base.x - perp.x * (headWidth / 2), y: base.y - perp.y * (headWidth / 2) };
    g.fillStyle(color, alpha);
    g.fillTriangle(tip.x, tip.y, left.x, left.y, right.x, right.y);
}

function colorFor(line: ArrowLine, hintedId: string | null): number {
    if (line.blocked) return lerpColor(ARROW, ARROW_BLOCKED, 0.85);
    if (line.flashSeconds > 0) {
        const flash = Math.max(0, Math.min(1, line.flashSeconds / 0.3));
        return lerpColor(ARROW, ARROW_BLOCKED, flash);
    }
    if (line.isAnimating) return ARROW_MOVING;
    if (line.id === hintedId) return ARROW_HINTED;
    return ARROW;
}

function opacityFor(line: ArrowLine): number {
    if (line.motion !== 'escaping') return 1;
    const travel = line.escapeTarget;
    if (travel <= 0) return 1;
    const fadeFrom = travel * (1 - ESCAPE_FADE_FRACTION);
    if (line.consumed <= fadeFrom) return 1;
    return 1 - Math.max(0, Math.min(1, (line.consumed - fadeFrom) / (travel - fadeFrom)));
}

function drawArrow(
    g: GameObjects.Graphics,
    line: ArrowLine,
    layout: WorldLayout,
    hintedId: string | null,
    pressedId: string | null,
): void {
    if (line.originPoints.length < 2 || layout.unit <= 0) return;
    const canvas = line.originPoints.map((point) => toCanvas(layout, point));
    const headDir = normalize(sub(canvas[canvas.length - 1], canvas[canvas.length - 2]), { x: 1, y: 0 });
    const tailDir = normalize(sub(canvas[1], canvas[0]), headDir);
    const unit = layout.unit;
    let stroke = Math.max(MIN_STROKE, Math.min(MAX_STROKE, unit * STROKE_FACTOR));
    stroke = Math.max(pixelRatio() * 2, Math.round(stroke));
    if (line.id === pressedId) stroke *= PRESS_STROKE_SCALE;
    const headLength = Math.max(unit * HEAD_LENGTH_FACTOR, stroke * 2.2);
    const headWidth = Math.max(unit * HEAD_WIDTH_FACTOR, stroke * 2);
    const alpha = opacityFor(line);
    if (alpha <= 0.01) return;
    const color = colorFor(line, hintedId);
    const lengthPx = line.originLength * unit;
    const inset = Math.min(headLength * 0.72, lengthPx * 0.8);

    let shaft: Vec[];
    let tip: Vec;
    let dir: Vec;
    if (Math.abs(line.consumed) < 1e-6) {
        shaft = canvas.slice(0, -1);
        const shaftEnd = {
            x: canvas[canvas.length - 1].x - headDir.x * inset,
            y: canvas[canvas.length - 1].y - headDir.y * inset,
        };
        shaft = [...shaft, shaftEnd];
        tip = canvas[canvas.length - 1];
        dir = headDir;
    } else {
        const slack = REBOUND_OVERSHOOT * unit + 1;
        const reach = (line.edgeDistance + EXIT_MARGIN) * unit + lengthPx + unit;
        const last = canvas[canvas.length - 1];
        const first = canvas[0];
        const path = metricOf([
            { x: first.x - tailDir.x * slack, y: first.y - tailDir.y * slack },
            ...canvas,
            { x: last.x + headDir.x * reach, y: last.y + headDir.y * reach },
        ]);
        const start = slack + line.consumed * unit;
        const end = start + lengthPx;
        shaft = extractPolyline(path, start, end - inset);
        const tipInfo = pointAlong(path, Math.max(0, Math.min(path.length, end)));
        tip = tipInfo.p;
        dir = tipInfo.dir;
    }
    strokePoly(g, shaft, stroke, color, alpha);
    drawHead(g, tip, dir, headLength, headWidth, color, alpha);
}

function drawDots(g: GameObjects.Graphics, layout: WorldLayout, anchor: Vec, viewW: number, viewH: number): void {
    if (layout.unit < 8) return;
    const firstX = anchor.x + Math.ceil(layout.minX - anchor.x - 1e-6);
    const firstY = anchor.y + Math.ceil(layout.minY - anchor.y - 1e-6);
    g.fillStyle(DOT, 1);
    for (let y = firstY; y <= layout.maxY + 1e-6; y += 1) {
        for (let x = firstX; x <= layout.maxX + 1e-6; x += 1) {
            const point = toCanvas(layout, { x, y });
            if (point.x < -4 || point.y < -4 || point.x > viewW + 4 || point.y > viewH + 4) continue;
            g.fillCircle(point.x, point.y, Math.max(1.5, pixelRatio()));
        }
    }
}

function drawGuides(
    g: GameObjects.Graphics,
    lines: ArrowLine[],
    layout: WorldLayout,
    showAll: boolean,
    guideId: string | null,
    viewW: number,
    viewH: number,
): void {
    const unit = layout.unit;
    for (const line of lines) {
        if (line.isGone || line.isAnimating) continue;
        if (!showAll && line.id !== guideId) continue;
        if (line.originPoints.length < 2) continue;
        const canvas = line.originPoints.map((point) => toCanvas(layout, point));
        const head = canvas[canvas.length - 1];
        const dir = normalize(sub(head, canvas[canvas.length - 2]), { x: 1, y: 0 });
        const reach = Math.max((line.edgeDistance + EXIT_MARGIN) * unit, Math.max(viewW, viewH));
        const far = { x: head.x + dir.x * reach, y: head.y + dir.y * reach };
        const side = { x: -dir.y * unit * 0.5, y: dir.x * unit * 0.5 };
        g.lineStyle(1, GUIDE, 0.3);
        g.beginPath();
        g.moveTo(head.x + side.x, head.y + side.y);
        g.lineTo(far.x + side.x, far.y + side.y);
        g.moveTo(head.x - side.x, head.y - side.y);
        g.lineTo(far.x - side.x, far.y - side.y);
        g.strokePath();
        g.lineStyle(1.5, GUIDE, 0.6);
        g.beginPath();
        g.moveTo(head.x, head.y);
        g.lineTo(far.x, far.y);
        g.strokePath();
    }
}

export function paintBoard(
    g: GameObjects.Graphics,
    controller: BoardController,
    layout: WorldLayout,
    viewW: number,
    viewH: number,
    pressedId: string | null,
): void {
    g.clear();
    if (layout.unit <= 0) return;
    const anchor = controller.lines[0]?.originPoints[0] ?? { x: 0, y: 0 };
    drawDots(g, layout, anchor, viewW, viewH);
    const showAll = controller.guidesVisible;
    const guideId = controller.guideLineId;
    if (showAll || guideId) {
        drawGuides(g, controller.lines, layout, showAll, guideId, viewW, viewH);
    }
    const moving: ArrowLine[] = [];
    for (const line of controller.lines) {
        if (line.motion === 'completed') continue;
        if (line.isAnimating) moving.push(line);
        else if (!line.isGone) drawArrow(g, line, layout, controller.hintedId, pressedId);
    }
    for (const line of moving) drawArrow(g, line, layout, controller.hintedId, pressedId);
}
