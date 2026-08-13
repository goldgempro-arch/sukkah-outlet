import { describe, expect, it } from "vitest";
import { buildMatPlacements, placementsAreBounded } from "@/lib/schach-layout";
import type { MatResult } from "@/lib/schach-engine";

function result(
  reused: { width: number; roll: number; qty: number }[],
  purchased: { code: string; width: number; roll: number; qty: number }[],
): MatResult {
  return {
    reused,
    new_mats: purchased.map((item) => ({ ...item, price: 1, line_total: item.qty })),
    total_new: purchased.reduce((sum, item) => sum + item.qty, 0),
  };
}

describe("buildMatPlacements", () => {
  it("draws an intentionally overhanging buy combo (13ft of mats in a 12ft span)", () => {
    const layout = buildMatPlacements(
      result([], [
        { code: "BMA0510", width: 5, roll: 10, qty: 1 },
        { code: "BMA0410", width: 4, roll: 10, qty: 2 },
      ]),
      12,
      10,
    );
    expect(layout.unplaced).toBe(0);
    expect(layout.placements).toHaveLength(3);
    const last = layout.placements[layout.placements.length - 1]!;
    expect(last.x + last.width).toBeGreaterThan(12);
    // no overlaps on the x axis
    const xs = layout.placements.map((p) => p.x).sort((a, b) => a - b);
    expect(xs).toEqual([0, 5, 9]);
  });

  it("keeps a fresh 20 by 15 layout inside its footprint", () => {
    const layout = buildMatPlacements(
      result([], [
        { code: "10x15-a", width: 10, roll: 15, qty: 1 },
        { code: "10x15-b", width: 10, roll: 15, qty: 1 },
      ]),
      20,
      15,
    );
    expect(layout.unplaced).toBe(0);
    expect(placementsAreBounded(layout.placements, 20, 15)).toBe(true);
  });

  it("leaves the two-foot gap visible under a reused 10 by 8 mat", () => {
    const layout = buildMatPlacements(
      result(
        [{ width: 10, roll: 8, qty: 1 }],
        [
          { code: "new-full", width: 10, roll: 10, qty: 1 },
          { code: "new-gap", width: 10, roll: 2, qty: 1 },
        ],
      ),
      20,
      10,
    );
    const reused = layout.placements.find((item) => item.reused);
    expect(reused).toMatchObject({ x: 0, y: 0, width: 10, length: 8 });
    expect(layout.unplaced).toBe(0);
    expect(placementsAreBounded(layout.placements, 20, 10)).toBe(true);
  });

  it("fills an L-shaped remainder without overlap", () => {
    const layout = buildMatPlacements(
      result(
        [{ width: 7, roll: 6, qty: 1 }],
        [
          { code: "right", width: 13, roll: 10, qty: 1 },
          { code: "bottom", width: 7, roll: 4, qty: 1 },
        ],
      ),
      20,
      10,
    );
    expect(layout.unplaced).toBe(0);
    expect(placementsAreBounded(layout.placements, 20, 10)).toBe(true);
  });

  it("places multiple reused mats largest-first and rejects overflow", () => {
    const layout = buildMatPlacements(
      result(
        [
          { width: 10, roll: 8, qty: 1 },
          { width: 5, roll: 2, qty: 1 },
          { width: 30, roll: 30, qty: 1 },
        ],
        [],
      ),
      20,
      10,
    );
    expect(layout.placements[0]).toMatchObject({ width: 10, length: 8 });
    expect(layout.unplaced).toBe(1);
    expect(placementsAreBounded(layout.placements, 20, 10)).toBe(true);
  });

  it("uses general-reuse metadata to crop gap-fill mats to the exact remainder", () => {
    const quote = result(
      [{ width: 10, roll: 8, qty: 1 }],
      [
        { code: "full", width: 5, roll: 10, qty: 2 },
        { code: "gap-a", width: 8, roll: 4, qty: 1 },
        { code: "gap-b", width: 4, roll: 4, qty: 1 },
      ],
    );
    quote.general_reuse = true;
    quote.subset = [[10, 8]];
    quote.fill_mats = [["full", 5, 10, 1, 2, 10, 1]];
    quote.gap_mats = [
      ["gap-a", 8, 4, 1, 1, 10, 2],
      ["gap-b", 4, 4, 1, 1, 10, 2],
    ];
    const layout = buildMatPlacements(quote, 20, 10);
    expect(layout.unplaced).toBe(0);
    expect(layout.placements.at(-1)).toMatchObject({ x: 8, y: 8, width: 2, length: 2 });
    expect(placementsAreBounded(layout.placements, 20, 10)).toBe(true);
  });
});
function gr(
  subset: [number, number][],
  fill: [string, number, number, number, number, number, number][],
  gap: [string, number, number, number, number, number, number][],
  extra: Partial<MatResult> = {},
): MatResult {
  const newMats = [
    ...fill.map(([code, width, roll, price, qty, , rows]) => ({
      code, width, roll, price, qty: qty * rows, qty_per_row: qty, rows,
      line_total: price * qty * rows, fill_mat: true,
    })),
    ...gap.map(([code, width, roll, price, qty, coversW, coversGap]) => ({
      code, width, roll, price, qty, qty_per_row: qty, rows: 1,
      line_total: price * qty, gap_fill: true, covers_w: coversW, covers_gap: coversGap,
    })),
  ];
  return {
    general_reuse: true,
    subset,
    fill_mats: fill,
    gap_mats: gap,
    reused: subset.map(([w, r]) => ({ width: w, roll: r, qty: 1 })),
    new_mats: newMats,
    not_reused: [],
    total_new: newMats.reduce((s, m) => s + m.line_total, 0),
    ...extra,
  } as MatResult;
}

