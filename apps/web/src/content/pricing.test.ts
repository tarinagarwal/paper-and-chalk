import { describe, expect, it } from "vitest";

import { DEFAULT_CURRENCY, formatPrice, plans, type PlanId } from "./pricing";

const byId = (id: PlanId) => {
  const plan = plans.find((p) => p.id === id);
  if (!plan) throw new Error(`missing plan ${id}`);
  return plan;
};

describe("pricing data (SPEC.md section 28)", () => {
  it("has the four plans in order", () => {
    expect(plans.map((p) => p.id)).toEqual(["free", "pro", "team", "education"]);
  });

  it("defaults to INR", () => {
    expect(DEFAULT_CURRENCY).toBe("INR");
  });

  it("prices Free at 0, Pro at ₹299 / $6 and Team at ₹499 / $10 per seat", () => {
    expect(byId("free").price).toEqual({ INR: 0, USD: 0 });
    expect(byId("pro").price).toEqual({ INR: 299, USD: 6 });
    expect(byId("team").price).toEqual({ INR: 499, USD: 10 });
    expect(byId("team").unit).toMatch(/per seat/);
    expect(byId("education").price).toBeNull();
    expect(byId("education").priceLabel).toBe("Discounted Team");
  });

  it("lists the Free limits", () => {
    expect(byId("free").features).toEqual([
      "3 GB storage",
      "10 docs with collaborators",
      "20 AI actions a month",
      "30-day version history",
      "Audio up to 30 min per doc",
    ]);
  });

  it("lists the Pro limits", () => {
    expect(byId("pro").features).toEqual([
      "100 GB storage",
      "Unlimited docs and collaborators",
      "500 AI actions a month",
      "Unlimited version history",
      "Unlimited audio with transcription",
      "Offline pinning",
    ]);
  });

  it("lists the Team features", () => {
    expect(byId("team").features).toEqual([
      "Shared workspaces",
      "Classroom mode",
      "Admin controls",
      "Templates library",
      "Signing workflows",
    ]);
  });

  it("gives Education classroom distribution and grading", () => {
    expect(byId("education").features).toEqual(
      expect.arrayContaining(["Classroom distribution", "Grading"]),
    );
  });
});

describe("formatPrice", () => {
  it("formats rupees and dollars without decimals", () => {
    expect(formatPrice(299, "INR")).toBe("₹299");
    expect(formatPrice(6, "USD")).toBe("$6");
    expect(formatPrice(0, "INR")).toBe("₹0");
  });
});
