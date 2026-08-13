import type { SukkahConfig } from "@/lib/extension-engine";

interface Props {
  /** The sukkah being drawn (target of the extension, or a single sukkah). */
  target: SukkahConfig;
  /** Wall pieces along the door dimension. */
  doorFrame: number[];
  /** Wall pieces along the other dimension. */
  otherFrame: number[];
  /** Bars the customer already owns, by length. Anything not covered draws as "buy". */
  keepPool?: Record<number, number>;
}

/** Longest drawn side, in viewBox units. The viewBox itself is sized to the
 *  drawing, so the aspect ratio always matches the sukkah footprint. */
const MAX_DRAW = 580;
const MARGIN = 70;
/** Extra room under the drawing for the two caption lines. */
const CAPTION = 46;
const HALF = 6;

/**
 * Top-down extension diagram, a direct port of app.py `_draw_sukkah`:
 * every wall piece is drawn as one thin strip per rail level, green when a
 * matching bar is still available in the reuse pool and amber when it has to
 * be bought. Door piece gets a thick border, joints get posts, and flower
 * posts are drawn on the 10' grid when the config calls for them.
 */
export function ExtensionDiagram({ target, doorFrame, otherFrame, keepPool }: Props) {
  if (!doorFrame.length || !otherFrame.length) return null;

  const compare = !!keepPool;
  const pool: Record<number, number> = { ...(keepPool ?? {}) };
  const takeColor = (len: number) => {
    if (!compare) return "var(--diagram-panel-1)";
    if ((pool[len] ?? 0) > 0) {
      pool[len] -= 1;
      return "var(--diagram-panel-1)";
    }
    return "var(--diagram-custom)";
  };

  const totalLen = doorFrame.reduce((a, b) => a + b, 0);
  const totalWid = otherFrame.reduce((a, b) => a + b, 0);
  // Scale so the longest side hits MAX_DRAW, then size the viewBox around the
  // result. Previously the viewBox was a fixed 720x520 box while the <svg> was
  // `h-auto`, so any footprint whose aspect ratio differed from 720:520 was
  // letterboxed inside the viewBox *and* again inside the card — that is why a
  // 10x20 filled its card but a 10x13 rendered tiny (or clipped when the card
  // was shorter than the derived height).
  const scale = MAX_DRAW / Math.max(totalLen, totalWid);
  const drawLen = totalLen * scale;
  const drawWid = totalWid * scale;
  const VIEW_W = drawLen + MARGIN * 2;
  const VIEW_H = drawWid + MARGIN * 2 + CAPTION;
  const x0 = MARGIN;
  const y0 = MARGIN;
  const x1 = x0 + drawLen;
  const y1 = y0 + drawWid;

  const normalLevels = target.productLine === "DELUXE" ? 3 : 2;
  const doorLevels = 2;

  const nodes: React.ReactElement[] = [];
  let buyCount = 0;
  let keepCount = 0;

  const wall = (
    pieces: number[],
    horizontal: boolean,
    fixed: number,
    start: number,
    markDoor: boolean,
    labelDir: -1 | 1 = -1,
    key = "w"
  ) => {
    const doorPiece = markDoor ? Math.max(...pieces) : null;
    let doorMarked = false;
    let pos = start;
    pieces.forEach((piece, pi) => {
      const segLen = piece * scale;
      const isDoor = markDoor && piece === doorPiece && !doorMarked;
      if (isDoor) doorMarked = true;
      const levels = isDoor ? doorLevels : normalLevels;
      const thickness = 12 / levels;

      for (let i = 0; i < levels; i++) {
        const color = takeColor(piece);
        if (color === "var(--diagram-panel-1)") keepCount++;
        else buyCount++;
        const o0 = -6 + i * thickness;
        nodes.push(
          <rect
            key={`${key}-${pi}-${i}`}
            x={horizontal ? pos : fixed + o0}
            y={horizontal ? fixed + o0 : pos}
            width={horizontal ? segLen : thickness}
            height={horizontal ? thickness : segLen}
            fill={color}
            stroke={isDoor ? "var(--diagram-door)" : "var(--diagram-ink)"}
            strokeWidth={isDoor ? 2.5 : 0.75}
          />
        );
      }

      nodes.push(
        <text
          key={`${key}-${pi}-t`}
          x={horizontal ? pos + segLen / 2 : fixed + labelDir * 26}
          y={horizontal ? fixed - 14 : pos + segLen / 2 + 4}
          textAnchor="middle"
          fontSize="14"
          fill="var(--foreground)"
        >
          {piece}&apos;{isDoor ? " (door)" : ""}
        </text>
      );

      pos += segLen;
      if (pos < start + (horizontal ? drawLen : drawWid) - 0.5) {
        nodes.push(
          <circle
            key={`${key}-${pi}-j`}
            cx={horizontal ? pos : fixed}
            cy={horizontal ? fixed : pos}
            r={5}
            fill="var(--diagram-ink)"
          />
        );
      }
    });
  };

  wall(doorFrame, true, y0, x0, true, -1, "top");
  wall(doorFrame, true, y1, x0, false, -1, "bottom");
  wall(otherFrame, false, x0, y0, false, -1, "left");
  wall(otherFrame, false, x1, y0, false, 1, "right");

  // Adjustable-bar spans: only the dimension that drives the adjustor count.
  const doorJoints = doorFrame.length - 1;
  const otherJoints = otherFrame.length - 1;
  const adjustor = Math.max(doorJoints, otherJoints);
  const adjLines: React.ReactElement[] = [];
  if (doorJoints === adjustor) {
    let pos = x0;
    doorFrame.slice(0, -1).forEach((p, i) => {
      pos += p * scale;
      adjLines.push(
        <line key={`adjv-${i}`} x1={pos} y1={y0 + HALF} x2={pos} y2={y1 - HALF} stroke="var(--diagram-ink)" />
      );
    });
  }
  if (otherJoints === adjustor) {
    let pos = y0;
    otherFrame.slice(0, -1).forEach((p, i) => {
      pos += p * scale;
      adjLines.push(
        <line key={`adjh-${i}`} x1={x0 + HALF} y1={pos} x2={x1 - HALF} y2={pos} stroke="var(--diagram-ink)" />
      );
    });
  }

  // Flower posts on exact 10' marks.
  const flower: React.ReactElement[] = [];
  if (target.flowerNeeded) {
    const xJoints: number[] = [];
    let pos = x0;
    let real = 0;
    doorFrame.slice(0, -1).forEach((p) => {
      pos += p * scale;
      real += p;
      if (real % 10 === 0) xJoints.push(pos);
    });
    const yJoints: number[] = [];
    pos = y0;
    real = 0;
    otherFrame.slice(0, -1).forEach((p) => {
      pos += p * scale;
      real += p;
      if (real % 10 === 0) yJoints.push(pos);
    });
    yJoints.forEach((fy, i) =>
      flower.push(<line key={`fr-${i}`} x1={x0} y1={fy} x2={x1} y2={fy} stroke="var(--diagram-flower)" strokeWidth={2} />)
    );
    xJoints.forEach((fx, i) =>
      flower.push(<line key={`fc-${i}`} x1={fx} y1={y0} x2={fx} y2={y1} stroke="var(--diagram-flower)" strokeWidth={2} />)
    );
    xJoints.forEach((fx, i) =>
      yJoints.forEach((fy, j) =>
        flower.push(<circle key={`fp-${i}-${j}`} cx={fx} cy={fy} r={3.5} fill="var(--diagram-flower)" />)
      )
    );
  }

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full max-h-full w-full"
      role="img"
      aria-label={`Top-down diagram of a ${target.length} by ${target.width} foot sukkah showing reused and newly bought bars`}
    >
      <rect x={x0} y={y0} width={drawLen} height={drawWid} fill="var(--muted)" opacity="0.4" />
      {adjLines}
      {flower}
      {nodes}

      {[
        [x0, y0],
        [x1, y0],
        [x0, y1],
        [x1, y1],
      ].map(([cx, cy], i) => (
        <circle key={`c-${i}`} cx={cx} cy={cy} r={6} fill="var(--diagram-panel-3)" stroke="var(--diagram-ink)" />
      ))}

      <text
        x={(x0 + x1) / 2}
        y={y1 + 34}
        textAnchor="middle"
        fontSize="17"
        fontWeight="600"
        fill="var(--foreground)"
      >
        {target.length}&apos; x {target.width}&apos; ({target.productLine})
      </text>
      <text x={(x0 + x1) / 2} y={y1 + 54} textAnchor="middle" fontSize="15" fill="var(--muted-foreground)">
        {compare
          ? `${keepCount} existing bar${keepCount === 1 ? "" : "s"} · ${buyCount} new bar${buyCount === 1 ? "" : "s"}`
          : `${keepCount + buyCount} bar${keepCount + buyCount === 1 ? "" : "s"} total`}
      </text>
    </svg>
  );
}

/** Shared legend for the extension diagrams. */
export function ExtensionDiagramLegend({ comparison = true }: { comparison?: boolean }) {
  const item = (color: string, label: string, border?: string) => (
    <span key={label} className="flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-3 rounded-[2px]"
        style={{ background: color, border: border ? `2px solid ${border}` : "1px solid var(--diagram-ink)" }}
      />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {comparison
        ? [
            item("var(--diagram-panel-1)", "Existing part (reused)"),
            item("var(--diagram-custom)", "New part"),
          ]
        : item("var(--diagram-panel-1)", "Bar")}
      {item("var(--diagram-panel-1)", "Door (thick border)", "var(--diagram-door)")}
      {item("var(--diagram-ink)", "Joint (extension post)")}
      {item("var(--diagram-flower)", "Flower post (interior support)")}
    </div>
  );
}
