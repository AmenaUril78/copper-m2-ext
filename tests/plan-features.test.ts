import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("@/lib/copper/catalog");
  vi.resetModules();
});

async function loadTools() {
  vi.resetModules();
  return import("@/lib/copper/assistant/tools");
}

describe("get_plan_features", () => {
  it("says what the Free plan and Copper Plus each include", async () => {
    const { getPlanFeatures } = await loadTools();
    expect(getPlanFeatures().plans).toEqual([
      {
        id: "free",
        name: "Free",
        memoryDays: 30,
        notesHoursPerMonth: "10",
        refinedAnswers: false,
      },
      {
        id: "copper-plus",
        name: "Copper Plus",
        memoryDays: 365,
        notesHoursPerMonth: "Unlimited",
        refinedAnswers: true,
      },
    ]);
  });

  it("is about features, not prices", async () => {
    const { getPlanFeatures } = await loadTools();
    expect(JSON.stringify(getPlanFeatures())).not.toMatch(
      /monthlyUsd|annualUsd/,
    );
  });

  it("follows the catalog when a plan changes", async () => {
    vi.doMock("@/lib/copper/catalog", async (importOriginal) => {
      const real =
        await importOriginal<typeof import("@/lib/copper/catalog")>();
      return {
        ...real,
        getPlans: () =>
          real
            .getPlans()
            .map((plan) =>
              plan.id === "copper-plus"
                ? { ...plan, memoryDays: 90, notesHoursPerMonth: "50" }
                : plan,
            ),
      };
    });
    const { getPlanFeatures } = await loadTools();
    const plus = getPlanFeatures().plans.find((p) => p.id === "copper-plus");
    expect(plus).toMatchObject({ memoryDays: 90, notesHoursPerMonth: "50" });
  });

  it("is one of Copper's tools, described for the model, with no input", async () => {
    const { copperTools } = await loadTools();
    const tool = copperTools.get_plan_features;
    expect(tool.description).toMatch(/plan/i);
    expect(typeof tool.execute).toBe("function");
    // It takes no input: running it with nothing still gives both plans.
    const result = (await tool.execute!(
      {},
      { toolCallId: "test", messages: [], context: {} },
    )) as { plans: unknown[] };
    expect(result.plans).toHaveLength(2);
  });
});
