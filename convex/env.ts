export const AUTH_RESEND_KEY = process.env.AUTH_RESEND_KEY;
export const AUTH_EMAIL = process.env.AUTH_EMAIL;
export const HOST_URL = process.env.HOST_URL;
export const SITE_URL = process.env.SITE_URL;

// Remove Stripe keys (replaced with Mayar)
// export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
// export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Add Mayar configuration
export const MAYAR_API_KEY = process.env.MAYAR_API_KEY;
export const MAYAR_API_URL = process.env.MAYAR_API_URL || "https://api.mayar.id/ks/v1";
