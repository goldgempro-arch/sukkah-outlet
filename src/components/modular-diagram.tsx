import { useMemo } from "react";

import {
  NOMINAL_SIZES,
  REAL_TO_NOMINAL,
  fillWall,
  wallLengths,
  widthsForColor,
  renderModular,
  type WindowDoorEntry,
  type WallCount,
} from "@/lib/modular-engine";

interface Props {
  wallCount: WallCount;
  length1: number;
  length2: number;
  width1: number;
  width2: number;
  height: string;
  color: string;
  windows?: WindowDoorEntry[];
  doors?: WindowDoorEntry[];
}

const STRIP = 26;
const MARGIN_X = 120;
const MARGIN_Y = 100;
const MAX_W = 650;
const MAX_H = 440;
const VIEW_W = 900;
const VIEW_H = 640;

const PANEL_FILLS = ["var(--diagram-panel-1)", "var(--diagram-panel-2)", "var(--diagram-panel-3)"];

interface Seg {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  custom: boolean;
  opening: boolean;
  index: number;
  /** Font size for this segment's label (shrinks on tight segments). */
  fontSize: number;
  /** Offset from the segment centre, used to stagger colliding labels. */
  dx: number;
  dy: number;
  /** Whether the label is drawn outside the strip (needs a leader line). */
  outside: boolean;
}

interface Piece {
  segs: Seg[];
  labelX: number;
  labelY: number;
  labelName: string;
  labelLen: string;
  anchor: "middle" | "start" | "end";
}

