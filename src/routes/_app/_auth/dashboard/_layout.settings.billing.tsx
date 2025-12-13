import { useState, useEffect } from "react";
import { Switch } from "@/ui/switch";
import { Button } from "@/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "~/convex/_generated/api";
import { Id } from "~/convex/_generated/dataModel";
import { convexQuery, useConvexAction } from "@convex-dev/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getLocaleCurrency } from "@/utils/misc";
import { PLANS } from "@cvx/schema";

interface Plan {
  _id: Id<"plans">;
  name: string;
  description: string;
  prices: {
    month: {
      idr?: { stripeId: string; amount: number };
      usd: { stripeId: string; amount: number };
      eur: { stripeId: string; amount: number };
    };
    year: {
      idr?: { stripeId: string; amount: number };
      usd: { stripeId: string; amount: number };
      eur: { stripeId: string; amount: number };
    };
  };
}

// Helper function to get currency symbol
function getCurrencySymbol(currency: string): string {
  switch (currency) {
    case "idr":
      return "Rp";
    case "usd":
      return "$";
    case "eur":
      return "€";
    default:
      return "Rp";
  }
}

// Helper function to format price (IDR doesn't use cents)
function formatPrice(amount: number, currency: string): string {
  if (currency === "idr") {
    return new Intl.NumberFormat("id-ID").format(amount);
  }
  return (amount / 100).toFixed(2);
}

// Helper function to get price amount with fallback to USD
function getPriceAmount(
  prices: Plan["prices"],
  interval: "month" | "year",
  currency: string,
): number {
  const intervalPrices = prices[interval];
  if (currency === "idr" && intervalPrices.idr) {
    return intervalPrices.idr.amount;
  }
  if (currency === "eur") {
    return intervalPrices.eur.amount;
  }
  return intervalPrices.usd.amount;
}

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/billing",
)({
  component: BillingSettings,
  validateSearch: (search: Record<string, unknown>) => ({
    payment_redirect: search.payment_redirect === "true" || search.payment_redirect === true,
    payment_id: typeof search.payment_id === "string" ? search.payment_id : undefined,
  }),
  beforeLoad: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      convexQuery(api.app.getActivePlans, {}),
    );
    return {
      title: "Billing",
      headerTitle: "Billing",
      headerDescription: "Manage billing and your subscription plan.",
    };
  },
});

