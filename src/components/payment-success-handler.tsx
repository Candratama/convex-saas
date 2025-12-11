/**
 * Payment Success Handler Component
 * Handles Mayar payment redirect flow and verification
 */

"use client";

import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";
import { useConvexAction } from "@convex-dev/react-query";
import { api } from "~/convex/_generated/api";
import { Id } from "~/convex/_generated/dataModel";

export default function PaymentSuccessHandler() {
  const location = useLocation();
  const verifyPayment = useConvexAction(api.mayar.verifyPayment);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const paymentRedirect = searchParams.get("payment_redirect");
    const paymentId = searchParams.get("payment_id");

    if (paymentRedirect === "true" && paymentId) {
      console.log("Detected Mayar payment redirect, verifying payment...");

      // Verify payment - cast paymentId to the correct type
      verifyPayment({ paymentRecordId: paymentId as Id<"paymentTransactions"> })
        .then((result) => {
          console.log("Payment verified successfully:", result);
          // TODO: Show success notification to user
          // TODO: Refresh user subscription data
        })
        .catch((error) => {
          console.error("Payment verification failed:", error);
          // TODO: Show error notification to user
        });
    }
  }, [location, verifyPayment]);

  return null;
}
