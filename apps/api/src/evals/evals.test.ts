import { describe, expect, it } from "vitest";
import { runMacroEvals } from "./runner";

describe("macro evals", () => {
  it("passes the initial text, photo-context, correction, and barcode eval set", async () => {
    const report = await runMacroEvals();
    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(report.total);
  });
});
