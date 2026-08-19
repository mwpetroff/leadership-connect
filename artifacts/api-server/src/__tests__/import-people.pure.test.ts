import { describe, it, expect } from "vitest";
import {
  normalizeImportKey,
  detectHeaders,
  parseBoolFlag,
  parseStatus,
  parseRole,
  wouldCreateManagerCycle,
  validateImportRows,
} from "../lib/import-people";

describe("normalizeImportKey", () => {
  it("maps HRIS aliases", () => {
    expect(normalizeImportKey("Full Name")).toBe("name");
    expect(normalizeImportKey("work email")).toBe("email");
    expect(normalizeImportKey("manager email")).toBe("manageremail");
    expect(normalizeImportKey("hrbpEmail")).toBe("hrbpemail");
    expect(normalizeImportKey("is_hrbp")).toBe("ishrbp");
  });

  it("does not map first name onto name", () => {
    expect(normalizeImportKey("first name")).toBe("firstname");
  });
});

describe("detectHeaders", () => {
  it("treats omitted columns as absent so callers leave DB values alone", () => {
    const headers = detectHeaders(["name", "email"]);
    expect(headers.department).toBe(false);
    expect(headers.hrbpEmail).toBe(false);
    expect(headers.status).toBe(false);
    expect(headers.name).toBe(true);
  });
});

describe("parsers", () => {
  it("parses isHrbp flags", () => {
    expect(parseBoolFlag("yes")).toBe(true);
    expect(parseBoolFlag("0")).toBe(false);
    expect(parseBoolFlag("")).toBeNull();
    expect(parseBoolFlag("maybe")).toBeNull();
  });

  it("accepts FMLA as inactive", () => {
    expect(parseStatus("FMLA")).toBe("inactive");
    expect(parseStatus("active")).toBe("active");
    expect(parseStatus("nope")).toBeNull();
  });

  it("parses directory roles", () => {
    expect(parseRole("Secondary Leader")).toBe("secondary_leader");
    expect(parseRole("")).toBeNull();
    expect(parseRole("admin")).toBeNull();
  });
});

describe("wouldCreateManagerCycle", () => {
  it("rejects self and loops", () => {
    const map = new Map<number, number | null>([
      [1, null],
      [2, 1],
      [3, 2],
    ]);
    expect(wouldCreateManagerCycle(1, 1, map)).toBe(true);
    expect(wouldCreateManagerCycle(1, 3, map)).toBe(true);
    expect(wouldCreateManagerCycle(3, 1, map)).toBe(false);
  });
});

describe("validateImportRows", () => {
  it("clears optional fields when the column is present and the cell is empty", () => {
    const headers = detectHeaders(["name", "email", "department", "hrbpemail", "status"]);
    const { valid, skipped } = validateImportRows(
      [
        {
          rowNumber: 2,
          fields: { name: "Jane", email: "jane@x.com", department: "", hrbpemail: "", status: "" },
        },
      ],
      headers,
    );
    expect(skipped).toEqual([]);
    expect(valid[0].departmentName).toBeNull();
    expect(valid[0].hrbpEmail).toBeNull();
    expect(valid[0].status).toBe("active");
  });

  it("does not attach omitted columns", () => {
    const headers = detectHeaders(["name", "email"]);
    const { valid } = validateImportRows(
      [{ rowNumber: 2, fields: { name: "Jane", email: "jane@x.com" } }],
      headers,
    );
    expect(valid[0].departmentName).toBeUndefined();
    expect(valid[0].hrbpEmail).toBeUndefined();
    expect(valid[0].homeCity).toBeUndefined();
  });

  it("skips duplicate emails in the file", () => {
    const headers = detectHeaders(["name", "email"]);
    const { skipped, valid } = validateImportRows(
      [
        { rowNumber: 2, fields: { name: "A", email: "a@x.com" } },
        { rowNumber: 3, fields: { name: "A2", email: "a@x.com" } },
      ],
      headers,
    );
    expect(valid).toHaveLength(1);
    expect(skipped[0].reason).toMatch(/duplicate email/i);
  });
});
