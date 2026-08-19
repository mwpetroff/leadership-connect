import { describe, expect, it } from "vitest";
import { parseScheduledInput, teamsOneHourWindow, toRfc3339 } from "../lib/meeting-time";

describe("parseScheduledInput", () => {
  it("maps a date-only string to 10:00 UTC (legacy Teams default)", () => {
    expect(parseScheduledInput("2027-09-15")?.toISOString()).toBe("2027-09-15T10:00:00.000Z");
  });

  it("keeps an explicit instant", () => {
    expect(parseScheduledInput("2027-09-15T14:30:00-05:00")?.toISOString()).toBe(
      "2027-09-15T19:30:00.000Z",
    );
  });

  it("returns undefined for empty", () => {
    expect(parseScheduledInput("")).toBeUndefined();
    expect(parseScheduledInput(null)).toBeUndefined();
  });
});

describe("teamsOneHourWindow", () => {
  it("emits RFC 3339 UTC with a Z suffix", () => {
    const start = new Date("2027-09-15T14:30:00.000Z");
    expect(teamsOneHourWindow(start)).toEqual({
      startDateTime: "2027-09-15T14:30:00Z",
      endDateTime: "2027-09-15T15:30:00Z",
    });
    expect(toRfc3339(start)).toBe("2027-09-15T14:30:00Z");
  });
});
