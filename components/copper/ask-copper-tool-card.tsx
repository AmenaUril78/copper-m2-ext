// One tool call, drawn as a round trip: what Copper sent, then what came back.
// It is always open (nothing to click), so a shopper can read both halves.
import { Loader2Icon } from "lucide-react";
import type {
  Availability,
  CostBreakdown,
  PlanFeatures,
  Prices,
  ProductList,
} from "@/lib/copper/assistant/tools";
import { TOOL_LABELS, type ToolStep } from "@/lib/copper/assistant/progress";
import {
  formatMemory,
  formatNotesHours,
  formatUsd,
  getPlans,
  getProducts,
} from "@/lib/copper/catalog";

type Fields = Record<string, unknown>;

const asFields = (value: unknown): Fields =>
  typeof value === "object" && value !== null ? (value as Fields) : {};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-11-14" → "Nov 14, 2026", without a time zone moving the day. */
function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <dt className="text-muted-foreground w-16 shrink-0">{label}</dt>
      <dd className="min-w-0 font-medium">{children}</dd>
    </div>
  );
}

function Pill({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

/** The input, as a labelled list: never raw JSON. */
function Sent({ step }: { step: ToolStep }) {
  if (step.input === undefined) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 italic">
        <Loader2Icon className="size-3.5 animate-spin" />
        filling in the details…
      </p>
    );
  }
  const input = asFields(step.input);
  if (step.name === "get_prices")
    return <p className="italic">Nothing, it just asked for the price list</p>;
  if (step.name === "get_products")
    return <p className="italic">Nothing, it just asked what Copper sells</p>;
  if (step.name === "get_plan_features")
    return (
      <p className="italic">Nothing, it just asked what the plans include</p>
    );

  const productName = (id: unknown) =>
    getProducts().find((p) => p.id === id)?.name ?? String(id);
  const planName = (id: unknown) =>
    getPlans().find((p) => p.id === id)?.name ?? String(id);

  if (step.name === "calculate_cost") {
    const products = Array.isArray(input.products) ? input.products : [];
    return (
      <dl className="space-y-1">
        <Row label="Products">
          {products.length ? products.map(productName).join(", ") : "None"}
        </Row>
        <Row label="Plan">{planName(input.plan)}</Row>
        <Row label="Billing">{String(input.billing)}</Row>
        <Row label="Years">{String(input.years)}</Row>
      </dl>
    );
  }
  return (
    <dl className="space-y-1">
      <Row label="Product">{productName(input.product)}</Row>
      <Row label="Color">
        {typeof input.color === "string" && input.color
          ? input.color
          : "All colors"}
      </Row>
    </dl>
  );
}

function Colors({ colors }: { colors: string[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {colors.map((color) => (
        <Pill key={color} className="bg-accent/15 text-accent">
          {color}
        </Pill>
      ))}
    </div>
  );
}

function Back({ step }: { step: ToolStep }) {
  if (step.state === "error")
    return <p>{String(step.output ?? "Something went wrong.")}</p>;
  if (step.state === "calling" || step.output === undefined) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 italic">
        <Loader2Icon className="size-3.5 animate-spin" />
        the app is running the code…
      </p>
    );
  }

  if (step.name === "calculate_cost") {
    const { lines, totalUsd } = step.output as CostBreakdown;
    return (
      <div className="space-y-1">
        {lines.map((line) => (
          <div key={line.item} className="flex justify-between gap-3">
            <span>{line.item}</span>
            <span className="font-medium">{formatUsd(line.usd)}</span>
          </div>
        ))}
        <div className="flex items-baseline justify-between border-t pt-2">
          <span className="font-medium">Total</span>
          <span className="text-primary text-xl font-bold">
            {formatUsd(totalUsd)}
          </span>
        </div>
      </div>
    );
  }

  if (step.name === "get_products") {
    const { products } = step.output as ProductList;
    return (
      <div className="space-y-3">
        {products.map((product) => (
          <div key={product.id}>
            <div className="flex justify-between gap-3 font-medium">
              <span>{product.name}</span>
              <span>{formatUsd(product.priceUsd)}</span>
            </div>
            <p className="text-muted-foreground text-xs">{product.type}</p>
            <Colors colors={product.colors} />
          </div>
        ))}
      </div>
    );
  }

  if (step.name === "get_prices") {
    const { products, plans } = step.output as Prices;
    return (
      <div className="space-y-1">
        {products.map((product) => (
          <div key={product.id} className="flex justify-between gap-3">
            <span>{product.name}</span>
            <span className="font-medium">{formatUsd(product.priceUsd)}</span>
          </div>
        ))}
        {plans
          .filter((plan) => plan.monthlyUsd > 0 || plan.annualUsd > 0)
          .map((plan) => (
            <div key={plan.id} className="flex justify-between gap-3">
              <span>{plan.name}</span>
              <span className="font-medium">
                {formatUsd(plan.monthlyUsd)}/mo · {formatUsd(plan.annualUsd)}/yr
              </span>
            </div>
          ))}
      </div>
    );
  }

  if (step.name === "get_plan_features") {
    const { plans } = step.output as PlanFeatures;
    return (
      <div className="space-y-3">
        {plans.map((plan) => (
          <div key={plan.id}>
            <p className="font-medium">{plan.name}</p>
            <ul className="text-muted-foreground list-disc pl-5 text-xs">
              <li>Remembers for {formatMemory(plan.memoryDays)}</li>
              <li>Copper Notes: {formatNotesHours(plan.notesHoursPerMonth)}</li>
              <li>
                {plan.refinedAnswers ? "Refined answers" : "No refined answers"}
              </li>
            </ul>
          </div>
        ))}
      </div>
    );
  }

  const result = step.output as Availability;
  if (result.status === "unavailable") return <p>{result.message}</p>;
  if (result.status === "not_a_color") {
    return (
      <p>
        {result.product} doesn&apos;t come in {result.color}. Its colors are{" "}
        {result.colors.join(", ")}.
      </p>
    );
  }
  return (
    <div className="space-y-1">
      {result.colors.map(({ color, stock, restockDate }) => (
        <div key={color} className="flex items-center justify-between gap-3">
          <span>{color}</span>
          {stock === "in_stock" && (
            <Pill className="bg-accent text-primary-foreground">In stock</Pill>
          )}
          {stock === "low_stock" && (
            <Pill className="bg-chart-4 text-chart-5">Low stock</Pill>
          )}
          {stock === "backordered" && (
            <Pill className="bg-chart-3 text-primary-foreground">
              Back-ordered
              {restockDate ? ` until ${formatDate(restockDate)}` : ""}
            </Pill>
          )}
        </div>
      ))}
    </div>
  );
}

export function ToolCard({ step, number }: { step: ToolStep; number: number }) {
  return (
    <div
      data-testid="tool-call"
      data-tool={step.name}
      className="bg-card overflow-hidden rounded-lg border text-sm"
    >
      <div className="bg-accent text-primary-foreground flex flex-wrap items-center gap-2 px-3 py-2">
        <span className="font-mono font-bold">{step.name}()</span>
        <span className="rounded bg-primary-foreground/20 px-1.5 text-xs">
          tool {number}
        </span>
        <span className="ml-auto text-xs">
          {TOOL_LABELS[step.name] ?? step.name}
        </span>
      </div>
      <div className="space-y-2 p-3">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          → What Copper sent
        </p>
        <Sent step={step} />
      </div>
      <div className="bg-accent/10 space-y-2 border-t p-3">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          ← What came back
        </p>
        <Back step={step} />
      </div>
    </div>
  );
}
