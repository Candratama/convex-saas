/**
 * Mayar Payment Service
 * Handles payment processing with Mayar payment gateway using redirect-based verification
 */

import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "@cvx/_generated/server";
import { v } from "convex/values";
import { api, internal } from "~/convex/_generated/api";
import { MAYAR_API_KEY, MAYAR_API_URL, SITE_URL } from "@cvx/env";
import { PLANS, intervalValidator } from "@cvx/schema";

export class MayarPaymentService {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.apiUrl = MAYAR_API_URL || "https://api.mayar.id/hl/v1";
    this.apiKey = MAYAR_API_KEY || "";
    
    if (!this.apiKey) {
      console.warn("Mayar API key not configured");
    }
  }

  async createPaymentInvoice(args: {
    userId: string;
    planId: string;
    amount: number;
    currency: string;
    planInterval: "month" | "year";
  }) {
    if (!this.apiKey) {
      throw new Error("Mayar API key not configured");
    }

    // Generate redirect URL with payment ID
    const paymentRecordId = `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const redirectUrl = `${SITE_URL}/dashboard/checkout?payment_redirect=true&payment_id=${paymentRecordId}`;

    try {
      const response = await fetch(`${this.apiUrl}/invoice/create`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: args.amount,
          currency: args.currency,
          redirect_url: redirectUrl,
          metadata: {
            user_id: args.userId,
            plan_id: args.planId,
            plan_interval: args.planInterval,
            payment_record_id: paymentRecordId,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Mayar API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        invoiceId: data.id,
        paymentUrl: data.payment_url,
        paymentRecordId,
      };
    } catch (error) {
      console.error("Failed to create Mayar invoice:", error);
      throw new Error("Failed to create payment invoice");
    }
  }

  async verifyPayment(paymentId: string) {
    if (!this.apiKey) {
      throw new Error("Mayar API key not configured");
    }

    try {
      const response = await fetch(`${this.apiUrl}/transactions`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Mayar API error: ${response.statusText}`);
      }

      const transactions = await response.json();
      const transaction = transactions.data?.find((t: { id: string; status: string; amount: number; currency: string }) => t.id === paymentId);

      if (!transaction) {
        throw new Error("Payment transaction not found");
      }

      return {
        status: transaction.status,
        amount: transaction.amount,
        currency: transaction.currency,
        verified: transaction.status === "paid",
      };
    } catch (error) {
      console.error("Failed to verify payment:", error);
      throw new Error("Failed to verify payment");
    }
  }
}

// ============================================================================
// Internal Queries & Mutations (for use by actions)
// ============================================================================

export const getPlanById = internalQuery({
  args: { planId: v.id("plans") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.planId);
  },
});

export const createPaymentTransaction = internalMutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    currency: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    planId: v.id("plans"),
    planInterval: intervalValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("paymentTransactions", {
      userId: args.userId,
      amount: args.amount,
      currency: args.currency,
      status: args.status,
      planId: args.planId,
      planInterval: args.planInterval,
    });
  },
});

export const updatePaymentTransaction = internalMutation({
  args: {
    paymentId: v.id("paymentTransactions"),
    mayarInvoiceId: v.optional(v.string()),
    redirectUrl: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("cancelled")
      )
    ),
    verifiedAt: v.optional(v.number()),
    mayarTransactionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { paymentId, ...updates } = args;
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    await ctx.db.patch(paymentId, filteredUpdates);
  },
});

