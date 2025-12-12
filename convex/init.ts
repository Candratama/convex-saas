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
        idr: 0,
        usd: 0,
        eur: 0,
      },
      year: {
        idr: 0,
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
        idr: 99000,
        usd: 1990,
        eur: 1990,
      },
      year: {
        idr: 990000,
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

export const clearPlans = internalMutation({
  args: {},
  handler: async (ctx) => {
    const plans = await ctx.db.query("plans").collect();
    for (const plan of plans) {
      await ctx.db.delete(plan._id);
    }
    console.info(`🗑️ Deleted ${plans.length} existing plans`);
  },
});

export default internalAction({
  args: {},
  handler: async (ctx) => {
    console.info("🏃‍♂️ Seeding plans for Mayar integration...");

    // Clear existing plans first
    await ctx.runMutation(internal.init.clearPlans, {});

    // Seed plans with Mayar-compatible structure
    for (const product of seedProducts) {
      // Generate a unique ID for each plan (previously was Stripe product ID)
      const mayarPlanId = `mayar_${product.key}_${Date.now()}`;

      // Create price structure with placeholder IDs (previously Stripe price IDs)
      const getPrice = (currency: "idr" | "usd" | "eur", interval: "month" | "year") => ({
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
            [CURRENCIES.IDR]: getPrice(CURRENCIES.IDR, INTERVALS.MONTH),
            [CURRENCIES.USD]: getPrice(CURRENCIES.USD, INTERVALS.MONTH),
            [CURRENCIES.EUR]: getPrice(CURRENCIES.EUR, INTERVALS.MONTH),
          },
          [INTERVALS.YEAR]: {
            [CURRENCIES.IDR]: getPrice(CURRENCIES.IDR, INTERVALS.YEAR),
            [CURRENCIES.USD]: getPrice(CURRENCIES.USD, INTERVALS.YEAR),
            [CURRENCIES.EUR]: getPrice(CURRENCIES.EUR, INTERVALS.YEAR),
          },
        },
      });

      console.info(`📦 Plan "${product.name}" has been seeded.`);
    }

    console.info("🎉 All plans have been successfully seeded for Mayar integration.");
  },
});
