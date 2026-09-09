import { describe, expect, it } from "vitest";
import { flowerPostInfo } from "./extension-engine";

describe("flowerPostInfo", () => {
  it("owner-confirmed rule: only one side over 12' -- no flower post", () => {
    expect(flowerPostInfo(24, 12, "SY").needed).toBe(false);
    expect(flowerPostInfo(36, 12, "SY").needed).toBe(false);
  });

  it("owner-confirmed rule: both sides over 12' -- flower post needed", () => {
    expect(flowerPostInfo(16, 16, "SY")).toMatchObject({ needed: true, numPosts: 1 });
    expect(flowerPostInfo(18, 18, "SY")).toMatchObject({ needed: true, numPosts: 4 });
    expect(flowerPostInfo(20, 20, "SY")).toMatchObject({ needed: true, numPosts: 1 });
    expect(flowerPostInfo(18, 16, "SY")).toMatchObject({ needed: true, numPosts: 2 });
    expect(flowerPostInfo(15, 15, "SY")).toMatchObject({ needed: true, numPosts: 1 });
    expect(flowerPostInfo(20, 15, "SY")).toMatchObject({ needed: true, numPosts: 1 });
  });

  it("uses raw interior-joint counts, not just joints landing on an exact 10-ft mark", () => {
    // 16' splits into [8, 8] -- a real joint at 8', not a round 10-ft
    // number. The old count10ftAlignedJoints() bug saw zero joints here
    // and silently skipped the flower post even when the gate passed.
    const r = flowerPostInfo(16, 16, "SY");
    expect(r.needed).toBe(true);
    expect(r.postCode).toBe("SYFP");
  });

  it("picks the Deluxe post code for the Deluxe product line", () => {
    expect(flowerPostInfo(16, 16, "DELUXE").postCode).toBe("DLFP");
  });
});
