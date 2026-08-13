import type { MatResult } from "@/lib/schach-engine";

export interface MatPlacement {
  code: string;
  x: number;
  y: number;
  width: number;
  length: number;
  reused: boolean;
}

interface FreeRect {
  x: number;
  y: number;
  width: number;
  length: number;
}

const EPSILON = 0.001;

function hasGeneralReuseLayout(result: MatResult): boolean {
  return Boolean(
    result.general_reuse ||
      (Array.isArray(result.subset) &&
        (Array.isArray(result.fill_mats) || Array.isArray(result.gap_mats))) ||
      result.new_mats?.some((item) => item.gap_fill || item.fill_mat),
  );
}

function splitFreeRect(rect: FreeRect, width: number, length: number): FreeRect[] {
  return splitFreeRectImpl(rect, width, length);
}

function isMultiRowLayout(result: MatResult | undefined): result is MatResult {
  return Boolean(
    result?.multi_roll && Array.isArray(result.row_layouts) && result.row_layouts.length > 0,
  );
}

function splitFreeRectImpl(rect: FreeRect, width: number, length: number): FreeRect[] {
  const next: FreeRect[] = [];
  const rightWidth = rect.width - width;
  const bottomLength = rect.length - length;

  if (rightWidth > EPSILON) {
    next.push({ x: rect.x + width, y: rect.y, width: rightWidth, length: rect.length });
  }
  if (bottomLength > EPSILON) {
    next.push({ x: rect.x, y: rect.y + length, width, length: bottomLength });
  }
  return next;
}

function placePiece(
  free: FreeRect[],
  piece: { code: string; width: number; length: number; reused: boolean },
): MatPlacement | null {
  const index = free.findIndex(
    (rect) => piece.width <= rect.width + EPSILON && piece.length <= rect.length + EPSILON,
  );
  if (index < 0) {
    // Overhang fallback: the engine intentionally picks combos that overshoot the
    // span when no exact-fit combo exists. Draw the piece anyway (clipped by SVG)
    // instead of dropping it, as long as some free width exists at a row that is
    // deep enough for the piece.
    const overhangIndex = free.findIndex(
      (rect) => rect.width > EPSILON && piece.length <= rect.length + EPSILON,
    );
    if (overhangIndex < 0) return null;
    const oRect = free[overhangIndex];
    if (!oRect) return null;
    // The piece consumes the full remaining width of this rect; only a bottom
    // remainder (if any) stays free.
    const rest: FreeRect[] = [];
    const bottomLength = oRect.length - piece.length;
    if (bottomLength > EPSILON) {
      rest.push({ x: oRect.x, y: oRect.y + piece.length, width: oRect.width, length: bottomLength });
    }
    free.splice(overhangIndex, 1, ...rest);
    free.sort((a, b) => a.y - b.y || a.x - b.x || b.width * b.length - a.width * a.length);
    return { ...piece, x: oRect.x, y: oRect.y };
  }

  const rect = free[index];
  if (!rect) return null;
  free.splice(index, 1, ...splitFreeRect(rect, piece.width, piece.length));
  free.sort((a, b) => a.y - b.y || a.x - b.x || b.width * b.length - a.width * a.length);
  return { ...piece, x: rect.x, y: rect.y };
}

/**
 * Converts an aggregate quote result into bounded physical placements.
 * Reused mats are placed largest-first; every subsequent piece is fitted only
 * into a currently uncovered rectangle, so an L-shaped remainder stays an L.
 */
