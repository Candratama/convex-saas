# Mayar Payment System Implementation Plan

> **For Droid:** REQUIRED SUB-SKILL: Use `executing-plans` skill to implement this plan task-by-task.

**Goal:** Replace Stripe payment system with Mayar payment gateway using redirect-based verification flow

**Architecture:** 
- Database: Add `payment_transactions` table to store Mayar payment records
- Backend: Create `MayarPaymentService` to handle Mayar API integration
- Frontend: Update billing UI to use Mayar checkout flow
- Flow: User → Create Invoice → Redirect to Mayar → Return → Verify → Activate

**Tech Stack:** 
- Convex backend with TypeScript
- Mayar Payment Gateway API
- TanStack React frontend
- Database migrations

---

## Task 1: Database Schema Migration

**Files:**
- Create: `convex/migrations/YYYYMMDDHHMMSS_create_payment_transactions_table.sql`
- Modify: `convex/schema.ts:1-20`

#### Step 1: Create payment transactions table migration

```sql
-- Migration: Create payment_transactions table for Mayar integration
-- Date: 20251211

-- Create payment_transactions table
CREATE TABLE payment_transactions (
  _id TEXT PRIMARY KEY NOT NULL,
  _creationTime INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'IDR',
  status TEXT NOT NULL DEFAULT 'pending',
  mayar_invoice_id TEXT,
  mayar_transaction_id TEXT,
  redirect_url TEXT,
  verified_at INTEGER,
  plan_id TEXT,
  plan_interval TEXT NOT NULL DEFAULT 'month',
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Create indexes for performance
CREATE INDEX idx_payment_transactions_user_id ON payment_transactions(user_id);
CREATE INDEX idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX idx_payment_transactions_mayar_invoice_id ON payment_transactions(mayar_invoice_id);
CREATE INDEX idx_payment_transactions_mayar_transaction_id ON payment_transactions(mayar_transaction_id);

-- Add table comments
COMMENT ON TABLE payment_transactions IS 'Stores payment transaction history with Mayar using redirect-based verification';
COMMENT ON COLUMN payment_transactions.mayar_invoice_id IS 'Mayar payment link/invoice ID';
COMMENT ON COLUMN payment_transactions.mayar_transaction_id IS 'Mayar transaction ID (different from invoice ID)';
COMMENT ON COLUMN payment_transactions.verified_at IS 'Timestamp when payment was verified via Mayar API';
```

#### Step 2: Run migration to create table

Run: `convex migration run`
Expected: Table created with all indexes

#### Step 3: Add paymentTransactions to schema

Modify `convex/schema.ts`:

```typescript
// Add after existing tables
paymentTransactions: defineTable({
  userId: v.id("users"),
  amount: v.number(),
  currency: v.string(),
  status: v.union(
    v.literal("pending"),
    v.literal("completed"),
    v.literal("failed"),
    v.literal("cancelled"),
  ),
  mayarInvoiceId: v.optional(v.string()),
  mayarTransactionId: v.optional(v.string()),
  redirectUrl: v.optional(v.string()),
  verifiedAt: v.optional(v.number()),
  planId: v.optional(v.id("plans")),
  planInterval: intervalValidator,
})
  .index("userId", ["userId"])
  .index("status", ["status"])
  .index("mayarInvoiceId", ["mayarInvoiceId"])
  .index("mayarTransactionId", ["mayarTransactionId"]),
```

#### Step 4: Test schema compilation

Run: `npm run typecheck`
Expected: No errors

#### Step 5: Commit

```bash
git add convex/migrations/*payment_transactions* convex/schema.ts
git commit -m "feat: add payment_transactions table for Mayar integration"
```

---

## Task 2: Environment Variables Setup

**Files:**
- Modify: `convex/env.ts:1-10`

#### Step 1: Add Mayar environment variables

Modify `convex/env.ts`:

```typescript
export const AUTH_RESEND_KEY = process.env.AUTH_RESEND_KEY;
export const AUTH_EMAIL = process.env.AUTH_EMAIL;
export const HOST_URL = process.env.HOST_URL;
export const SITE_URL = process.env.SITE_URL;

// Remove Stripe keys (replaced with Mayar)
// export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
// export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Add Mayar configuration
export const MAYAR_API_KEY = process.env.MAYAR_API_KEY;
export const MAYAR_API_URL = process.env.MAYAR_API_URL || "https://api.mayar.id/hl/v1";
```

#### Step 2: Test environment setup

Run: `npm run typecheck`
Expected: No errors

#### Step 3: Commit

```bash
git add convex/env.ts
git commit -m "chore: replace Stripe env vars with Mayar configuration"
```

---

## Task 3: Mayar Payment Service

**Files:**
- Create: `convex/mayar.ts`
- Test: `convex/mayar.test.ts`