export function ModularDiagram({
  wallCount,
  length1,
  length2,
  width1,
  width2,
  height,
  color,
  windows = [],
  doors = [],
}: Props) {
  const model = useMemo(() => {
    const walls = wallLengths({
      wallCount,
      length1,
      length2,
      width1,
      width2,
    });
    if (!color || walls.some(([, len]) => !len || len <= 0)) return null;

    const availableNominal = widthsForColor(height, color)
      .map((w) => REAL_TO_NOMINAL[Number(w)])
      .filter((n): n is number => typeof n === "number")
      .sort((a, b) => a - b);
    if (availableNominal.length === 0) return null;

    // Real per-wall breakdown (openings placed first, then plain panels).
    const rendered = renderModular({
      wallCount,
      length1,
      length2,
      width1,
      width2,
      height,
      color,
      windows,
      doors,
    });
    const byLabel = new Map(rendered.walls.map((w) => [w.label, w]));

    const pieces: Piece[] = [];

    const drawWall = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      name: string,
      lenFt: number,
      horizontal: boolean
    ) => {
      const wallResult = byLabel.get(name);
      let parts: {
        widthIn: number;
        label: string;
        opening: boolean;
        custom: boolean;
      }[] = [];
      let leftoverNominal = 0;

      if (wallResult) {
        leftoverNominal = wallResult.leftoverNominal;
        parts = wallResult.items.map(([code]) => {
          const m = /^GM(\d{2})(\d{2})([A-Z]{2})([A-Z]{2})$/.exec(code);
          const widthIn = m ? Number(m[1]) : 0;
          const typ = m ? m[4] : "PA";
          const opening = typ !== "PA" && typ !== "CP";
          const short = ["LI", "LO", "RI", "RO", "LD", "RD"].includes(typ) ? "Door" : "Window";
          return {
            widthIn,
            label: opening ? `${widthIn}" ${short}` : `${widthIn}"`,
            opening,
            custom: false,
          };
        });
      } else {
        const [panelNominals, leftover] = fillWall(lenFt, availableNominal);
        leftoverNominal = leftover;
        parts = panelNominals.map((n) => ({
          widthIn: NOMINAL_SIZES[n] ?? 0,
          label: `${NOMINAL_SIZES[n] ?? 0}"`,
          opening: false,
          custom: false,
        }));
      }
      if (leftoverNominal > 0) {
        parts.push({
          widthIn: leftoverNominal * 12,
          label: `${leftoverNominal}ft*`,
          opening: false,
          custom: true,
        });
      }

      const totalUnits = parts.reduce((a, p) => a + p.widthIn, 0) || 1;
      const runPx = horizontal ? x1 - x0 : y1 - y0;
      let pos = 0;
      const segs: Seg[] = [];
      parts.forEach((part, i) => {
        const segPx = runPx * (part.widthIn / totalUnits);
        // Estimate the rendered text width and shrink / stagger tight labels
        // so neighbouring segments never overprint one another.
        // Horizontal walls: the label must fit the segment's WIDTH.
        // Vertical walls: the text runs across the strip, so the limit is the
        // segment's HEIGHT (line height) instead.
        const needAt = (fs: number) =>
          horizontal ? part.label.length * fs * 0.55 : fs * 1.15;
        const avail = (horizontal ? segPx : segPx) - 3;
        let fontSize = 13;
        if (needAt(fontSize) > avail) fontSize = 11;
        if (needAt(fontSize) > avail) fontSize = 9;
        const outside = needAt(fontSize) > avail;
        // Labels moved outside the strip have room again — keep them readable.
        if (outside) fontSize = 12;
        const slot = outside ? (segs.filter((s) => s.outside).length % 2 === 0 ? -1 : 1) : 0;
        segs.push({
          x: horizontal ? x0 + pos : x0 - STRIP / 2,
          y: horizontal ? y0 - STRIP / 2 : y0 + pos,
          w: horizontal ? segPx : STRIP,
          h: horizontal ? STRIP : segPx,
          label: part.label,
          custom: part.custom,
          opening: part.opening,
          index: i,
          fontSize,
          dx: horizontal ? 0 : slot * (STRIP / 2 + 46),
          dy: horizontal ? slot * (STRIP / 2 + 13) : 0,
          outside,
        });
        pos += segPx;
      });
      pieces.push({
        segs,
        labelX: horizontal
          ? (x0 + x1) / 2
          : x0 > VIEW_W / 2
            ? x0 - STRIP - 12
            : x0 + STRIP + 12,
        labelY: horizontal ? y0 - STRIP - 8 : (y0 + y1) / 2,
        labelName: name,
        labelLen: `${lenFt} ft`,
        anchor: horizontal ? "middle" : x0 > VIEW_W / 2 ? "end" : "start",
      });
    };

    let outline: { x: number; y: number; w: number; h: number } | null = null;
    let note = "";
    let noteX = VIEW_W / 2;
    let noteY = 0;

    if (wallCount === 4) {
      const [w0, w1, w2, w3] = walls as [string, number][];
      const scale = Math.min(
        MAX_W / Math.max(w0[1], w2[1], 0.1),
        MAX_H / Math.max(w1[1], w3[1], 0.1)
      );
      const x0 = MARGIN_X;
      const y0 = MARGIN_Y;
      const x1 = x0 + w0[1] * scale;
      const y1 = y0 + w1[1] * scale;
      outline = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      drawWall(x0, y0, x1, y0, w0[0], w0[1], true);
      drawWall(x1, y0, x1, y1, w1[0], w1[1], false);
      drawWall(x0, y1, x1, y1, w2[0], w2[1], true);
      drawWall(x0, y0, x0, y1, w3[0], w3[1], false);
    } else if (wallCount === 3) {
      const [w0, w1, w2] = walls as [string, number][];
      const scale = Math.min(MAX_W / Math.max(w0[1], 0.1), MAX_H / Math.max(w1[1], w2[1], 0.1));
      const x0 = MARGIN_X;
      const y0 = MARGIN_Y;
      const x1 = x0 + w0[1] * scale;
      const yLeft = y0 + w1[1] * scale;
      const yRight = y0 + w2[1] * scale;
      drawWall(x0, y0, x1, y0, w0[0], w0[1], true);
      drawWall(x0, y0, x0, yLeft, w1[0], w1[1], false);
      drawWall(x1, y0, x1, yRight, w2[0], w2[1], false);
      note = "(open at the front)";
      noteX = (x0 + x1) / 2;
      noteY = Math.max(yLeft, yRight) + 30;
    } else if (wallCount === 1) {
      const [w0] = walls as [string, number][];
      const scale = MAX_W / Math.max(w0[1], 0.1);
      const x0 = MARGIN_X;
      const y0 = MARGIN_Y + MAX_H / 2;
      const x1 = x0 + w0[1] * scale;
      drawWall(x0, y0, x1, y0, w0[0], w0[1], true);
      note = "(single standalone wall)";
      noteX = (x0 + x1) / 2;
      noteY = y0 + 30;
    } else {
      const [w0, w1] = walls as [string, number][];
      const scale = Math.min(MAX_W / Math.max(w0[1], 0.1), MAX_H / Math.max(w1[1], 0.1));
      const x0 = MARGIN_X;
      const y0 = MARGIN_Y;
      const x1 = x0 + w0[1] * scale;
      const y1 = y0 + w1[1] * scale;
      drawWall(x0, y0, x1, y0, w0[0], w0[1], true);
      drawWall(x1, y0, x1, y1, w1[0], w1[1], false);
      note = "(open on the other two sides)";
      noteX = x0 + 60;
      noteY = y1 + 30;
    }

    const title =
      wallCount === 4
        ? "Box shape — 4 walls"
        : wallCount === 3
          ? "C shape — 3 walls"
          : wallCount === 2
            ? "L shape — 2 walls"
            : "Single wall";
    return { pieces, outline, note, noteX, noteY, title };
  }, [
    wallCount,
    length1,
    length2,
    width1,
    width2,
    height,
    color,
    windows,
    doors,
  ]);

  if (!model) {
    return (
      <p className="text-sm text-muted-foreground">
        Set the wall sizes and pick a color to see the layout diagram.
      </p>
    );
  }

  return (
    <div className="h-full w-full">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${model.title} modular sukkah panel layout, top-down view`}
        className="h-full max-h-full w-full"
      >
        <text
          x={VIEW_W / 2}
          y={34}
          textAnchor="middle"
          className="fill-foreground font-display text-[20px] font-semibold"
        >
          {model.title}
        </text>

        {model.outline && (
          <rect
            x={model.outline.x}
            y={model.outline.y}
            width={model.outline.w}
            height={model.outline.h}
            fill="none"
            stroke="var(--border)"
            strokeDasharray="4 3"
          />
        )}

        {model.pieces.map((piece, pi) => (
          <g key={pi}>
            {piece.segs.map((s, si) => (
              <g key={si}>
                <rect
                  x={s.x}
                  y={s.y}
                  width={s.w}
                  height={s.h}
                  fill={
                    s.custom
                      ? "var(--diagram-custom)"
                      : s.opening
                        ? "var(--accent)"
                        : PANEL_FILLS[s.index % 3]
                  }
                  stroke="var(--foreground)"
                  strokeOpacity={s.opening ? 0.8 : 0.45}
                />
                {s.outside && (
                  <line
                    x1={s.x + s.w / 2}
                    y1={s.y + s.h / 2}
                    x2={s.x + s.w / 2 + s.dx}
                    y2={s.y + s.h / 2 + s.dy}
                    stroke="var(--border)"
                    strokeWidth={1}
                  />
                )}
                <text
                  x={s.x + s.w / 2 + s.dx}
                  y={s.y + s.h / 2 + s.dy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={s.fontSize}
                  className={
                    s.outside
                      ? "fill-foreground"
                      : s.opening
                        ? "fill-accent-foreground font-semibold"
                        : "fill-[var(--diagram-ink)]"
                  }
                >
                  {s.label}
                </text>
              </g>
            ))}
            <text
              x={piece.labelX}
              y={piece.labelY - 9}
              textAnchor={piece.anchor}
              dominantBaseline="central"
              className="fill-foreground text-[15px] font-semibold"
            >
              <tspan x={piece.labelX} dy="0">
                {piece.labelName}
              </tspan>
              <tspan x={piece.labelX} dy="18">
                {piece.labelLen}
              </tspan>
            </text>
          </g>
        ))}

        {model.note && (
          <text
            x={model.noteX}
            y={model.noteY}
            textAnchor="middle"
            className="fill-muted-foreground text-[15px] italic"
          >
            {model.note}
          </text>
        )}

      </svg>
    </div>
  );
}
