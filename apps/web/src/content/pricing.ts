/**
 * Plans and prices from SPEC.md section 28. The pricing section renders only from this data.
 */

export const CURRENCIES = ["INR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const DEFAULT_CURRENCY: Currency = "INR";

export type PlanId = "free" | "pro" | "team" | "education";

export interface Plan {
  id: PlanId;
  name: string;
  /** Who the plan is for, one line. */
  audience: string;
  /** Monthly price per currency; null when the plan has no list price. */
  price: Record<Currency, number> | null;
  /** Shown under the price. */
  unit: string;
  /** Replaces the price when there is no list price. */
  priceLabel?: string;
  features: readonly string[];
  cta: string;
  featured?: boolean;
}

export const plans: readonly Plan[] = [
  {
    id: "free",
    name: "Free",
    audience: "For trying it out and personal notes",
    price: { INR: 0, USD: 0 },
    unit: "forever",
    features: [
      "3 GB storage",
      "10 docs with collaborators",
      "20 AI actions a month",
      "30-day version history",
      "Audio up to 30 min per doc",
    ],
    cta: "Start free",
  },
  {
    id: "pro",
    name: "Pro",
    audience: "For students and individuals who write every day",
    price: { INR: 299, USD: 6 },
    unit: "per month",
    features: [
      "100 GB storage",
      "Unlimited docs and collaborators",
      "500 AI actions a month",
      "Unlimited version history",
      "Unlimited audio with transcription",
      "Offline pinning",
    ],
    cta: "Get Pro",
    featured: true,
  },
  {
    id: "team",
    name: "Team",
    audience: "For teams and classrooms working in shared spaces",
    price: { INR: 499, USD: 10 },
    unit: "per seat, per month",
    features: [
      "Shared workspaces",
      "Classroom mode",
      "Admin controls",
      "Templates library",
      "Signing workflows",
    ],
    cta: "Start a team",
  },
  {
    id: "education",
    name: "Education",
    audience: "For schools and colleges",
    price: null,
    priceLabel: "Discounted Team",
    unit: "per seat, for whole classes",
    features: ["Everything in Team", "Classroom distribution", "Grading"],
    cta: "Get started",
  },
];

export const pricingNotes: readonly string[] = [
  "Basic ink and PDF markup are free everywhere.",
  "Student pricing with a verified college email.",
  "Payments by Razorpay in India and Stripe everywhere else.",
];

const locales: Record<Currency, string> = { INR: "en-IN", USD: "en-US" };

export function formatPrice(amount: number, currency: Currency): string {
  return new Intl.NumberFormat(locales[currency], {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
