/**
 * Mayar Payment Service
 * Handles payment processing with Mayar payment gateway using redirect-based verification
 */

import {
  action,
  internalAction,
} from "@cvx/_generated/server";
import { v } from "convex/values";
import { PLANS } from "@cvx/schema";
import { api } from "~/convex/_generated/api";
import { MAYAR_API_KEY, MAYAR_API_URL, SITE_URL } from "@cvx/env";

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
      const transaction = transactions.data?.find((t: any) => t.id === paymentId);

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

    // Get plan details
    // const plan = await ctx.db.get(args.planId);
    // if (!plan) {
    //   throw new Error("Plan not found");
    // }

    // if (plan.key === PLANS.FREE) {
    //   throw new Error("Cannot create checkout for free plan");
    // }

    // Get price for selected interval and currency
    // const price = plan.prices[args.planInterval][(args.currency as 'usd' | 'eur')];
    // if (!price) {
    //   throw new Error("Price not found for selected interval and currency");
    // }

    // TODO: Create payment transaction record after schema types are generated
    // const paymentRecordId = await ctx.db.insert("paymentTransactions", {
    //   userId: args.userId,
    //   amount: price.amount,
    //   currency: args.currency,
    //   status: "pending",
    //   planId: args.planId,
    //   planInterval: args.planInterval,
    // });

    try {
      // Create Mayar invoice
      const mayarService = new MayarPaymentService();
      const invoice = await mayarService.createPaymentInvoice({
        userId: args.userId,
        planId: args.planId,
        amount: 1000, // TODO: Get from plan.prices after schema types are generated
        currency: args.currency,
        planInterval: args.planInterval,
      });

      // TODO: Update payment record with Mayar invoice ID after schema types are generated
      // await ctx.db.patch(paymentRecordId, {
      //   mayarInvoiceId: invoice.invoiceId,
      //   redirectUrl: `${SITE_URL}/dashboard/checkout?payment_redirect=true&payment_id=${paymentRecordId}`,
      // });

      return invoice.paymentUrl;
    } catch (error) {
      // TODO: Update payment record to failed after schema types are generated
      // await ctx.db.patch(paymentRecordId, { status: "failed" });
      throw error;
    }
  },
});

export const verifyPaymentAndActivate = internalAction({
  args: {
    paymentRecordId: v.string(), // Use string for now
  },
  handler: async (ctx, args) => {
    // TODO: Get payment record from database after schema types are generated
    // const payment = await ctx.db
    //   .query("paymentTransactions")
    //   .withIndex("userId", (q) => q.eq("_id", args.paymentRecordId as any))
    //   .unique();

    // For now, just return a mock response
    return { 
      success: true, 
      message: "Payment verification placeholder - database operations will be implemented after schema types are generated" 
    };

    // TODO: Complete verification logic after schema types are generated
    // if (!payment) {
    //   throw new Error("Payment record not found");
    // }

    // if (payment.status === "completed") {
    //   return { success: true, message: "Payment already verified" };
    // }

    // // Verify payment with Mayar
    // const mayarService = new MayarPaymentService();
    // const verification = await mayarService.verifyPayment(payment.mayarInvoiceId!);

    // if (!verification.verified) {
    //   await ctx.db.patch(payment._id, { status: "failed" });
    //   throw new Error("Payment not verified");
    // }

    // // Get current subscription and update/create as needed
    // // ... database operations ...
  },
});