// Bounded check that tolerates the intentional width-edge overhang of fill
// mats: pieces are clipped to the footprint before the overlap/bounds check.
function clipped(placements: ReturnType<typeof buildMatPlacements>["placements"], across: number, along: number) {
  return placements.map((p) => ({
    ...p,
    width: Math.min(p.width, across - p.x),
    length: Math.min(p.length, along - p.y),
  }));
}

describe("buildMatPlacements — cursor regression matrix", () => {

  it("pure fresh purchase, no reuse (20x12, two 10x12)", () => {
    const layout = buildMatPlacements(
      gr([], [["BMA1012", 10, 12, 180, 2, 12, 1]], []),
      20,
      12,
    );
    expect(layout.unplaced).toBe(0);
    expect(layout.placements).toHaveLength(2);
    expect(placementsAreBounded(layout.placements, 20, 12)).toBe(true);
  });

  it("one reused mat, no gap needed (roll === pole_ft)", () => {
    const layout = buildMatPlacements(
      gr([[6, 12]], [["BMA0812", 8, 12, 144, 1, 12, 1], ["BMA0612", 6, 12, 108, 1, 12, 1]], []),
      20,
      12,
    );
    expect(layout.unplaced).toBe(0);
    expect(layout.placements).toHaveLength(3);
    expect(placementsAreBounded(layout.placements, 20, 12)).toBe(true);
  });

  it("one reused mat needing gap-fill (12x20 + reused 6x10)", () => {
    const layout = buildMatPlacements(
      gr(
        [[6, 10]],
        [["BMA0812", 8, 12, 144, 1, 12, 1], ["BMA0612", 6, 12, 108, 1, 12, 1]],
        [["BMA0804", 8, 4, 48, 1, 6, 2]],
      ),
      20,
      12,
    );
    expect(layout.unplaced).toBe(0);
    expect(layout.placements).toHaveLength(4);
    expect(layout.placements.filter((p) => !p.reused)).toHaveLength(3);
    expect(placementsAreBounded(layout.placements, 20, 12)).toBe(true);
  });

  it("two reused mats of the SAME width each get their own gap-fill", () => {
    const layout = buildMatPlacements(
      gr(
        [[6, 10], [6, 10]],
        [["BMA0812", 8, 12, 144, 1, 12, 1]],
        [["BMA0604", 6, 4, 40, 2, 6, 2]],
      ),
      20,
      12,
    );
    expect(layout.unplaced).toBe(0);
    const gaps = layout.placements.filter((p) => p.code === "BMA0604");
    expect(gaps).toHaveLength(2);
    expect(gaps.map((g) => g.x).sort()).toEqual([0, 6]);
    expect(placementsAreBounded(layout.placements, 20, 12)).toBe(true);
  });

  it("two reused mats of DIFFERENT widths", () => {
    const layout = buildMatPlacements(
      gr(
        [[6, 10], [4, 12]],
        [["BMA1012", 10, 12, 180, 1, 12, 1]],
        [["BMA0604", 6, 4, 40, 1, 6, 2]],
      ),
      20,
      12,
    );
    expect(layout.unplaced).toBe(0);
    expect(layout.placements.find((p) => p.code === "BMA0604")).toMatchObject({ x: 0, y: 10, length: 2 });
    expect(placementsAreBounded(layout.placements, 20, 12)).toBe(true);
  });

  it("fill solve with two different SKUs stays on one row", () => {
    const layout = buildMatPlacements(
      gr([[6, 12]], [["BMA0812", 8, 12, 144, 1, 12, 1], ["BMA0612", 6, 12, 108, 1, 12, 1]], []),
      20,
      12,
    );
    expect(layout.unplaced).toBe(0);
    expect(layout.placements.every((p) => p.y === 0)).toBe(true);
    expect(layout.placements.map((p) => p.x)).toEqual([0, 6, 14]);
  });

  it("a fill mat that overhangs the width edge is still placed", () => {
    const layout = buildMatPlacements(
      gr([[6, 12]], [["BMA1012", 10, 12, 180, 1, 12, 1]], []),
      15,
      12,
    );
    expect(layout.unplaced).toBe(0);
    expect(placementsAreBounded(clipped(layout.placements, 15, 12), 15, 12)).toBe(true);
  });

  it("gap solve needing two different SKUs under one reused mat", () => {
    const layout = buildMatPlacements(
      gr(
        [[10, 8]],
        [["BMA1012", 10, 10, 180, 1, 10, 1]],
        [["gap-a", 8, 4, 40, 1, 10, 2], ["gap-b", 4, 4, 24, 1, 10, 2]],
      ),
      20,
      10,
    );
    expect(layout.unplaced).toBe(0);
    const gaps = layout.placements.filter((p) => p.y === 8);
    expect(gaps).toHaveLength(2);
    expect(gaps[0]).toMatchObject({ x: 0, width: 8 });
    expect(gaps[1]).toMatchObject({ x: 8, width: 2 });
    expect(placementsAreBounded(layout.placements, 20, 10)).toBe(true);
  });

  it("multi-row fill mats stack without resetting the row cursor", () => {
    const layout = buildMatPlacements(
      gr([], [["BMA0808", 8, 8, 120, 2, 8, 2]], []),
      16,
      16,
    );
    expect(layout.unplaced).toBe(0);
    expect(layout.placements).toHaveLength(4);
    expect(placementsAreBounded(layout.placements, 16, 16)).toBe(true);
  });

  it("stacked same-width reused mats share one column instead of marching across", () => {
    const layout = buildMatPlacements(
      gr([[6, 8], [6, 4]], [["BMA1412", 14, 12, 200, 1, 12, 1]], [], { reused_stacked: true }),
      20,
      12,
    );
    expect(layout.unplaced).toBe(0);
    const reused = layout.placements.filter((p) => p.reused);
    expect(reused[0]).toMatchObject({ x: 0, y: 0, length: 8 });
    expect(reused[1]).toMatchObject({ x: 0, y: 8, length: 4 });
    expect(layout.placements.find((p) => !p.reused)).toMatchObject({ x: 6, y: 0 });
    expect(placementsAreBounded(layout.placements, 20, 12)).toBe(true);
  });
  it("reused mat with roll longer than the sukkah depth is clamped, not dropped", () => {
    const layout = buildMatPlacements(
      gr([[4, 10], [6, 12]], [["BMA0510", 5, 10, 75, 2, 10, 1]], []),
      20,
      10,
    );
    expect(layout.unplaced).toBe(0);
    const reused = layout.placements.filter((p) => p.reused);
    expect(reused).toHaveLength(2);
    expect(reused[0]).toMatchObject({ x: 0, width: 4, length: 10 });
    expect(reused[1]).toMatchObject({ x: 4, width: 6, length: 10 });
    const fills = layout.placements.filter((p) => !p.reused);
    expect(fills.map((f) => f.x)).toEqual([10, 15]);
    expect(placementsAreBounded(layout.placements, 20, 10)).toBe(true);
  });
});

