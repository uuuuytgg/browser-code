import { describe, expect, it } from "vitest";

import { assertInsideRoots } from "./path-security";

describe("path security", () => {
  it("allows paths inside the declared root", () => {
    expect(() => assertInsideRoots("D:\\vault\\articles\\note.md", ["D:\\vault"])).not.toThrow();
  });

  it("rejects paths outside the declared root", () => {
    expect(() => assertInsideRoots("D:\\other\\note.md", ["D:\\vault"])).toThrow(
      "PATH_OUTSIDE_ALLOWED_ROOT"
    );
  });
});
