import { internalAction, internalMutation } from "@cvx/_generated/server";
import schema, {
  PLANS,
  INTERVALS,
  CURRENCIES,
  PlanKey,
} from "@cvx/schema";
import { internal } from "@cvx/_generated/api";

// Seed products for plan initialization
const seedProducts = [
  {
    key: PLANS.FREE,
    name: "Free",
    description: "Start with the basics, upgrade anytime.",
    prices: {
      month: {
        usd: 0,
        eur: 0,
      },
      year: {
        usd: 0,
        eur: 0,
      },
    },
  },
  {
    key: PLANS.PRO,
    name: "Pro",
    description: "Access to all features and unlimited projects.",
    prices: {
      month: {
        usd: 1990,
        eur: 1990,
      },
      year: {
        usd: 19990,
        eur: 19990,
      },
    },
  },
];

export const insertSeedPlan = internalMutation({
  args: schema.tables.plans.validator,
  handler: async (ctx, args) => {
    await ctx.db.insert("plans", {
      stripeId: args.stripeId,
      key: args.key,
      name: args.name,
      description: args.description,
      prices: args.prices,
    });
  },
});

export default internalAction(async (ctx) => {
  console.info("🏃‍♂️ Seeding plans for Mayar integration...");

  // Seed plans with Mayar-compatible structure
  for (const product of seedProducts) {
    // Generate a unique ID for each plan (previously was Stripe product ID)
    const mayarPlanId = `mayar_${product.key}_${Date.now()}`;

    // Create price structure with placeholder IDs (previously Stripe price IDs)
    const getPrice = (currency: "usd" | "eur", interval: "month" | "year") => ({
      stripeId: `mayar_price_${product.key}_${interval}_${currency}`,
      amount: product.prices[interval][currency],
    });

    await ctx.runMutation(internal.init.insertSeedPlan, {
      stripeId: mayarPlanId,
      key: product.key as PlanKey,
      name: product.name,
      description: product.description,
      prices: {
        [INTERVALS.MONTH]: {
          [CURRENCIES.USD]: getPrice(CURRENCIES.USD, INTERVALS.MONTH),
          [CURRENCIES.EUR]: getPrice(CURRENCIES.EUR, INTERVALS.MONTH),
        },
        [INTERVALS.YEAR]: {
          [CURRENCIES.USD]: getPrice(CURRENCIES.USD, INTERVALS.YEAR),
          [CURRENCIES.EUR]: getPrice(CURRENCIES.EUR, INTERVALS.YEAR),
        },
      },
    });

    console.info(`📦 Plan "${product.name}" has been seeded.`);
  }

  console.info("🎉 All plans have been successfully seeded for Mayar integration.");
});