function multiRoll(rows: { roll: number; mats: [string, number, number, number][] }[]): MatResult {
  const newMats = rows.flatMap((r) =>
    r.mats.map(([code, width, roll, qty]) => ({
      code, width, roll, price: 1, qty, qty_per_row: qty, rows: 1, line_total: qty,
    })),
  );
  return {
    multi_roll: true,
    row_layouts: rows.map((r) => ({
      roll: r.roll,
      mats: r.mats.map(([code, width, roll, qty]) => ({
        code, width, roll, price: 1, qty, qty_per_row: qty,
      })),
    })),
    rows: rows.length,
    reused: [],
    new_mats: newMats,
    total_new: newMats.length,
  } as MatResult;
}

describe("buildMatPlacements — multi-roll row layouts", () => {
  it("places every mat of a 2-row 14x12 result row-by-row", () => {
    const layout = buildMatPlacements(
      multiRoll([
        { roll: 6, mats: [["BMA0606", 7, 6, 2]] },
        { roll: 6, mats: [["BMA0406", 4, 6, 2], ["BMA0606", 6, 6, 1]] },
      ]),
      14,
      12,
    );
    expect(layout.unplaced).toBe(0);
    expect(layout.placements).toHaveLength(5);
    expect(layout.placements.filter((p) => p.y === 0)).toHaveLength(2);
    expect(layout.placements.filter((p) => p.y === 6)).toHaveLength(3);
    expect(placementsAreBounded(layout.placements, 14, 12)).toBe(true);
  });

  it("handles a 3-row result with differing row depths", () => {
    const layout = buildMatPlacements(
      multiRoll([
        { roll: 8, mats: [["a", 10, 8, 1], ["b", 10, 8, 1]] },
        { roll: 6, mats: [["c", 5, 6, 4]] },
        { roll: 6, mats: [["d", 20, 6, 1]] },
      ]),
      20,
      20,
    );
    expect(layout.unplaced).toBe(0);
    expect(layout.placements).toHaveLength(7);
    expect(layout.placements.at(-1)).toMatchObject({ x: 0, y: 14, width: 20, length: 6 });
    expect(placementsAreBounded(layout.placements, 20, 20)).toBe(true);
  });

  it("still places a short row instead of dropping it", () => {
    const layout = buildMatPlacements(
      multiRoll([
        { roll: 5, mats: [["a", 8, 5, 1]] },
        { roll: 5, mats: [["b", 12, 5, 1]] },
      ]),
      12,
      10,
    );
    expect(layout.unplaced).toBe(0);
    expect(layout.placements).toHaveLength(2);
    expect(placementsAreBounded(layout.placements, 12, 10)).toBe(true);
  });

  it("draws a multi-roll mat at its true width when it overhangs the sukkah", () => {
    const layout = buildMatPlacements(
      multiRoll([
        { roll: 6, mats: [["a", 8, 6, 1], ["b", 8, 6, 1]] },
        { roll: 6, mats: [["c", 14, 6, 1]] },
      ]),
      12,
      12,
    );
    expect(layout.unplaced).toBe(0);
    // Second mat of row 1 overhangs (8 + 8 > 12) and must keep its full width.
    expect(layout.placements[1]).toMatchObject({ x: 8, width: 8, length: 6 });
    expect(layout.placements[2]).toMatchObject({ x: 0, y: 6, width: 14, length: 6 });
  });
});
