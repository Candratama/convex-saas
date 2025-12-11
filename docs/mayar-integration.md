# Mayar Payment Integration

This document describes the Mayar payment integration implemented in the Convex SaaS template.

## Overview

The project has been migrated from Stripe to **Mayar Payment Gateway** for handling subscription payments. Mayar is an Indonesian payment gateway that provides secure and reliable payment processing with redirect-based verification.

## Key Features

- ✅ **Redirect-based verification** - No webhooks required
- ✅ **Subscription management** - Monthly and yearly plans
- ✅ **Multi-currency support** - USD and EUR
- ✅ **Real-time payment verification** - Automatic subscription activation
- ✅ **Error handling** - Comprehensive error messages and retry logic
- ✅ **Type-safe integration** - Full TypeScript support

## Architecture

### Database Schema

The integration adds a new `paymentTransactions` table to store payment records:

```typescript
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
```

### Payment Flow

1. **User initiates payment** - Frontend calls `createSubscriptionCheckout` action
2. **Database record created** - Payment transaction record created with `pending` status
3. **Mayar invoice generated** - API call to Mayar creates payment link
4. **User redirected** - User redirected to Mayar payment page
5. **Payment completed** - User completes payment at Mayar
6. **User redirected back** - Mayar redirects user to app with payment ID
7. **Verification triggered** - `PaymentSuccessHandler` detects redirect
8. **Payment verified** - Backend verifies payment with Mayar API
9. **Subscription activated** - User subscription updated to active

### File Structure

```
convex/
├── mayar.ts                 # Mayar payment service and actions
├── env.ts                   # Environment variables
└── schema.ts              # Database schema

src/
├── components/
│   └── payment-success-handler.tsx  # Handles payment redirects
└── routes/
    └── _app/_auth/dashboard/
        ├── _layout.settings.billing.tsx  # Billing UI
        └── _layout.checkout.tsx          # Checkout page
```

## Environment Variables

Add these environment variables to your `.env.local`:

```env
# Mayar Configuration
MAYAR_API_KEY=your_mayar_api_key
MAYAR_API_URL=https://api.mayar.id/hl/v1

# Site Configuration
NEXT_PUBLIC_APP_URL=https://yourdomain.com
SITE_URL=https://yourdomain.com
```

## API Endpoints

### Backend Actions

#### `createSubscriptionCheckout`
Creates a Mayar payment link for subscription upgrade.

**Parameters:**
- `userId: v.id("users")` - User ID
- `planId: v.id("plans")` - Plan ID to upgrade to
- `planInterval: v.union(v.literal("month"), v.literal("year"))` - Billing interval
- `currency: v.string()` - Currency (USD/EUR)

**Returns:** Payment URL string

#### `verifyPayment`
Verifies payment status and activates subscription.

**Parameters:**
- `paymentRecordId: v.string()` - Payment record ID

**Returns:** Verification result with success status

## Frontend Integration

### Billing Component

The billing component (`_layout.settings.billing.tsx`) has been updated to use Mayar:

```typescript
const { mutateAsync: createSubscriptionCheckout } = useMutation({
  mutationFn: useConvexAction(api.mayar.createSubscriptionCheckout),
});

const handleCreateSubscriptionCheckout = async () => {
  const checkoutUrl = await createSubscriptionCheckout({
    userId: user._id,
    planId: selectedPlanId,
    planInterval: selectedPlanInterval,
    currency,
  });
  window.location.href = checkoutUrl;
};
```

### Payment Success Handler

The `PaymentSuccessHandler` component handles payment redirects:

```typescript
export default function PaymentSuccessHandler() {
  const location = useLocation();
  const verifyPayment = useConvexAction(api.mayar.verifyPayment);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const paymentRedirect = searchParams.get("payment_redirect");
    const paymentId = searchParams.get("payment_id");

    if (paymentRedirect === "true" && paymentId) {
      verifyPayment({ paymentRecordId: paymentId })
        .then((result) => {
          console.log("Payment verified:", result);
        })
        .catch((error) => {
          console.error("Payment failed:", error);
        });
    }
  }, [location, verifyPayment]);
}
```

## Migration from Stripe

The project has been migrated from Stripe with the following changes:

### Removed
- `convex/stripe.ts` - Stripe integration file
- Stripe environment variables
- Stripe-related imports and references

### Added
- `convex/mayar.ts` - Mayar payment service
- `paymentTransactions` table to schema
- Mayar environment variables
- Payment success handler component

### Updated
- Billing component to use Mayar actions
- Environment configuration
- Database schema

## Testing

### Development Testing

1. Set up environment variables
2. Start the development server: `npm run dev`
3. Navigate to billing settings
4. Select a paid plan
5. Complete the payment flow
6. Verify subscription activation

### Production Testing

1. Deploy with production Mayar credentials
2. Test with real payment amounts
3. Verify webhook handling (if applicable)
4. Monitor payment success rates

## Troubleshooting

### Common Issues

**Payment not redirecting:**
- Check `NEXT_PUBLIC_APP_URL` is correctly configured
- Verify Mayar API credentials
- Check browser console for errors

**Subscription not activating:**
- Verify payment verification API call
- Check database records for payment status
- Review Mayar transaction logs

**TypeScript errors:**
- Ensure schema types are regenerated: `npx convex dev`
- Check import paths are correct
- Verify all environment variables are set

### Logs

Monitor these logs for debugging:
- Payment creation logs
- Payment verification logs
- Database transaction logs
- Mayar API response logs

## Support

For issues related to:
- **Mayar Integration**: Check Mayar documentation and logs
- **Convex Issues**: Check Convex documentation
- **Payment Flow**: Review this documentation and code comments

## Security Considerations

- All payment verification is done server-side
- No sensitive payment data is stored locally
- API keys are properly secured
- Payment status is always verified with Mayar before activation

---

**Note:** This integration is production-ready but requires proper Mayar account setup and testing before going live.