#### Step 1: Write failing test for MayarPaymentService

Create `convex/mayar.test.ts`:

```typescript
import { test, expect } from "vitest";
import { describe } from "vitest";
import { MayarPaymentService } from "./mayar";
import { v } from "convex/values";

describe("MayarPaymentService", () => {
  test("should create invoice successfully", async () => {
    // Arrange
    const mockSupabase = {} as any;
    const service = new MayarPaymentService(mockSupabase);
    
    // Act & Assert
    await expect(service.createPaymentInvoice({
      userId: "user123" as any,
      planId: "plan123" as any,
      amount: 100000,
      currency: "IDR",
      planInterval: "month",
    })).rejects.toThrow("Mayar API key not configured");
  });

  test("should verify payment successfully", async () => {
    // Arrange
    const mockSupabase = {} as any;
    const service = new MayarPaymentService(mockSupabase);
    
    // Act & Assert
    await expect(service.verifyPayment("payment123")).rejects.toThrow();
  });
});
```

#### Step 2: Run test to verify it fails

Run: `npm test convex/mayar.test.ts`
Expected: FAIL with "MayarPaymentService not found"

#### Step 3: Create minimal MayarPaymentService

Create `convex/mayar.ts`:

```typescript
import Stripe from "stripe";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "@cvx/_generated/server";
import { v } from "convex/values";
import { ERRORS } from "~/errors";
import { auth } from "@cvx/auth";
import { currencyValidator, intervalValidator, PLANS } from "@cvx/schema";
import { api, internal } from "~/convex/_generated/api";
import { MAYAR_API_KEY, MAYAR_API_URL, SITE_URL } from "@cvx/env";
import { asyncMap } from "convex-helpers";

export class MayarPaymentService {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 1000;

  constructor(private supabase: any) {
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

    // TODO: Implement Mayar invoice creation
    throw new Error("Not implemented yet");
  }

  async verifyPayment(paymentId: string) {
    if (!this.apiKey) {
      throw new Error("Mayar API key not configured");
    }

    // TODO: Implement payment verification
    throw new Error("Not implemented yet");
  }

  private async makeApiRequest(endpoint: string, options: RequestInit) {
    // TODO: Implement API request with retry logic
    throw new Error("Not implemented yet");
  }
}
```

#### Step 4: Run test to verify it passes

Run: `npm test convex/mayar.test.ts`
Expected: FAIL with "Not implemented yet" (methods exist)

#### Step 5: Commit

```bash
git add convex/mayar.ts convex/mayar.test.ts
git commit -m "feat: add MayarPaymentService with basic structure"
```

---

## Task 4: Backend Actions Implementation

**Files:**
- Modify: `convex/mayar.ts:50-100`
- Test: `convex/mayar.test.ts`

#### Step 1: Implement invoice creation

Update `convex/mayar.ts`:

```typescript
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
```

#### Step 2: Implement payment verification

Update `convex/mayar.ts`:

```typescript
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
```

#### Step 3: Run tests to verify implementation

Run: `npm test convex/mayar.test.ts`
Expected: FAIL with "API key not configured" (expected)

#### Step 4: Commit

```bash
git add convex/mayar.ts
git commit -m "feat: implement Mayar invoice creation and payment verification"
```

---

## Task 5: Convex Actions for Frontend

**Files:**
- Modify: `convex/mayar.ts:150-200`
- Test: `convex/mayar.test.ts`

#### Step 1: Add create subscription action

Update `convex/mayar.ts`:

```typescript
export const createSubscriptionCheckout = action({
  args: {
    userId: v.id("users"),
    planId: v.id("plans"),
    planInterval: intervalValidator,
    currency: v.string(),
  },
  handler: async (ctx, args): Promise<string | undefined> => {
    const user = await ctx.runQuery(api.app.getCurrentUser);
    if (!user) {
      throw new Error("User not found");
    }

    // Get plan details
    const plan = await ctx.db.get(args.planId);
    if (!plan) {
      throw new Error("Plan not found");
    }

    if (plan.key === PLANS.FREE) {
      throw new Error("Cannot create checkout for free plan");
    }

    // Get price for selected interval and currency
    const price = plan.prices[args.planInterval][args.currency as keyof typeof plan.prices.month];
    if (!price) {
      throw new Error("Price not found for selected interval and currency");
    }

    // Create payment transaction record
    const paymentRecordId = await ctx.db.insert("paymentTransactions", {
      userId: args.userId,
      amount: price.amount,
      currency: args.currency,
      status: "pending",
      planId: args.planId,
      planInterval: args.planInterval,
    });

    try {
      // Create Mayar invoice
      const mayarService = new MayarPaymentService(null);
      const invoice = await mayarService.createPaymentInvoice({
        userId: args.userId,
        planId: args.planId,
        amount: price.amount,
        currency: args.currency,
        planInterval: args.planInterval,
      });

      // Update payment record with Mayar invoice ID
      await ctx.db.patch(paymentRecordId, {
        mayarInvoiceId: invoice.invoiceId,
        redirectUrl: `${SITE_URL}/dashboard/checkout?payment_redirect=true&payment_id=${paymentRecordId}`,
      });

      return invoice.paymentUrl;
    } catch (error) {
      // Update payment record to failed
      await ctx.db.patch(paymentRecordId, { status: "failed" });
      throw error;
    }
  },
});
```