export function buildMatPlacements(
  result: MatResult,
  acrossFt: number,
  alongFt: number,
): { placements: MatPlacement[]; unplaced: number } {
  const nested = result["mat_breakdown"] as MatResult | undefined;
  const base = hasGeneralReuseLayout(result)
    ? result
    : nested && hasGeneralReuseLayout(nested)
      ? nested
      : nested ?? result;
  const free: FreeRect[] = [{ x: 0, y: 0, width: acrossFt, length: alongFt }];
  const placements: MatPlacement[] = [];
  let unplaced = 0;

  // Multi-roll results describe their own row-by-row layout: each row spans the
  // full width and rows stack in the depth direction. The generic bin-packer
  // fragments free space and silently drops later rows, so handle them here.
  const multi = isMultiRowLayout(result)
    ? result
    : nested && isMultiRowLayout(nested)
      ? nested
      : null;
  if (multi) {
    const rows = multi.row_layouts as NonNullable<MatResult["row_layouts"]>;
    let y = 0;
    for (const row of rows) {
      let x = 0;
      for (const mat of row.mats ?? []) {
        const count = Math.max(1, mat.qty_per_row ?? mat.qty ?? 1);
        for (let i = 0; i < count; i += 1) {
          if (!(mat.width > 0) || !(mat.roll > 0) || y >= alongFt - EPSILON) {
            unplaced += 1;
            continue;
          }
          // Draw the mat's TRUE size. Overhang past the sukkah edge is already
          // priced in by the engine, so let the SVG clipPath clip it visually
          // instead of shrinking the mat (matches the other layout branches).
          placements.push({
            code: mat.code ?? `${mat.width}×${mat.roll}`,
            x,
            y,
            width: mat.width,
            length: mat.roll,
            reused: false,
          });
          x += mat.width;
        }
      }
      y += row.roll || Math.max(0, ...(row.mats ?? []).map((m) => m.roll));
    }
    return { placements, unplaced };
  }

  // Single-roll, multi-row results describe their layout with qty_per_row /
  // rows on every mat entry. The generic bin-packer ignores that structure and
  // can overlap mats (it sorts by area and fills free rectangles), so lay the
  // rows out explicitly: each row repeats the same per-row mat sequence.
  const rowMats = base.new_mats ?? [];
  const hasRowStructure =
    !hasGeneralReuseLayout(base) &&
    (base.reused?.length ?? 0) === 0 &&
    rowMats.length > 0 &&
    rowMats.every((m) => (m.rows ?? 0) >= 1 && (m.qty_per_row ?? 0) >= 1 && m.width > 0 && m.roll > 0);
  if (hasRowStructure) {
    const rowCount = Math.max(...rowMats.map((m) => m.rows ?? 1));
    for (let row = 0; row < rowCount; row += 1) {
      let x = 0;
      let rowY = 0;
      for (const mat of rowMats) rowY = Math.max(rowY, mat.roll);
      const y = row * rowY;
      if (y >= alongFt - EPSILON) {
        unplaced += rowMats.reduce((sum, m) => sum + (row < (m.rows ?? 1) ? (m.qty_per_row ?? 1) : 0), 0);
        continue;
      }
      for (const mat of rowMats) {
        if (row >= (mat.rows ?? 1)) continue;
        for (let i = 0; i < (mat.qty_per_row ?? 1); i += 1) {
          placements.push({
            code: mat.code ?? `${mat.width}×${mat.roll}`,
            x,
            y,
            width: mat.width,
            length: mat.roll,
            reused: false,
          });
          x += mat.width;
        }
      }
    }
    return { placements, unplaced };
  }

  const reused = (base.reused ?? [])
    .flatMap((item) =>
      Array.from({ length: Math.max(1, item.qty ?? 1) }, () => ({
        code: `${item.width}×${item.roll}`,
        width: item.width,
        length: item.roll,
        reused: true,
      })),
    )
    .sort((a, b) => b.width * b.length - a.width * a.length);

  const purchased = (base.new_mats ?? [])
    .flatMap((item) =>
      Array.from({ length: Math.max(1, item.qty ?? 1) }, () => ({
        code: item.code ?? `${item.width}×${item.roll}`,
        width: item.width,
        length: item.roll,
        reused: false,
      })),
    )
    .sort((a, b) => b.width * b.length - a.width * a.length);

  if (hasGeneralReuseLayout(base) && Array.isArray(base.subset)) {
    let reusedX = 0;
    if (base.reused_stacked) {
      // Same-width reused mats stacked end-to-end in the DEPTH direction --
      // they share one x column, they are not laid out side by side. Advancing
      // the x-cursor per mat (as the side-by-side branch does) would push them
      // across the whole footprint and overlap/overflow the fill mats.
      let stackY = 0;
      let columnWidth = 0;
      for (const entry of base.subset as [number, number][]) {
        const [width, length] = entry;
        const usable = Math.min(length, alongFt - stackY);
        if (width <= acrossFt + EPSILON && usable > EPSILON) {
          placements.push({ code: `${width}×${length}`, x: 0, y: stackY, width, length: usable, reused: true });
          stackY += usable;
          columnWidth = Math.max(columnWidth, width);
        } else unplaced += 1;
      }
      reusedX = columnWidth;
    } else {
      for (const entry of base.subset as [number, number][]) {
        const [width, length] = entry;
        // A reused mat's ROLL length can legitimately exceed the sukkah depth
        // (e.g. a 12' roll in a 10' bay) -- the engine already accounts for
        // that overhang. Clamp the drawn length to the footprint instead of
        // rejecting the mat, and always advance the x-cursor by the mat's
        // full width so later fill mats land in the right column.
        const usableLength = Math.min(length, alongFt);
        const usableWidth = Math.min(width, acrossFt - reusedX);
        if (usableWidth > EPSILON && usableLength > EPSILON) {
          placements.push({
            code: `${width}×${length}`,
            x: reusedX,
            y: 0,
            width: usableWidth,
            length: usableLength,
            reused: true,
          });
        } else unplaced += 1;
        reusedX += width;
      }
    }

    const fillTuples = Array.isArray(base.fill_mats)
      ? base.fill_mats as [string, number, number, number, number, number, number][]
      : (base.new_mats ?? [])
          .filter((item) => item.fill_mat)
          .map((item) => [item.code, item.width, item.roll, item.price, item.qty ?? 1, item.qty_per_row ?? item.qty ?? 1, item.rows ?? 1] as [string, number, number, number, number, number, number]);
    // Fill mats from a single width-solve call all belong to the same
    // row(s) and must be placed side by side, continuing the x-cursor
    // across mat types -- not stacked as a separate row per mat type,
    // which is what the previous per-tuple loop did (it reset x and
    // advanced y for every distinct fill mat SKU).
    //
    // Fill mats are allowed to overhang the sukkah's width edge -- the
    // engine picks the cheapest mat to cover the remaining width and that
    // can be wider than the exact remainder when no smaller size exists.
    // That overhang is already priced in, so draw the mat (the SVG clips
    // visually at the sukkah boundary) instead of dropping it.
    const maxFillRows = fillTuples.reduce((m, t) => Math.max(m, t[6] || 1), 1);
    let fillY = 0;
    for (let row = 0; row < maxFillRows; row += 1) {
      let fillX = reusedX;
      let rowHeight = 0;
      for (const [code, width, roll, , qty, , rows] of fillTuples) {
        if (row >= Math.max(1, rows)) continue;
        const perRow = Math.max(1, qty);
        for (let item = 0; item < perRow; item += 1) {
          if (fillY + roll <= alongFt + EPSILON) {
            placements.push({ code, x: fillX, y: fillY, width, length: roll, reused: false });
          } else unplaced += 1;
          fillX += width;
        }
        rowHeight = Math.max(rowHeight, roll);
      }
      fillY += rowHeight;
    }

    const gapTuples = Array.isArray(base.gap_mats)
      ? base.gap_mats as [string, number, number, number, number, number, number][]
      : (base.new_mats ?? [])
          .filter((item) => item.gap_fill)
          .map((item) => [item.code, item.width, item.roll, item.price, item.qty ?? 1, item.covers_w ?? 0, item.covers_gap ?? 0] as [string, number, number, number, number, number, number]);
    // Distribute gap-fill mats across ALL reused mats that share this width
    // -- not just the first match. Two identical-width reused mats each
    // need their own gap coverage; piling both onto the first one causes
    // the second's gap-fill mat to be dropped as "not placed".
    const reusedTargets = placements.filter((item) => item.reused && item.y === 0);
    const gapCursor = new Map<number, number>();
    for (const [code, width, , , qty, coversWidth, gapDepth] of gapTuples) {
      let remainingQty = Math.max(1, qty);
      for (let ti = 0; ti < reusedTargets.length && remainingQty > 0; ti += 1) {
        const target = reusedTargets[ti];
        if (Math.abs(target.width - coversWidth) >= EPSILON) continue;
        let x = gapCursor.get(ti) ?? target.x;
        const depth = Math.min(gapDepth, alongFt - (target.y + target.length));
        if (depth <= EPSILON) continue;
        while (remainingQty > 0 && x < target.x + target.width - EPSILON) {
          const usedWidth = Math.min(width, target.x + target.width - x);
          if (usedWidth > EPSILON) {
            placements.push({ code, x, y: target.y + target.length, width: usedWidth, length: depth, reused: false });
            remainingQty -= 1;
          }
          x += width;
        }
        gapCursor.set(ti, x);
      }
      if (remainingQty > 0) unplaced += remainingQty;
    }

    return { placements, unplaced };
  }

  for (const piece of [...reused, ...purchased]) {
    if (!(piece.width > 0) || !(piece.length > 0)) {
      unplaced += 1;
      continue;
    }
    const placed = placePiece(free, piece);
    if (placed) placements.push(placed);
    else unplaced += 1;
  }

  return { placements, unplaced };
}

export function placementsAreBounded(
  placements: MatPlacement[],
  acrossFt: number,
  alongFt: number,
): boolean {
  return placements.every(
    (item, index) =>
      item.x >= -EPSILON &&
      item.y >= -EPSILON &&
      item.x + item.width <= acrossFt + EPSILON &&
      item.y + item.length <= alongFt + EPSILON &&
      placements.every(
        (other, otherIndex) =>
          index === otherIndex ||
          item.x + item.width <= other.x + EPSILON ||
          other.x + other.width <= item.x + EPSILON ||
          item.y + item.length <= other.y + EPSILON ||
          other.y + other.length <= item.y + EPSILON,
      ),
  );
}