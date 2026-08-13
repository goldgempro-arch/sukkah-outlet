import type React from "react";
import { splitWallFrame } from "@/lib/extension-engine";

interface Props {
  /** Wall that carries the door — always the first number of the size. */
  doorFt: number;
  /** The other wall. */
  sideFt: number;
  /** "SY" = 2 bars per wall level, "DELUXE"/UB = 3 (door piece always 2). */
  productLine?: string;
}

const VIEW_W = 760;
const VIEW_H = 520;
const MARGIN = 86;
const STRIP = 22;
const JOINT = 7;

function frame(ft: number): number[] {
  try {
    const [pieces] = splitWallFrame(ft);
    if (pieces?.length) return pieces;
  } catch {
    /* non-stocked length — fall back to the raw wall */
  }
  return [ft];
}

/** Top-down footprint of a canvas sukkah. Door always sits on the first dimension. */
export function CanvasDiagram({ doorFt, sideFt, productLine = "SY" }: Props) {
  if (!(doorFt > 0) || !(sideFt > 0)) return null;

  const normalLevels = productLine === "DELUXE" ? 3 : 2;
  const doorLevels = 2;

  const maxW = VIEW_W - MARGIN * 2;
  const maxH = VIEW_H - MARGIN * 2;
  const scale = Math.min(maxW / doorFt, maxH / sideFt);
  const w = doorFt * scale;
  const h = sideFt * scale;
  const x0 = (VIEW_W - w) / 2;
  const y0 = (VIEW_H - h) / 2;

  const doorPieces = frame(doorFt);
  const sidePieces = frame(sideFt);
  // The door sits on the largest piece of the door wall.
  const doorPiece = Math.max(...doorPieces);

  // Splice joints: where a wall is built from more than one bar, the pieces are
  // joined with an extension / adjustable bar. Mirrors adjustor = max(nL-1, nW-1).
  const adjustor = Math.max(doorPieces.length - 1, sidePieces.length - 1);

  const jointsH = (y: number, keyPrefix: string) => {
    const out: React.ReactElement[] = [];
    let cursor = x0;
    doorPieces.slice(0, -1).forEach((b, i) => {
      cursor += b * scale;
      out.push(
        <rect
          key={`${keyPrefix}-j-${i}`}
          x={cursor - JOINT / 2}
          y={y - 2}
          width={JOINT}
          height={STRIP + 4}
          rx={1.5}
          fill="var(--diagram-panel-3)"
          stroke="var(--border)"
        />
      );
    });
    return out;
  };

  const jointsV = (x: number, keyPrefix: string) => {
    const out: React.ReactElement[] = [];
    let cursor = y0;
    sidePieces.slice(0, -1).forEach((b, i) => {
      cursor += b * scale;
      out.push(
        <rect
          key={`${keyPrefix}-j-${i}`}
          x={x - 2}
          y={cursor - JOINT / 2}
          width={STRIP + 4}
          height={JOINT}
          rx={1.5}
          fill="var(--diagram-panel-3)"
          stroke="var(--border)"
        />
      );
    });
    return out;
  };

  const horizontal = (y: number, front: boolean) => {
    let cursor = x0;
    let usedDoor = false;
    return doorPieces.map((b, i) => {
      const bw = b * scale;
      const isDoor = front && b === doorPiece && !usedDoor;
      if (isDoor) usedDoor = true;
      const bars = isDoor ? doorLevels : normalLevels;
      const seg = (
        <g key={`${front ? "f" : "b"}-${i}`}>
          <rect
            x={cursor}
            y={y}
            width={bw}
            height={STRIP}
            rx={2}
            fill={isDoor ? "var(--diagram-panel-2)" : "var(--diagram-panel-1)"}
            stroke="var(--border)"
          />
          <text
            x={cursor + bw / 2}
            y={y + STRIP / 2 + 4}
            textAnchor="middle"
            fontSize="14"
            fill="var(--foreground)"
          >
            {isDoor ? `DOOR ${b}' · ${bars}× ${b}' bars` : `${b}' · ${bars}× ${b}' bars`}
          </text>
        </g>
      );
      cursor += bw;
      return seg;
    });
  };

  const vertical = (x: number, side: "l" | "r") => {
    let cursor = y0;
    return sidePieces.map((b, i) => {
      const bh = b * scale;
      const seg = (
        <g key={`${side}-${i}`}>
          <rect
            x={x}
            y={cursor}
            width={STRIP}
            height={bh}
            rx={2}
            fill="var(--diagram-panel-1)"
            stroke="var(--border)"
          />
          <text
            x={x + STRIP / 2}
            y={cursor + bh / 2}
            textAnchor="middle"
            fontSize="14"
            fill="var(--foreground)"
            transform={`rotate(-90 ${x + STRIP / 2} ${cursor + bh / 2})`}
          >
            {b}&apos; · {normalLevels}× {b}&apos; bars
          </text>
        </g>
      );
      cursor += bh;
      return seg;
    });
  };

  // Total bar tally, mirroring bars_by_length_from_frames.
  const tally: Record<number, number> = {};
  const add = (len: number, qty: number) => {
    tally[len] = (tally[len] ?? 0) + qty;
  };
  let counted = false;
  for (const p of doorPieces) {
    if (p === doorPiece && !counted) {
      add(p, doorLevels);
      counted = true;
    } else add(p, normalLevels);
  }
  for (const p of doorPieces) add(p, normalLevels);
  for (const p of sidePieces) add(p, 2 * normalLevels);
  const tallyText = Object.entries(tally)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([len, qty]) => `${qty} × ${len}' bars`)
    .join("   ·   ");
  const jointText = adjustor
    ? `${tallyText}   ·   ${adjustor} × extension + adjustable bar (wall splice)`
    : tallyText;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Top-down view of a ${doorFt} by ${sideFt} foot sukkah with the door on the ${doorFt} foot wall`}
    >
      <rect
        x={x0 + STRIP}
        y={y0 + STRIP}
        width={Math.max(0, w - STRIP * 2)}
        height={Math.max(0, h - STRIP * 2)}
        fill="var(--muted)"
        opacity="0.5"
      />

      {horizontal(y0 + h - STRIP, true)}
      {horizontal(y0, false)}
      {vertical(x0, "l")}
      {vertical(x0 + w - STRIP, "r")}

      {jointsH(y0 + h - STRIP, "f")}
      {jointsH(y0, "b")}
      {jointsV(x0, "l")}
      {jointsV(x0 + w - STRIP, "r")}

      {/* Corner uprights */}
      {[
        [x0, y0],
        [x0 + w - STRIP, y0],
        [x0, y0 + h - STRIP],
        [x0 + w - STRIP, y0 + h - STRIP],
      ].map(([cx, cy], i) => (
        <rect
          key={i}
          x={cx}
          y={cy}
          width={STRIP}
          height={STRIP}
          fill="var(--diagram-panel-3)"
          stroke="var(--border)"
        />
      ))}

      <text
        x={x0 + w / 2}
        y={y0 + h + 40}
        textAnchor="middle"
        fontSize="18"
        fontWeight="600"
        fill="var(--foreground)"
      >
        {doorFt}&apos; door wall (front)
      </text>
      <text
        x={x0 - 24}
        y={y0 + h / 2}
        textAnchor="middle"
        fontSize="18"
        fontWeight="600"
        fill="var(--foreground)"
        transform={`rotate(-90 ${x0 - 24} ${y0 + h / 2})`}
      >
        {sideFt}&apos; side wall
      </text>
      <text
        x={x0 + w / 2}
        y={y0 + h / 2}
        textAnchor="middle"
        fontSize="20"
        fontWeight="600"
        fill="var(--muted-foreground)"
      >
        {doorFt} × {sideFt}
      </text>
      <text
        x={x0 + w / 2}
        y={y0 + h / 2 + 22}
        textAnchor="middle"
        fontSize="15"
        fill="var(--muted-foreground)"
      >
        4 corner uprights
      </text>

      <text
        x={VIEW_W / 2}
        y={VIEW_H - 14}
        textAnchor="middle"
        fontSize="15"
        fill="var(--muted-foreground)"
      >
        {jointText}
      </text>
    </svg>
  );
}