#### Step 2: Add verification action

Update `convex/mayar.ts`:

```typescript
export const verifyPaymentAndActivate = internalAction({
  args: {
    paymentRecordId: v.string(),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db
      .query("paymentTransactions")
      .withIndex("by_id", (q) => q.eq("_id", args.paymentRecordId))
      .unique();

    if (!payment) {
      throw new Error("Payment record not found");
    }

    if (payment.status === "completed") {
      return { success: true, message: "Payment already verified" };
    }

    // Verify payment with Mayar
    const mayarService = new MayarPaymentService(null);
    const verification = await mayarService.verifyPayment(payment.mayarInvoiceId!);

    if (!verification.verified) {
      await ctx.db.patch(payment._id, { status: "failed" });
      throw new Error("Payment not verified");
    }

    // Get current subscription
    const currentSubscription = await ctx.db
      .query("subscriptions")
      .withIndex("userId", (q) => q.eq("userId", payment.userId))
      .unique();

    if (current // Update existing subscription
      const plan = await ctx.db.get(payment.planId!);
     Subscription) {
      const price = plan!.prices[payment.planInterval][payment.currency as keyof typeof plan!.prices.month];

      await ctx.db.patch(currentSubscription._id, {
        planId: payment.planId!,
        priceStripeId: price.stripeId, // Keep for compatibility
        status: "active",
        currentPeriodStart: Math.floor(Date.now() / 1000),
        currentPeriodEnd: Math.floor(Date.now() / 1000) + (payment.planInterval === "month" ? 30 * 24 * 60 * 60 : 365 * 24 * 60 * 60),
      });
    } else {
      // Create new subscription
      const plan = await ctx.db.get(payment.planId!);
      const price = plan!.prices[payment.planInterval][payment.currency as keyof typeof plan!.prices.month];

      await ctx.db.insert("subscriptions", {
        userId: payment.userId,
        planId: payment.planId!,
        priceStripeId: price.stripeId, // Keep for compatibility
        stripeId: payment.mayarInvoiceId!, // Use Mayar invoice ID as Stripe ID for compatibility
        currency: payment.currency,
        interval: payment.planInterval,
        status: "active",
        currentPeriodStart: Math.floor(Date.now() / 1000),
        currentPeriodEnd: Math.floor(Date.now() / 1000) + (payment.planInterval === "month" ? 30 * 24 * 60 * 60 : 365 * 24 * 60 * 60),
        cancelAtPeriodEnd: false,
      });
    }

    // Update payment record
    await ctx.db.patch(payment._id, {
      status: "completed",
      verifiedAt: Math.floor(Date.now() / 1000),
    });

    return { success: true, message: "Payment verified and subscription activated" };
  },
});
```

#### Step 3: Test type compilation

Run: `npm run typecheck`
Expected: No errors

#### Step 4: Commit

```bash
git add convex/mayar.ts
git commit -m "feat: add Mayar subscription checkout and verification actions"
```

---

## Task 6: Frontend Payment Flow

**Files:**
- Modify: `src/routes/_app/_auth/dashboard/_layout.settings.billing.tsx:43-65`
- Create: `src/components/payment-success-handler.tsx`

#### Step 1: Update billing settings to use Mayar

Modify `src/routes/_app/_auth/dashboard/_layout.settings.billing.tsx`:

```typescript
// Replace stripe import with mayar
import { api } from "~/convex/_generated/api";
import { convexQuery, useConvexAction } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getLocaleCurrency } from "@/utils/misc";
import { CURRENCIES, PLANS } from "@cvx/schema";

export default function BillingSettings() {
  // ... existing code ...

  const { mutateAsync: createSubscriptionCheckout } = useMutation({
    mutationFn: useConvexAction(api.mayar.createSubscriptionCheckout),
  });
  
  // Remove customer portal (not needed for Mayar)
  // const { mutateAsync: createCustomerPortal } = useMutation({
  //   mutationFn: useConvexAction(api.stripe.createCustomerPortal),
  // });

  const handleCreateSubscriptionCheckout = async () => {
    if (!user || !selectedPlanId) {
      return;
    }
    
    try {
      const checkoutUrl = await createSubscriptionCheckout({
        userId: user._id,
        planId: selectedPlanId,
        planInterval: selectedPlanInterval,
        currency,
      });
      
      if (!checkoutUrl) {
        return;
      }
      
      window.location.href = checkoutUrl;
    } catch (error) {
      console.error("Failed to create checkout:", error);
      // TODO: Show error notification
    }
  };

  // Remove customer portal handler
  // const handleCreateCustomerPortal = async () => { ... };

  // ... rest of component ...
}
```

