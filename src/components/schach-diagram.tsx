import { useMemo } from "react";
import { supportsPerMat, type MatResult } from "@/lib/schach-engine";
import { buildMatPlacements } from "@/lib/schach-layout";

export function SchachDiagram({
  result,
  sukkahW,
  sukkahL,
  poleFt,
}: {
  result: MatResult;
  sukkahW: number;
  sukkahL: number;
  poleFt: number;
}) {
  const nested = result["mat_breakdown"] as MatResult | undefined;
  const base = result.pole_ft ? result : nested ?? result;
  const alongFt = base.pole_ft ?? poleFt;
  const acrossFt = Math.abs(alongFt - sukkahW) < 0.001 ? sukkahL : sukkahW;
  const layout = useMemo(
    () => buildMatPlacements(result, acrossFt, alongFt),
    [result, acrossFt, alongFt],
  );
  if (!acrossFt || !alongFt || layout.placements.length === 0) return null;

  const viewWidth = 900;
  const viewHeight = 620;
  const padX = 80;
  const padTop = 84;
  const padBottom = 76;
  const scale = Math.min(
    (viewWidth - padX * 2) / acrossFt,
    (viewHeight - padTop - padBottom) / alongFt,
  );
  const boxWidth = acrossFt * scale;
  const boxHeight = alongFt * scale;
  const x0 = (viewWidth - boxWidth) / 2;
  const y0 = padTop + (viewHeight - padTop - padBottom - boxHeight) / 2;
  const palette = ["var(--diagram-panel-1)", "var(--diagram-panel-2)", "var(--diagram-panel-3)"];
  const totalSupports = base.supports?.total_supports ?? 0;

  // Collision-aware label sizing: start from the segment-derived font size,
  // shrink progressively for tight segments, and relocate the label outside
  // the mat with a leader line when even the smallest size will not fit.
  // Consecutive relocated labels alternate sides so they never stack.
  // Bold text advance ratio plus the halo stroke padding around each label.
  const CHAR_W = 0.64;
  const PAD = 14;
  let outsideCount = 0;
  const labelPlans = layout.placements.map((item) => {
    const rectX = x0 + item.x * scale;
    const rectY = y0 + item.y * scale;
    const width = item.width * scale;
    const height = item.length * scale;
    // Only the part of the mat inside the footprint is actually visible
    // (overhang is clipped), so labels must fit the VISIBLE box.
    const visLeft = Math.max(rectX, x0);
    const visRight = Math.min(rectX + width, x0 + boxWidth);
    const visWidth = Math.max(0, visRight - visLeft);
    const label = item.code || `${item.width}×${item.length}`;
    const maxFont = Math.min(
      26,
      Math.max(10, Math.min(visWidth / Math.max(2.6, label.length * CHAR_W), height / 2.6)),
    );
    const fits = (fs: number) =>
      label.length * fs * CHAR_W <= visWidth - PAD && fs * 1.5 <= height - 6;
    let fontSize = 10;
    for (const candidate of [maxFont, 18, 16, 14, 12, 11, 10]) {
      if (candidate > maxFont) continue;
      fontSize = candidate;
      if (fits(candidate)) break;
    }
    const outside = !fits(fontSize);
    if (outside) fontSize = 11;
    const side = outside ? (outsideCount++ % 2 === 0 ? -1 : 1) : 0;
    const cx = visLeft + visWidth / 2;
    const cy = rectY + height / 2;
    const half = (label.length * fontSize * CHAR_W) / 2;
    const ty = outside
      ? Math.min(
          y0 + boxHeight - fontSize,
          Math.max(y0 + fontSize, cy + side * (height / 2 + fontSize * 1.1)),
        )
      : cy;
    return {
      label,
      fontSize,
      outside,
      cx,
      cy,
      // Keep every label horizontally inside the footprint so nothing is cut off.
      tx: Math.min(x0 + boxWidth - half - 2, Math.max(x0 + half + 2, cx)),
      ty,
      showDimensions: !outside && height > fontSize * 3.2 && visWidth > 90,
    };
  });

  return (
    <svg
      viewBox={`0 0 ${viewWidth} ${viewHeight}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Top-down schach mat layout for a ${sukkahW} by ${sukkahL} foot sukkah`}
    >
      <defs>
        <clipPath id={`schach-footprint-${acrossFt}-${alongFt}`}>
          <rect x={x0} y={y0} width={boxWidth} height={boxHeight} />
        </clipPath>
      </defs>

      <line x1={x0} y1={y0 - 46} x2={x0 + boxWidth} y2={y0 - 46} stroke="currentColor" strokeWidth={1.5} opacity={0.5} />
      <text x={x0 + boxWidth / 2} y={y0 - 54} textAnchor="middle" fontSize={20} fontWeight={700} fill="currentColor">
        {acrossFt}&apos;
      </text>

      <g clipPath={`url(#schach-footprint-${acrossFt}-${alongFt})`}>
        {layout.placements.map((item, index) => {
          const x = x0 + item.x * scale;
          const y = y0 + item.y * scale;
          const width = item.width * scale;
          const height = item.length * scale;
          const plan = labelPlans[index]!;
          const { label, fontSize, showDimensions } = plan;
          return (
            <g key={`${item.reused ? "r" : "n"}-${index}`}>
              <rect
                x={x}
                y={y}
                width={width}
                height={height}
                fill={item.reused ? "var(--diagram-custom)" : palette[index % palette.length]}
                stroke="var(--diagram-ink)"
                strokeWidth={1.5}
                opacity={item.reused ? 0.58 : 1}
              />
              {Array.from({ length: supportsPerMat(item.width) }, (_, supportIndex) => {
                const supportX = x + (width * (supportIndex + 1)) / (supportsPerMat(item.width) + 1);
                return <line key={supportIndex} x1={supportX} y1={y + 3} x2={supportX} y2={y + height - 3} stroke="var(--diagram-ink)" strokeWidth={2} strokeDasharray="4 7" opacity={0.7} />;
              })}
              {plan.outside && (
                <line x1={plan.cx} y1={plan.cy} x2={plan.tx} y2={plan.ty} stroke="var(--diagram-ink)" strokeWidth={1} opacity={0.6} />
              )}
              <text x={plan.tx} y={plan.ty - (showDimensions ? fontSize * 0.5 : 0)} textAnchor="middle" dominantBaseline="middle" fontSize={fontSize} fontWeight={700} fill="var(--diagram-ink)" stroke="var(--card)" strokeWidth={5} paintOrder="stroke">
                {label}
              </text>
              {showDimensions && (
                <text x={plan.tx} y={plan.ty + fontSize * 0.9} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(10, fontSize * 0.6)} fill="var(--diagram-ink)" stroke="var(--card)" strokeWidth={5} paintOrder="stroke">
                  {item.width}×{item.length}{item.reused ? " (reuse)" : ""}
                </text>
              )}
            </g>
          );
        })}
      </g>

      <rect x={x0} y={y0} width={boxWidth} height={boxHeight} fill="none" stroke="var(--diagram-ink)" strokeWidth={3} />
      <text x={x0 - 26} y={y0 + boxHeight / 2} textAnchor="middle" fontSize={20} fontWeight={700} fill="currentColor" transform={`rotate(-90 ${x0 - 26} ${y0 + boxHeight / 2})`}>
        {alongFt}&apos;
      </text>
      <text x={x0 + boxWidth / 2} y={y0 + boxHeight + 26} textAnchor="middle" fontSize={16} fontWeight={600} fill="var(--diagram-ink)" opacity={0.85}>
        {totalSupports} supports
      </text>
      <text x={x0 + boxWidth / 2} y={y0 + boxHeight + 46} textAnchor="middle" fontSize={16} fill="currentColor" opacity={0.7}>
        {acrossFt}&apos; × {alongFt}&apos; · {layout.placements.length} mat{layout.placements.length === 1 ? "" : "s"}
        {layout.unplaced > 0 ? ` · ${layout.unplaced} not placed` : ""}
      </text>
    </svg>
  );
}