import { describe, expect, it } from "vitest";
import { isValidSubmissionReason } from "@/lib/reason";

describe("submission reason", () => {
  it.each(["", "   ", "XX", "  short  ", "1234567890", "!!!!!!!!!!", "XXXXXXXXXX", "x X x X x X x X x X"])("rejects an insufficient explanation: %j", (reason) => {
    expect(isValidSubmissionReason(reason)).toBe(false);
  });
  it.each(["Worker cannot log in; hours confirmed on site.", "  Worker is unavailable this week.  ", "员工无法登录，已现场确认本周工时。"])("accepts a written explanation: %j", (reason) => {
    expect(isValidSubmissionReason(reason)).toBe(true);
  });
});
