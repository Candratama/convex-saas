/**
 * Stripe HTTP Webhook Handler (COMMENTED OUT)
 * 
 * This file has been commented out as part of migrating from Stripe to Mayar payment gateway.
 * It will be removed in a later task as Mayar uses redirect-based verification instead of webhooks.
 */

import { httpRouter } from "convex/server";
// import { auth } from "./auth";
// import { ActionCtx, httpAction } from "@cvx/_generated/server";
// import { ERRORS } from "~/errors";
// import { stripe } from "@cvx/stripe";
// import { STRIPE_WEBHOOK_SECRET } from "@cvx/env";
// import { z } from "zod";
// import { internal } from "@cvx/_generated/api";
// import { Currency, Interval, PLANS } from "@cvx/schema";
// import {
//   sendSubscriptionErrorEmail,
//   sendSubscriptionSuccessEmail,
// } from "@cvx/email/templates/subscriptionEmail";
// import Stripe from "stripe";
// import { Doc } from "@cvx/_generated/dataModel";

const http = httpRouter();

/**
 * Webhook endpoint for Stripe events (DISABLED)
 * This will be replaced with Mayar's redirect-based verification system.
 */
// httpAction(
//   "stripe",
//   async (request) => {
//     const signature = request.headers.get("Stripe-Signature");

//     const event = await getStripeEvent(request);

//     switch (event.type) {
//       case "checkout.session.completed":
//         await handleCheckoutCompleted(event, request);
//         break;
//       case "customer.subscription.updated":
//         await handleSubscriptionUpdated(event, request);
//         break;
//       case "customer.subscription.deleted":
//         await handleSubscriptionDeleted(event, request);
//         break;
//       default:
//         console.log(`Unhandled event type ${event.type}`);
//     }

//     return new Response(null, { status: 200 });
//   },
// );

export default http;