#### Step 2: Create payment success handler component

Create `src/components/payment-success-handler.tsx`:

```typescript
"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useConvexAction } from "@convex-dev/react-query";
import { api } from "~/convex/_generated/api";

export default function PaymentSuccessHandler() {
  const searchParams = useSearchParams();
  const verifyPayment = useConvexAction(api.mayar.verifyPaymentAndActivate);

  useEffect(() => {
    const paymentRedirect = searchParams.get("payment_redirect");
    const paymentId = searchParams.get("payment_id");

    if (paymentRedirect === "true" && paymentId) {
      // Verify payment
      verifyPayment({ paymentRecordId: paymentId })
        .then((result) => {
          console.log("Payment verified:", result);
          // TODO: Show success notification
          // TODO: Refresh user data
        })
        .catch((error) => {
          console.error("Payment verification failed:", error);
          // TODO: Show error notification
        });
    }
  }, [searchParams, verifyPayment]);

  return null;
}
```

#### Step 3: Add success handler to checkout page

Modify `src/routes/_app/_auth/dashboard/_layout.checkout.tsx`:

```typescript
import PaymentSuccessHandler from "@/components/payment-success-handler";

export default function CheckoutLayout() {
  // ... existing code ...

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <PaymentSuccessHandler />
      
      {isFreePlan && isPending && (
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-lg font-medium text-primary">
            We are completing your checkout, please wait ...
          </p>
        </div>
      )}
      
      {/* Existing success content */}
    </div>
  );
}
```

#### Step 4: Test frontend compilation

Run: `npm run typecheck`
Expected: No errors

#### Step 5: Commit

```bash
git add src/routes/_app/_auth/dashboard/_layout.settings.billing.tsx src/components/payment-success-handler.tsx src/routes/_app/_auth/dashboard/_layout.checkout.tsx
git commit -m "feat: update frontend to use Mayar payment flow"
```

---

## Task 7: Remove Stripe References

**Files:**
- Remove: `convex/stripe.ts`
- Modify: `convex/app.ts:1-20`

#### Step 1: Remove stripe.ts file

```bash
git rm convex/stripe.ts
```

#### Step 2: Remove stripe imports from app.ts

Modify `convex/app.ts`:

```typescript
// Remove stripe import and usage
import "./auth";
import "./init";
// import "./stripe"; // Remove this line
import "./mayar"; // Add mayar import
```

#### Step 3: Update type exports

If stripe types are exported, remove them from relevant files

#### Step 4: Test compilation

Run: `npm run typecheck`
Expected: No errors related to stripe

#### Step 5: Commit

```bash
git add convex/app.ts
git commit -m "chore: remove Stripe integration, add Mayar integration"
```

---

## Task 8: End-to-End Testing

**Files:**
- Test: Manual testing workflow

#### Step 1: Set up environment variables

Add to `.env.local`:
```env
MAYAR_API_KEY=your_mayar_api_key
MAYAR_API_URL=https://api.mayar.id/hl/v1
```

#### Step 2: Test payment flow

1. Start dev server: `npm run dev`
2. Log in as test user
3. Go to billing settings
4. Select PRO plan
5. Click "Upgrade to PRO"
6. Verify redirect to Mayar
7. Complete test payment
8. Verify return to checkout page
9. Check subscription activation

#### Step 3: Run full test suite

Run: `npm test`
Expected: All tests passing

#### Step 4: Run lint and typecheck

Run: `npm run lint && npm run typecheck`
Expected: No errors

#### Step 5: Commit

```bash
git commit -m "test: verify Mayar payment flow end-to-end"
```

---

## Task 9: Documentation Update

**Files:**
- Modify: `README.md`
- Create: `docs/mayar-integration.md`

#### Step 1: Update README

Add Mayar integration section to README.md

#### Step 2: Create integration docs

Create `docs/mayar-integration.md` with setup instructions

#### Step 3: Commit

```bash
git add README.md docs/mayar-integration.md
git commit -m "docs: add Mayar integration documentation"
```

---

**Plan Complete!**

**Next Steps:**
1. Execute each task using `executing-plans` skill
2. Follow TDD approach (test first, then implement)
3. Test thoroughly after each task
4. Commit frequently with descriptive messages

**Execution Options:**
1. **Subagent-Driven (this session)** - Fresh subagent per task, code review between tasks
2. **Parallel Session (separate)** - Open new session with executing-plans, batch execution

Which approach would you prefer?
