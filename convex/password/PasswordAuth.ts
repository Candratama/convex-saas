import { Password } from "@convex-dev/auth/providers/Password";
import Resend from "@auth/core/providers/resend";
import { ConvexError } from "convex/values";
import { DataModel } from "../_generated/dataModel";
import { Resend as ResendAPI } from "resend";
import { generateRandomString } from "@oslojs/crypto/random";
import type { RandomReader } from "@oslojs/crypto/random";
import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import { AUTH_EMAIL, AUTH_RESEND_KEY } from "@cvx/env";

const random: RandomReader = {
  read(bytes: Uint8Array): void {
    crypto.getRandomValues(bytes);
  },
};

// Email verification provider for registration
export const ResendOTPVerify = Resend({
  id: "resend-otp-verify",
  apiKey: AUTH_RESEND_KEY,
  async generateVerificationToken() {
    return generateRandomString(random, "0123456789", 8);
  },
  async sendVerificationRequest({ identifier: email, provider, token }) {
    const resend = new ResendAPI(provider.apiKey);
    const { error } = await resend.emails.send({
      from: AUTH_EMAIL ?? "Convex SaaS <onboarding@resend.dev>",
      to: [email],
      subject: "Verify your email - Convex SaaS",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333; font-size: 24px; margin-bottom: 16px;">
            Verify your email
          </h1>
          <p style="color: #666; font-size: 16px; margin-bottom: 24px;">
            Enter this code to complete your registration:
          </p>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #333;">
              ${token}
            </span>
          </div>
          <p style="color: #999; font-size: 14px; margin-top: 24px;">
            This code is valid for 20 minutes.
          </p>
        </div>
      `,
    });

    if (error) {
      throw new Error(JSON.stringify(error));
    }
  },
});

// Password reset provider
export const ResendOTPPasswordReset = Resend({
  id: "resend-otp-reset",
  apiKey: AUTH_RESEND_KEY,
  async generateVerificationToken() {
    return generateRandomString(random, "0123456789", 8);
  },
  async sendVerificationRequest({ identifier: email, provider, token }) {
    const resend = new ResendAPI(provider.apiKey);
    const { error } = await resend.emails.send({
      from: AUTH_EMAIL ?? "Convex SaaS <onboarding@resend.dev>",
      to: [email],
      subject: "Reset your password - Convex SaaS",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333; font-size: 24px; margin-bottom: 16px;">
            Reset your password
          </h1>
          <p style="color: #666; font-size: 16px; margin-bottom: 24px;">
            Enter this code to reset your password:
          </p>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #333;">
              ${token}
            </span>
          </div>
          <p style="color: #999; font-size: 14px; margin-top: 24px;">
            This code is valid for 20 minutes. If you didn't request this, please ignore this email.
          </p>
        </div>
      `,
    });

    if (error) {
      throw new Error(JSON.stringify(error));
    }
  },
});

// Password validation function
function validatePasswordRequirements(password: string): void {
  if (password.length < 8) {
    throw new ConvexError("Password must be at least 8 characters.");
  }
  if (!/[A-Z]/.test(password)) {
    throw new ConvexError(
      "Password must contain at least one uppercase letter."
    );
  }
  if (!/[a-z]/.test(password)) {
    throw new ConvexError(
      "Password must contain at least one lowercase letter."
    );
  }
  if (!/\d/.test(password)) {
    throw new ConvexError("Password must contain at least one number.");
  }
}

// Main Password provider export
export const PasswordAuth = Password<DataModel>({
  id: "password",
  profile(params) {
    return {
      email: params.email as string,
    };
  },
  validatePasswordRequirements,
  verify: ResendOTPVerify,
  reset: ResendOTPPasswordReset,
  crypto: {
    // Use Argon2id for password hashing (more secure than bcrypt)
    async hashSecret(password: string): Promise<string> {
      return await argon2Hash(password, {
        memoryCost: 19456, // 19 MiB
        timeCost: 2,
        outputLen: 32,
        parallelism: 1,
      });
    },
    async verifySecret(password: string, hashedPassword: string): Promise<boolean> {
      try {
        return await argon2Verify(hashedPassword, password);
      } catch {
        return false;
      }
    },
  },
});