export default function BillingSettings() {
  const { payment_redirect, payment_id } = Route.useSearch();
  const queryClient = useQueryClient();
  const { data: user } = useQuery(convexQuery(api.app.getCurrentUser, {}));
  const { data: plans } = useQuery(convexQuery(api.app.getActivePlans, {}));

  const [selectedPlanId, setSelectedPlanId] = useState(
    user?.subscription?.planId,
  );

  const [selectedPlanInterval, setSelectedPlanInterval] = useState<
    "month" | "year"
  >(
    user?.subscription?.planKey !== PLANS.FREE
      ? user?.subscription?.interval || "month"
      : "month",
  );

  const [verificationStatus, setVerificationStatus] = useState<{
    loading: boolean;
    message: string | null;
    success: boolean | null;
  }>({ loading: false, message: null, success: null });

  // Mayar payment functions
  const { mutateAsync: createSubscriptionCheckout } = useMutation({
    mutationFn: useConvexAction(api.mayar.createSubscriptionCheckout),
  });

  const { mutateAsync: verifyPendingPayment } = useMutation({
    mutationFn: useConvexAction(api.mayar.verifyPendingPayment),
  });

  const { mutateAsync: verifyPayment } = useMutation({
    mutationFn: useConvexAction(api.mayar.verifyPayment),
  });

  const currency = getLocaleCurrency();

  // Handle payment redirect verification
  useEffect(() => {
    if (payment_redirect && user && !verificationStatus.loading && verificationStatus.success === null) {
      setVerificationStatus({ loading: true, message: "Verifying payment...", success: null });

      // Use explicit payment_id if available, otherwise fallback to auto-find
      const verifyPromise = payment_id
        ? verifyPayment({ paymentRecordId: payment_id })
        : verifyPendingPayment({});

      verifyPromise
        .then((result) => {
          setVerificationStatus({
            loading: false,
            message: result.message,
            success: result.success,
          });

          if (result.success) {
            // Refresh user data to show updated subscription
            queryClient.invalidateQueries({ queryKey: ["getCurrentUser"] });
            // Remove query param from URL
            window.history.replaceState({}, "", window.location.pathname);
          }
        })
        .catch((error) => {
          setVerificationStatus({
            loading: false,
            message: error instanceof Error ? error.message : "Verification failed",
            success: false,
          });
        });
    }
  }, [payment_redirect, payment_id, user, verifyPayment, verifyPendingPayment, queryClient, verificationStatus.loading, verificationStatus.success]);

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
      // TODO: Show error notification to user
    }
  };

  if (!user || !plans) {
    return null;
  }

  return (
    <div className="flex h-full w-full flex-col gap-6">
      {/* Payment Verification Status */}
      {verificationStatus.message && (
        <div
          className={`flex w-full items-center gap-2 rounded-lg border p-4 ${
            verificationStatus.loading
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : verificationStatus.success
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {verificationStatus.loading && (
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
          <span className="font-medium">{verificationStatus.message}</span>
        </div>
      )}

      <div className="flex w-full flex-col gap-2 p-6 py-2">
        <h2 className="text-xl font-medium text-primary">
          This is a demo app.
        </h2>
        <p className="text-sm font-normal text-primary/60">
          Convex SaaS is a demo app that uses Mayar payment gateway. You can
          test the payment flow with real payment methods in sandbox mode.
        </p>
      </div>

      {/* Plans */}
      <div className="flex w-full flex-col items-start rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-2 p-6">
          <h2 className="text-xl font-medium text-primary">Plan</h2>
          <p className="flex items-start gap-1 text-sm font-normal text-primary/60">
            You are currently on the{" "}
            <span className="flex h-[18px] items-center rounded-md bg-primary/10 px-1.5 text-sm font-medium text-primary/80">
              {user.subscription
                ? user.subscription.planKey.charAt(0).toUpperCase() +
                  user.subscription.planKey.slice(1)
                : "Free"}
            </span>
            plan.
          </p>
        </div>

        {/* Show plan selection if user has no subscription OR is on free plan */}
        {(!user.subscription || user.subscription?.planId === plans.free._id) && (
          <div className="flex w-full flex-col items-center justify-evenly gap-2 border-border p-6 pt-0">
            {Object.values(plans).map((plan: Plan) => (
              <div
                key={plan._id}
                tabIndex={0}
                role="button"
                className={`flex w-full select-none items-center rounded-md border border-border hover:border-primary/60 ${
                  selectedPlanId === plan._id && "border-primary/60"
                }`}
                onClick={() => setSelectedPlanId(plan._id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setSelectedPlanId(plan._id);
                }}
              >
                <div className="flex w-full flex-col items-start p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-medium text-primary">
                      {plan.name}
                    </span>
                    {plan._id !== plans.free._id && (
                      <span className="flex items-center rounded-md bg-primary/10 px-1.5 text-sm font-medium text-primary/80">
                        {getCurrencySymbol(currency)}{" "}
                        {formatPrice(
                          getPriceAmount(plan.prices, selectedPlanInterval, currency),
                          currency,
                        )}{" "}
                        / {selectedPlanInterval === "month" ? "month" : "year"}
                      </span>
                    )}
                  </div>
                  <p className="text-start text-sm font-normal text-primary/60">
                    {plan.description}
                  </p>
                </div>

                {/* Billing Switch */}
                {plan._id !== plans.free._id && (
                  <div className="flex items-center gap-2 px-4">
                    <label
                      htmlFor="interval-switch"
                      className="text-start text-sm text-primary/60"
                    >
                      {selectedPlanInterval === "month" ? "Monthly" : "Yearly"}
                    </label>
                    <Switch
                      id="interval-switch"
                      checked={selectedPlanInterval === "year"}
                      onCheckedChange={() =>
                        setSelectedPlanInterval((prev) =>
                          prev === "month" ? "year" : "month",
                        )
                      }
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {user.subscription && user.subscription.planId !== plans.free._id && (
          <div className="flex w-full flex-col items-center justify-evenly gap-2 border-border p-6 pt-0">
            <div className="flex w-full items-center overflow-hidden rounded-md border border-primary/60">
              <div className="flex w-full flex-col items-start p-4">
                <div className="flex items-end gap-2">
                  <span className="text-base font-medium text-primary">
                    {user.subscription.planKey.charAt(0).toUpperCase() +
                      user.subscription.planKey.slice(1)}
                  </span>
                  <p className="flex items-start gap-1 text-sm font-normal text-primary/60">
                    {user.subscription.cancelAtPeriodEnd === true ? (
                      <span className="flex h-[18px] items-center text-sm font-medium text-red-500">
                        Expires
                      </span>
                    ) : (
                      <span className="flex h-[18px] items-center text-sm font-medium text-green-500">
                        Renews
                      </span>
                    )}
                    on:{" "}
                    {new Date(
                      user.subscription.currentPeriodEnd * 1000,
                    ).toLocaleDateString("en-US")}
                    .
                  </p>
                </div>
                <p className="text-start text-sm font-normal text-primary/60">
                  {plans.pro.description}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex min-h-14 w-full items-center justify-between rounded-lg rounded-t-none border-t border-border bg-secondary px-6 py-3 dark:bg-card">
          <p className="text-sm font-normal text-primary/60">
            You will not be charged for testing the subscription upgrade.
          </p>
          {(!user.subscription || user.subscription?.planId === plans.free._id) && (
            <Button
              type="submit"
              size="sm"
              onClick={handleCreateSubscriptionCheckout}
              disabled={!selectedPlanId || selectedPlanId === plans.free._id}
            >
              Upgrade to PRO
            </Button>
          )}
        </div>
      </div>

      {/* Manage Subscription */}
      <div className="flex w-full flex-col items-start rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-2 p-6">
          <h2 className="text-xl font-medium text-primary">
            Manage Subscription
          </h2>
          <p className="flex items-start gap-1 text-sm font-normal text-primary/60">
            Update your payment method, billing address, and more.
          </p>
        </div>

        <div className="flex min-h-14 w-full items-center justify-between rounded-lg rounded-t-none border-t border-border bg-secondary px-6 py-3 dark:bg-card">
          <p className="text-sm font-normal text-primary/60">
            You will be redirected to Mayar payment page.
          </p>
          <Button type="submit" size="sm" disabled>
            Manage
          </Button>
        </div>
      </div>
    </div>
  );
}
