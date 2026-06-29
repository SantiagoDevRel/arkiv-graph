import { describe, expect, it } from "vitest";
import {
  defaultExtendTarget,
  minExtendTarget,
  secondsToLocalInput,
  localInputToSeconds,
} from "../react/EntityActions.js";

const DAY = 86400;
const NOW = 1_750_000_000; // fixed unix seconds for determinism

describe("extend target helpers", () => {
  it("defaults to 30 days past the current expiry when it's still in the future", () => {
    const expiry = NOW + 10 * DAY;
    expect(defaultExtendTarget(expiry, NOW)).toBe(expiry + 30 * DAY);
  });

  it("defaults to 30 days past now when the entity is already expired", () => {
    const expiry = NOW - 5 * DAY; // already in the past
    expect(defaultExtendTarget(expiry, NOW)).toBe(NOW + 30 * DAY);
  });

  it("defaults from now when expiry is unknown", () => {
    expect(defaultExtendTarget(undefined, NOW)).toBe(NOW + 30 * DAY);
  });

  it("min target is always strictly after the current expiry / now", () => {
    expect(minExtendTarget(NOW + 10 * DAY, NOW)).toBe(NOW + 10 * DAY + 60);
    expect(minExtendTarget(NOW - 10 * DAY, NOW)).toBe(NOW + 60);
    expect(minExtendTarget(undefined, NOW)).toBe(NOW + 60);
  });
});

describe("datetime-local <-> unix seconds round-trip", () => {
  it("round-trips to the minute (datetime-local has no seconds)", () => {
    const minuteAligned = Math.floor(NOW / 60) * 60;
    const str = secondsToLocalInput(minuteAligned);
    expect(localInputToSeconds(str)).toBe(minuteAligned);
  });

  it("returns NaN / empty for invalid input", () => {
    expect(Number.isNaN(localInputToSeconds(""))).toBe(true);
    expect(secondsToLocalInput(Number.NaN)).toBe("");
  });
});
