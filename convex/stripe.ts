/**
 * Stripe Integration (COMMENTED OUT)
 * 
 * This file has been commented out as part of migrating from Stripe to Mayar payment gateway.
 * All Stripe-related functions will be replaced with Mayar equivalents.
 * This file will be removed in a later task.
 */

// TODO: Replace all Stripe functionality with Mayar implementation
// - createSubscriptionCheckout -> createSubscriptionCheckout (Mayar)
// - verifyPayment -> verifyPaymentAndActivate (Mayar)
// - All webhook handlers -> redirect-based verification

export const stripe = null;

export const PREAUTH_updateCustomerId = async () => {};
export const PREAUTH_getUserById = async () => {};
export const PREAUTH_createStripeCustomer = async () => {};
export const UNAUTH_getDefaultPlan = async () => {};
export const PREAUTH_getUserByCustomerId = async () => {};
export const PREAUTH_createSubscription = async () => {};
export const PREAUTH_replaceSubscription = async () => {};
export const PREAUTH_createFreeStripeSubscription = async () => {};
export const getCurrentUserSubscription = async () => {};
export const createSubscriptionCheckout = async () => {};
export const createCustomerPortal = async () => {};
export const cancelCurrentUserSubscriptions = async () => {};
