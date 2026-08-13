import { describe, expect, it } from "vitest";
import {
  REAL_HEIGHTS,
  colorsForHeight,
  renderModular,
  windowAndDoorCodesForColor,
} from "./modular-engine";

describe("renderModular opening placement", () => {
  it("spills a second opening onto another wall instead of reporting it unplaced", () => {
    // Find a height/color that offers at least one window type.
    let picked: { height: string; color: string; typeCode: string } | null = null;
    for (const height of REAL_HEIGHTS) {
      for (const color of colorsForHeight(height)) {
        const { windowCodes } = windowAndDoorCodesForColor(height, color);
        if (windowCodes.length > 0) {
          picked = { height, color, typeCode: windowCodes[0]! };
          break;
        }
      }
      if (picked) break;
    }
    expect(picked).not.toBeNull();
    const { height, color, typeCode } = picked!;

    // Wall 1 is tiny (1 nominal ft), wall 2 is large: two openings both
    // assigned to wall 1 -- the second must land on wall 2.
    const result = renderModular({
      wallCount: 2,
      length1: 1,
      length2: 0,
      width1: 12,
      width2: 0,
      height,
      color,
      windows: [
        { typeCode, wallNumber: 1 },
        { typeCode, wallNumber: 1 },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.unplaced).toEqual([]);
    const wall2 = result.walls.find((w) => w.label.startsWith("Wall 2"));
    expect(wall2?.items.some(([code]) => code.endsWith(typeCode))).toBe(true);
  });

  it("reports entryIndex for openings that fit nowhere", () => {
    let picked: { height: string; color: string; typeCode: string } | null = null;
    for (const height of REAL_HEIGHTS) {
      for (const color of colorsForHeight(height)) {
        const { windowCodes } = windowAndDoorCodesForColor(height, color);
        if (windowCodes.length > 0) {
          picked = { height, color, typeCode: windowCodes[0]! };
          break;
        }
      }
      if (picked) break;
    }
    const { height, color, typeCode } = picked!;

    const result = renderModular({
      wallCount: 2,
      length1: 1,
      length2: 0,
      width1: 1,
      width2: 0,
      height,
      color,
      windows: [
        { typeCode, wallNumber: 1 },
        { typeCode, wallNumber: 1 },
        { typeCode, wallNumber: 1 },
      ],
    });

    expect(result.unplaced.length).toBeGreaterThan(0);
    expect(result.unplaced.every((u) => u.kind === "window")).toBe(true);
    expect(result.unplaced.map((u) => u.entryIndex)).toContain(2);
    expect(result.unplaced.every((u) => typeof u.entryIndex === "number")).toBe(true);
  });
});