export const getPaymentTransactionById = internalQuery({
  args: { paymentId: v.id("paymentTransactions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.paymentId);
  },
});

export const getUserSubscription = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("subscriptions")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

export const updateSubscription = internalMutation({
  args: {
    subscriptionId: v.id("subscriptions"),
    planId: v.id("plans"),
    priceStripeId: v.string(),
    status: v.string(),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const { subscriptionId, ...updates } = args;
    await ctx.db.patch(subscriptionId, updates);
  },
});

export const createSubscription = internalMutation({
  args: {
    userId: v.id("users"),
    planId: v.id("plans"),
    priceStripeId: v.string(),
    stripeId: v.string(),
    currency: v.string(),
    interval: intervalValidator,
    status: v.string(),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Cast currency to the expected type
    const validCurrency = args.currency as "usd" | "eur";
    return await ctx.db.insert("subscriptions", {
      userId: args.userId,
      planId: args.planId,
      priceStripeId: args.priceStripeId,
      stripeId: args.stripeId,
      currency: validCurrency,
      interval: args.interval,
      status: args.status,
      currentPeriodStart: args.currentPeriodStart,
      currentPeriodEnd: args.currentPeriodEnd,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
    });
  },
});

// ============================================================================
// Public Actions
// ============================================================================

export const createSubscriptionCheckout = action({
  args: {
    userId: v.id("users"),
    planId: v.id("plans"),
    planInterval: v.union(v.literal("month"), v.literal("year")),
    currency: v.string(),
  },
  handler: async (ctx, args): Promise<string | undefined> => {
    const user = await ctx.runQuery(api.app.getCurrentUser);
    if (!user) {
      throw new Error("User not found");
    }

    // Get plan details using internal query
    const plan = await ctx.runQuery(internal.mayar.getPlanById, {
      planId: args.planId,
    });
    if (!plan) {
      throw new Error("Plan not found");
    }

    if (plan.key === PLANS.FREE) {
      throw new Error("Cannot create checkout for free plan");
    }

    // Get price for selected interval and currency
    const currencyKey = args.currency as "usd" | "eur";
    const price = plan.prices[args.planInterval][currencyKey];
    if (!price) {
      throw new Error("Price not found for selected interval and currency");
    }

    // Create payment transaction record
    const paymentRecordId = await ctx.runMutation(
      internal.mayar.createPaymentTransaction,
      {
        userId: args.userId,
        amount: price.amount,
        currency: args.currency,
        status: "pending",
        planId: args.planId,
        planInterval: args.planInterval,
      }
    );

    try {
      // Create Mayar invoice
      const mayarService = new MayarPaymentService();
      const invoice = await mayarService.createPaymentInvoice({
        userId: args.userId,
        planId: args.planId,
        amount: price.amount,
        currency: args.currency,
        planInterval: args.planInterval,
      });

      // Update payment record with Mayar invoice ID
      await ctx.runMutation(internal.mayar.updatePaymentTransaction, {
        paymentId: paymentRecordId,
        mayarInvoiceId: invoice.invoiceId,
        redirectUrl: `${SITE_URL}/dashboard/checkout?payment_redirect=true&payment_id=${paymentRecordId}`,
      });

      return invoice.paymentUrl;
    } catch (error) {
      // Update payment record to failed
      await ctx.runMutation(internal.mayar.updatePaymentTransaction, {
        paymentId: paymentRecordId,
        status: "failed",
      });
      throw error;
    }
  },
});

export const verifyPaymentAndActivate = internalAction({
  args: {
    paymentRecordId: v.id("paymentTransactions"),
  },
  handler: async (ctx, args) => {
    // Get payment record from database
    const payment = await ctx.runQuery(
      internal.mayar.getPaymentTransactionById,
      { paymentId: args.paymentRecordId }
    );

    if (!payment) {
      throw new Error("Payment record not found");
    }

    if (payment.status === "completed") {
      return { success: true, message: "Payment already verified" };
    }

    if (!payment.mayarInvoiceId) {
      throw new Error("Payment has no Mayar invoice ID");
    }

    // Verify payment with Mayar
    const mayarService = new MayarPaymentService();
    const verification = await mayarService.verifyPayment(payment.mayarInvoiceId);

    if (!verification.verified) {
      await ctx.runMutation(internal.mayar.updatePaymentTransaction, {
        paymentId: payment._id,
        status: "failed",
      });
      throw new Error("Payment not verified");
    }

    // Get current subscription
    const currentSubscription = await ctx.runQuery(
      internal.mayar.getUserSubscription,
      { userId: payment.userId }
    );

    // Get plan details
    if (!payment.planId) {
      throw new Error("Payment has no plan ID");
    }
    const plan = await ctx.runQuery(internal.mayar.getPlanById, {
      planId: payment.planId,
    });
    if (!plan) {
      throw new Error("Plan not found");
    }

    const currencyKey = payment.currency as "usd" | "eur";
    const price = plan.prices[payment.planInterval][currencyKey];

    // Calculate period dates
    const now = Math.floor(Date.now() / 1000);
    const periodSeconds =
      payment.planInterval === "month" ? 30 * 24 * 60 * 60 : 365 * 24 * 60 * 60;

    if (currentSubscription) {
      // Update existing subscription
      await ctx.runMutation(internal.mayar.updateSubscription, {
        subscriptionId: currentSubscription._id,
        planId: payment.planId,
        priceStripeId: price.stripeId, // Keep for compatibility
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: now + periodSeconds,
      });
    } else {
      // Create new subscription
      await ctx.runMutation(internal.mayar.createSubscription, {
        userId: payment.userId,
        planId: payment.planId,
        priceStripeId: price.stripeId, // Keep for compatibility
        stripeId: payment.mayarInvoiceId, // Use Mayar invoice ID for compatibility
        currency: payment.currency,
        interval: payment.planInterval,
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: now + periodSeconds,
        cancelAtPeriodEnd: false,
      });
    }

    // Update payment record to completed
    await ctx.runMutation(internal.mayar.updatePaymentTransaction, {
      paymentId: payment._id,
      status: "completed",
      verifiedAt: now,
      mayarTransactionId: verification.status, // Store transaction info
    });

    return { success: true, message: "Payment verified and subscription activated" };
  },
});

// Public wrapper for frontend verification
export const verifyPayment = action({
  args: {
    paymentRecordId: v.id("paymentTransactions"),
  },
  handler: async (ctx, args): Promise<{ success: boolean; message: string }> => {
    // Call the internal action to verify and activate
    return await ctx.runAction(internal.mayar.verifyPaymentAndActivate, {
      paymentRecordId: args.paymentRecordId,
    });
  },
});
