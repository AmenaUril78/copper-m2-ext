// Module 2: the tools Ask Copper can use (four from the course, plus
// get_plan_features, added in this extension). Products and prices come from
// lib/copper/catalog.ts and stock from lib/copper/inventory.ts, so the
// chatbot never has to make them up.
// The contract for each tool is in specs/module-2/spec.md.
import { tool } from "ai";
import { z } from "zod";
import {
  getPlans,
  getProducts,
  type Plan,
  type ProductId,
} from "@/lib/copper/catalog";
import { readInventory } from "@/lib/copper/inventory";

export type ProductList = {
  products: {
    id: ProductId;
    name: string;
    type: string;
    priceUsd: number;
    colors: string[];
  }[];
};

export type Prices = {
  products: { id: ProductId; name: string; priceUsd: number }[];
  plans: {
    id: Plan["id"];
    name: string;
    monthlyUsd: number;
    annualUsd: number;
  }[];
};

export type PlanFeatures = {
  plans: {
    id: Plan["id"];
    name: string;
    memoryDays: number;
    /** A number of hours, or "Unlimited". */
    notesHoursPerMonth: string;
    refinedAnswers: boolean;
  }[];
};

export type CalculateCostInput = {
  products: ProductId[];
  plan: Plan["id"];
  billing: "monthly" | "annual";
  years: number;
};

export type CostBreakdown = {
  lines: { item: string; usd: number }[];
  totalUsd: number;
};

export type CheckAvailabilityInput = { product: ProductId; color?: string };

export type Stock = "in_stock" | "low_stock" | "backordered";

export type Availability =
  | {
      status: "ok";
      product: string;
      colors: { color: string; stock: Stock; restockDate: string | null }[];
    }
  | { status: "not_a_color"; product: string; color: string; colors: string[] }
  | { status: "unavailable"; message: string };

const PRODUCT_IDS = ["copper-home", "copper-notes"] as const;

/** Round to whole cents, so 7.99 × 12 × 2 doesn't carry float drift. */
function toCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** get_products: what Copper sells and which colors each one comes in. */
export function listProducts(): ProductList {
  return {
    products: getProducts().map(({ id, name, type, priceUsd, colors }) => ({
      id,
      name,
      type,
      priceUsd,
      colors,
    })),
  };
}

/** get_prices: every product and plan price, read from the catalog. */
export function getPrices(): Prices {
  return {
    products: getProducts().map(({ id, name, priceUsd }) => ({
      id,
      name,
      priceUsd,
    })),
    plans: getPlans().map(({ id, name, monthlyUsd, annualUsd }) => ({
      id,
      name,
      monthlyUsd,
      annualUsd,
    })),
  };
}

/** get_plan_features: what each plan includes, read from the catalog. */
export function getPlanFeatures(): PlanFeatures {
  return {
    plans: getPlans().map(
      ({ id, name, memoryDays, notesHoursPerMonth, refinedAnswers }) => ({
        id,
        name,
        memoryDays,
        notesHoursPerMonth,
        refinedAnswers,
      }),
    ),
  };
}

export const calculateCostInput: z.ZodType<CalculateCostInput> = z
  .object({
    products: z.array(z.enum(PRODUCT_IDS)).min(0).max(5),
    plan: z.enum(["free", "copper-plus"]),
    billing: z.enum(["monthly", "annual"]),
    years: z.number().int().min(1).max(5),
  })
  .strict();

/** calculate_cost: the total cost of devices plus a plan over some years. */
export function calculateCost(input: CalculateCostInput): CostBreakdown {
  const products = getProducts();
  const lines: CostBreakdown["lines"] = [];

  for (const id of input.products) {
    const product = products.find((p) => p.id === id);
    if (!product) throw new Error(`Unknown product: ${id}`);
    lines.push({ item: product.name, usd: toCents(product.priceUsd) });
  }

  // Copper Plus covers the whole household, so it's one line however many
  // devices there are. The free plan costs nothing, so it adds no line.
  if (input.plan !== "free") {
    const plan = getPlans().find((p) => p.id === input.plan);
    if (!plan) throw new Error(`Unknown plan: ${input.plan}`);
    const usd =
      input.billing === "monthly"
        ? plan.monthlyUsd * 12 * input.years
        : plan.annualUsd * input.years;
    const unit = input.years === 1 ? "year" : "years";
    lines.push({
      item: `${plan.name}, ${input.billing}, ${input.years} ${unit}`,
      usd: toCents(usd),
    });
  }

  return {
    lines,
    totalUsd: toCents(lines.reduce((sum, line) => sum + line.usd, 0)),
  };
}

export const checkAvailabilityInput: z.ZodType<CheckAvailabilityInput> = z
  .object({
    product: z.enum(PRODUCT_IDS),
    color: z.string().optional(),
  })
  .strict();

function stockOf(units: number): Stock {
  if (units <= 0) return "backordered";
  return units < 10 ? "low_stock" : "in_stock";
}

/** check_availability: stock for one product (or one of its colors), read fresh each time. */
export async function checkAvailability(
  input: CheckAvailabilityInput,
): Promise<Availability> {
  const product = getProducts().find((p) => p.id === input.product);
  if (!product) throw new Error(`Unknown product: ${input.product}`);

  // A blank color means "every color".
  const asked = input.color?.trim() || undefined;
  let wanted = product.colors;
  if (asked !== undefined) {
    const match = product.colors.find(
      (c) => c.toLowerCase() === asked.toLowerCase(),
    );
    // Checked before stock is read, so this holds even when stock is down.
    if (!match) {
      return {
        status: "not_a_color",
        product: product.name,
        color: input.color as string,
        colors: product.colors,
      };
    }
    wanted = [match];
  }

  // Read every time: stock changes, so it's never saved.
  const rows = await readInventory();
  if (rows === null) {
    return {
      status: "unavailable",
      message: "Stock can't be checked right now. Please try again soon.",
    };
  }

  const colors: Extract<Availability, { status: "ok" }>["colors"] = [];
  for (const color of wanted) {
    const row = rows.find(
      (r) => r.product === product.name && r.color === color,
    );
    if (!row) continue; // no row: leave the color out
    const stock = stockOf(row.units_in_stock);
    colors.push({
      color,
      stock,
      restockDate: stock === "backordered" ? row.next_shipment : null,
    });
  }
  return { status: "ok", product: product.name, colors };
}

const get_products = tool({
  description:
    "List every Copper product with its type, price and the colors it comes in (not whether a color is in stock).",
  inputSchema: z.object({}),
  execute: async () => listProducts(),
});

const get_prices = tool({
  description: "Get the price of every Copper product and every plan.",
  inputSchema: z.object({}),
  execute: async () => getPrices(),
});

const get_plan_features = tool({
  description:
    "Say what the Free plan and Copper Plus each include: how long Copper remembers, Copper Notes hours per month, and whether answers are refined (not their prices).",
  inputSchema: z.object({}),
  execute: async () => getPlanFeatures(),
});

const calculate_cost = tool({
  description:
    "Work out the total cost of 0 to 5 devices plus a plan, billed monthly or annually, over 1 to 5 years.",
  inputSchema: calculateCostInput,
  execute: async (input) => calculateCost(input),
});

const check_availability = tool({
  description:
    "Check today's stock for a Copper product, for one color or for every color.",
  inputSchema: checkAvailabilityInput,
  execute: async (input) => checkAvailability(input),
});

export const copperTools = {
  get_products,
  get_prices,
  get_plan_features,
  calculate_cost,
  check_availability,
};
