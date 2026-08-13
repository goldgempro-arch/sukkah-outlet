import { describe, expect, it } from "vitest";
import { OUR_SUKKAH_SIZES, bpnsSizes, runSchach } from "./schach-calc";

describe("OUR_SUKKAH_SIZES", () => {
  it("has the 31 curated sizes with no duplicates", () => {
    expect(OUR_SUKKAH_SIZES).toHaveLength(31);
    expect(new Set(OUR_SUKKAH_SIZES).size).toBe(31);
    expect(OUR_SUKKAH_SIZES[0]).toBe("4x4");
    expect(OUR_SUKKAH_SIZES.at(-1)).toBe("24x12");
    expect(OUR_SUKKAH_SIZES).toContain("6x8");
  });

  it("is independent of the BPNS pole table keys", () => {
    const bpns = new Set(bpnsSizes());
    expect(OUR_SUKKAH_SIZES.some((s) => !bpns.has(s))).toBe(true);
  });
});

describe("reuse option variety", () => {
  it("surfaces multiple options that use the existing mat", () => {
    const r = runSchach({
      matType: "Star-K",
      sukkahW: 12,
      sukkahL: 24,
      poleFt: 12,
      isOurSukkah: false,
      fedex: false,
      existing: [{ width: 8, roll: 12 }],
    });
    const reuseOpts = r.cheapOptions.filter((o) => (o.reused ?? []).length > 0);
    expect(reuseOpts.length).toBeGreaterThan(1);
    for (const o of reuseOpts) {
      const sum = (o.new_mats ?? []).reduce((s, m) => s + m.price * (m.qty ?? 1), 0);
      expect(o.total_new).toBeCloseTo(sum);
    }
  });
});
