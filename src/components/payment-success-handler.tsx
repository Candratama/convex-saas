/**
 * Payment Success Handler Component
 * Handles Mayar payment redirect flow and verification
 */

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
      console.log("Detected Mayar payment redirect, verifying payment...");
      
      // Verify payment
      verifyPayment({ paymentRecordId: paymentId })
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
  }, [searchParams, verifyPayment]);

  return null;
}
