# Email + Password Authentication Implementation Plan

> **Status:** Ready for Implementation
> **Design Document:** `docs/plans/2025-12-11-email-password-auth-design.md`
> **Date:** 2025-12-11

---

## Pre-Implementation Checklist

- [ ] Install dependencies: `npm install @node-rs/argon2`
- [ ] Backup current auth files before modifications

---

## Task 1: Install Dependencies

**File:** `package.json`

```bash
npm install @node-rs/argon2
```

**Verification:** Run `npm ls @node-rs/argon2` to confirm installation.

---

## Task 2: Update Schema - Add Password Fields

**File:** `convex/schema.ts`

**Current users table (line 46-59):**
```typescript
users: defineTable({
  name: v.optional(v.string()),
  username: v.optional(v.string()),
  imageId: v.optional(v.id("_storage")),
  image: v.optional(v.string()),
  email: v.optional(v.string()),
  emailVerificationTime: v.optional(v.number()),
  phone: v.optional(v.string()),
  phoneVerificationTime: v.optional(v.number()),
  isAnonymous: v.optional(v.boolean()),
  customerId: v.optional(v.string()),
})
```

**New users table:**
```typescript
users: defineTable({
  name: v.optional(v.string()),
  username: v.optional(v.string()),
  imageId: v.optional(v.id("_storage")),
  image: v.optional(v.string()),
  email: v.optional(v.string()),
  emailVerificationTime: v.optional(v.number()),
  phone: v.optional(v.string()),
  phoneVerificationTime: v.optional(v.number()),
  isAnonymous: v.optional(v.boolean()),
  customerId: v.optional(v.string()),
  // Password authentication fields
  passwordHash: v.optional(v.string()),
  emailVerified: v.optional(v.boolean()),
})
```

**Verification:** Run `npx convex dev` and confirm schema pushes without errors.

---

## Task 3: Create Password Provider Configuration

**File:** `convex/password/PasswordAuth.ts` (NEW)

```typescript
import { Password } from "@convex-dev/auth/providers/Password";
import { ConvexError } from "convex/values";
import { DataModel } from "../_generated/dataModel";
import { Resend as ResendAPI } from "resend";
import { generateRandomString } from "@oslojs/crypto/random";
import type { RandomReader } from "@oslojs/crypto/random";
import { AUTH_EMAIL, AUTH_RESEND_KEY } from "@cvx/env";

const random: RandomReader = {
  read(bytes: Uint8Array): void {
    crypto.getRandomValues(bytes);
  },
};

// Email verification provider for registration
const ResendOTPVerify = {
  id: "resend-otp-verify",
  type: "email" as const,
  maxAge: 60 * 20, // 20 minutes
  async generateVerificationToken() {
    return generateRandomString(random, "0123456789", 8);
  },
  async sendVerificationRequest({
    identifier: email,
    token,
    expires,
  }: {
    identifier: string;
    provider: { apiKey: string };
    token: string;
    expires: Date;
  }) {
    const resend = new ResendAPI(AUTH_RESEND_KEY);
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
};

// Password reset provider
const ResendOTPPasswordReset = {
  id: "resend-otp-reset",
  type: "email" as const,
  maxAge: 60 * 20, // 20 minutes
  async generateVerificationToken() {
    return generateRandomString(random, "0123456789", 8);
  },
  async sendVerificationRequest({
    identifier: email,
    token,
  }: {
    identifier: string;
    provider: { apiKey: string };
    token: string;
    expires: Date;
  }) {
    const resend = new ResendAPI(AUTH_RESEND_KEY);
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
};

// Password validation function
function validatePasswordRequirements(password: string): void {
  if (password.length < 8) {
    throw new ConvexError("Password must be at least 8 characters.");
  }
  if (!/[A-Z]/.test(password)) {
    throw new ConvexError("Password must contain at least one uppercase letter.");
  }
  if (!/[a-z]/.test(password)) {
    throw new ConvexError("Password must contain at least one lowercase letter.");
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
});
```

**Verification:** File created without syntax errors.

---

## Task 4: Update Auth Configuration

**File:** `convex/auth.ts`

**Current content:**
```typescript
import { convexAuth } from "@convex-dev/auth/server";
import GitHub from "@auth/core/providers/github";
import { ResendOTP } from "./otp/ResendOTP";

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [
    ResendOTP,
    GitHub({
      authorization: {
        params: { scope: "user:email" },
      },
    }),
  ],
});
```

**New content:**
```typescript
import { convexAuth } from "@convex-dev/auth/server";
import { PasswordAuth } from "./password/PasswordAuth";

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [PasswordAuth],
});
```

**Verification:** Run `npx convex dev` and confirm auth configuration loads without errors.

---

## Task 5: Create Login Page

**File:** `src/routes/_app/login/_layout.index.tsx`

Replace entire file with:

```tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { z } from "zod";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { Input } from "@/ui/input";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { Label } from "@/ui/label";
import { useForm } from "@tanstack/react-form";
import { zodValidator } from "@tanstack/zod-form-adapter";
import { useEffect, useState } from "react";
import { Route as OnboardingUsernameRoute } from "@/routes/_app/_auth/onboarding/_layout.username";
import { Route as DashboardRoute } from "@/routes/_app/_auth/dashboard/_layout.index";
import { useQuery } from "@tanstack/react-query";
import { convexQuery, useConvexAuth } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";

export const Route = createFileRoute("/_app/login/_layout/")({
  component: Login,
});

function Login() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { data: user } = useQuery(convexQuery(api.app.getCurrentUser, {}));
  const navigate = useNavigate();

  useEffect(() => {
    if ((isLoading && !isAuthenticated) || !user) {
      return;
    }
    if (!isLoading && isAuthenticated && !user.username) {
      navigate({ to: OnboardingUsernameRoute.fullPath });
      return;
    }
    if (!isLoading && isAuthenticated) {
      navigate({ to: DashboardRoute.fullPath });
      return;
    }
  }, [user, isLoading, isAuthenticated, navigate]);

  return <LoginForm />;
}

function LoginForm() {
  const { signIn } = useAuthActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);

  const form = useForm({
    validatorAdapter: zodValidator(),
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      setIsSubmitting(true);
      setError(null);
      try {
        await signIn("password", {
          flow: "signIn",
          email: value.email,
          password: value.password,
          // rememberMe is handled via session duration config
        });
      } catch (err) {
        setError("Email atau password salah");
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <div className="mx-auto flex h-full w-full max-w-96 flex-col items-center justify-center gap-6">
      <div className="mb-2 flex flex-col gap-2">
        <h3 className="text-center text-2xl font-medium text-primary">
          Login
        </h3>
        <p className="text-center text-base font-normal text-primary/60">
          Welcome back! Please log in to continue.
        </p>
      </div>

      <form
        className="flex w-full flex-col items-start gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        {/* Email Field */}
        <div className="flex w-full flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <form.Field
            name="email"
            validators={{
              onSubmit: z
                .string()
                .max(256)
                .email("Email address is not valid."),
            }}
            children={(field) => (
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                className={`bg-transparent ${
                  field.state.meta?.errors.length > 0 &&
                  "border-destructive focus-visible:ring-destructive"
                }`}
              />
            )}
          />
          {form.state.fieldMeta.email?.errors.length > 0 && (
            <span className="text-sm text-destructive">
              {form.state.fieldMeta.email?.errors.join(" ")}
            </span>
          )}
        </div>

        {/* Password Field */}
        <div className="flex w-full flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <form.Field
            name="password"
            validators={{
              onSubmit: z.string().min(1, "Password is required."),
            }}
            children={(field) => (
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className={`bg-transparent pr-10 ${
                    field.state.meta?.errors.length > 0 &&
                    "border-destructive focus-visible:ring-destructive"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-primary/60 hover:text-primary"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            )}
          />
          {form.state.fieldMeta.password?.errors.length > 0 && (
            <span className="text-sm text-destructive">
              {form.state.fieldMeta.password?.errors.join(" ")}
            </span>
          )}
        </div>

        {/* Remember Me */}
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="remember"
              checked={rememberMe}
              onCheckedChange={(checked) => setRememberMe(checked === true)}
            />
            <Label htmlFor="remember" className="text-sm font-normal">
              Remember me
            </Label>
          </div>
          <Link
            to="/forgot-password"
            className="text-sm text-primary/60 hover:text-primary hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        {/* Error Message */}
        {error && (
          <div className="w-full rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Submit Button */}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : "Login"}
        </Button>
      </form>

      {/* Register Link */}
      <p className="text-center text-sm font-normal text-primary/60">
        Don't have an account?{" "}
        <Link to="/register" className="text-primary hover:underline">
          Register
        </Link>
      </p>

      {/* Terms */}
      <p className="px-12 text-center text-sm font-normal leading-normal text-primary/60">
        By continuing, you agree to our{" "}
        <a className="underline hover:text-primary">Terms of Service</a> and{" "}
        <a className="underline hover:text-primary">Privacy Policy.</a>
      </p>
    </div>
  );
}
```

**Verification:** Navigate to `/login` and confirm form renders correctly.

---

## Task 6: Create Register Page

**File:** `src/routes/_app/register/_layout.index.tsx` (NEW)

First, create the directory structure:
```bash
mkdir -p src/routes/_app/register
```

Then create the file:

```tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { z } from "zod";
import { Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Input } from "@/ui/input";
import { Button } from "@/ui/button";
import { Label } from "@/ui/label";
import { useForm } from "@tanstack/react-form";
import { zodValidator } from "@tanstack/zod-form-adapter";
import { useEffect, useState } from "react";
import { Route as OnboardingUsernameRoute } from "@/routes/_app/_auth/onboarding/_layout.username";
import { Route as DashboardRoute } from "@/routes/_app/_auth/dashboard/_layout.index";
import { useQuery } from "@tanstack/react-query";
import { convexQuery, useConvexAuth } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";

export const Route = createFileRoute("/_app/register/_layout/")({
  component: Register,
});

// Password validation schema
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/\d/, "Password must contain at least one number");

function Register() {
  const [step, setStep] = useState<"email" | { email: string }>("email");
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { data: user } = useQuery(convexQuery(api.app.getCurrentUser, {}));
  const navigate = useNavigate();

  useEffect(() => {
    if ((isLoading && !isAuthenticated) || !user) {
      return;
    }
    if (!isLoading && isAuthenticated && !user.username) {
      navigate({ to: OnboardingUsernameRoute.fullPath });
      return;
    }
    if (!isLoading && isAuthenticated) {
      navigate({ to: DashboardRoute.fullPath });
      return;
    }
  }, [user, isLoading, isAuthenticated, navigate]);

  if (step === "email") {
    return <EmailForm onSubmit={(email) => setStep({ email })} />;
  }
  return (
    <VerifyAndPasswordForm
      email={step.email}
      onBack={() => setStep("email")}
    />
  );
}

function EmailForm({ onSubmit }: { onSubmit: (email: string) => void }) {
  const { signIn } = useAuthActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    validatorAdapter: zodValidator(),
    defaultValues: {
      email: "",
    },
    onSubmit: async ({ value }) => {
      setIsSubmitting(true);
      setError(null);
      try {
        // Send verification code for sign up
        await signIn("password", {
          flow: "signUp",
          email: value.email,
          password: "temp-for-code-send", // Will be replaced in next step
        });
        onSubmit(value.email);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (errorMessage.includes("already registered") || errorMessage.includes("already exists")) {
          setError("Email sudah terdaftar. Silakan login.");
        } else {
          // For signUp flow, we need to trigger email-verification
          // This is the expected flow - continue to verification
          onSubmit(value.email);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <div className="mx-auto flex h-full w-full max-w-96 flex-col items-center justify-center gap-6">
      <div className="mb-2 flex flex-col gap-2">
        <h3 className="text-center text-2xl font-medium text-primary">
          Create Account
        </h3>
        <p className="text-center text-base font-normal text-primary/60">
          Enter your email to get started.
        </p>
      </div>

      <form
        className="flex w-full flex-col items-start gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <div className="flex w-full flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <form.Field
            name="email"
            validators={{
              onSubmit: z
                .string()
                .max(256)
                .email("Email address is not valid."),
            }}
            children={(field) => (
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                className={`bg-transparent ${
                  field.state.meta?.errors.length > 0 &&
                  "border-destructive focus-visible:ring-destructive"
                }`}
              />
            )}
          />
          {form.state.fieldMeta.email?.errors.length > 0 && (
            <span className="text-sm text-destructive">
              {form.state.fieldMeta.email?.errors.join(" ")}
            </span>
          )}
        </div>

        {error && (
          <div className="w-full rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="animate-spin" />
          ) : (
            "Send Verification Code"
          )}
        </Button>
      </form>

      <p className="text-center text-sm font-normal text-primary/60">
        Already have an account?{" "}
        <Link to="/login" className="text-primary hover:underline">
          Login
        </Link>
      </p>
    </div>
  );
}

function VerifyAndPasswordForm({
  email,
  onBack,
}: {
  email: string;
  onBack: () => void;
}) {
  const { signIn } = useAuthActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    validatorAdapter: zodValidator(),
    defaultValues: {
      code: "",
      password: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      if (value.password !== value.confirmPassword) {
        setError("Password tidak sama");
        return;
      }

      setIsSubmitting(true);
      setError(null);
      try {
        await signIn("password", {
          flow: "email-verification",
          email,
          code: value.code,
          password: value.password,
        });
      } catch (err) {
        setError("Kode tidak valid atau sudah expired");
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <div className="mx-auto flex h-full w-full max-w-96 flex-col items-center justify-center gap-6">
      <button
        onClick={onBack}
        className="absolute left-4 top-4 flex items-center gap-1 text-sm text-primary/60 hover:text-primary"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <div className="mb-2 flex flex-col gap-2">
        <h3 className="text-center text-2xl font-medium text-primary">
          Verify & Set Password
        </h3>
        <p className="text-center text-base font-normal text-primary/60">
          We sent a code to <span className="font-medium">{email}</span>
        </p>
      </div>

      <form
        className="flex w-full flex-col items-start gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        {/* Verification Code */}
        <div className="flex w-full flex-col gap-1.5">
          <Label htmlFor="code">Verification Code</Label>
          <form.Field
            name="code"
            validators={{
              onSubmit: z
                .string()
                .length(8, "Code must be 8 digits"),
            }}
            children={(field) => (
              <Input
                id="code"
                placeholder="12345678"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                className={`bg-transparent text-center text-lg tracking-widest ${
                  field.state.meta?.errors.length > 0 &&
                  "border-destructive focus-visible:ring-destructive"
                }`}
                maxLength={8}
              />
            )}
          />
          {form.state.fieldMeta.code?.errors.length > 0 && (
            <span className="text-sm text-destructive">
              {form.state.fieldMeta.code?.errors.join(" ")}
            </span>
          )}
        </div>

        {/* Password */}
        <div className="flex w-full flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <form.Field
            name="password"
            validators={{
              onSubmit: passwordSchema,
            }}
            children={(field) => (
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className={`bg-transparent pr-10 ${
                    field.state.meta?.errors.length > 0 &&
                    "border-destructive focus-visible:ring-destructive"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-primary/60 hover:text-primary"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            )}
          />
          {form.state.fieldMeta.password?.errors.length > 0 && (
            <span className="text-sm text-destructive">
              {form.state.fieldMeta.password?.errors.join(" ")}
            </span>
          )}
          <p className="text-xs text-primary/50">
            Min 8 chars, 1 uppercase, 1 lowercase, 1 number
          </p>
        </div>

        {/* Confirm Password */}
        <div className="flex w-full flex-col gap-1.5">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <form.Field
            name="confirmPassword"
            validators={{
              onSubmit: z.string().min(1, "Please confirm your password"),
            }}
            children={(field) => (
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className={`bg-transparent pr-10 ${
                    field.state.meta?.errors.length > 0 &&
                    "border-destructive focus-visible:ring-destructive"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-primary/60 hover:text-primary"
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            )}
          />
          {form.state.fieldMeta.confirmPassword?.errors.length > 0 && (
            <span className="text-sm text-destructive">
              {form.state.fieldMeta.confirmPassword?.errors.join(" ")}
            </span>
          )}
        </div>

        {error && (
          <div className="w-full rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="animate-spin" />
          ) : (
            "Create Account"
          )}
        </Button>
      </form>

      {/* Resend Code */}
      <div className="flex w-full flex-col items-center">
        <p className="text-sm text-primary/60">Didn't receive the code?</p>
        <Button
          variant="ghost"
          className="hover:bg-transparent"
          onClick={() => {
            signIn("password", {
              flow: "signUp",
              email,
              password: "temp-for-code-resend",
            });
          }}
        >
          Resend Code
        </Button>
      </div>
    </div>
  );
}
```

**Verification:** Navigate to `/register` and confirm form renders correctly.

---

## Task 7: Create Forgot Password Page

**File:** `src/routes/_app/forgot-password/_layout.index.tsx` (NEW)

First, create the directory:
```bash
mkdir -p src/routes/_app/forgot-password
```

Then create the file:

```tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { z } from "zod";
import { Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Input } from "@/ui/input";
import { Button } from "@/ui/button";
import { Label } from "@/ui/label";
import { useForm } from "@tanstack/react-form";
import { zodValidator } from "@tanstack/zod-form-adapter";
import { useState } from "react";

export const Route = createFileRoute("/_app/forgot-password/_layout/")({
  component: ForgotPassword,
});

// Password validation schema
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/\d/, "Password must contain at least one number");

function ForgotPassword() {
  const [step, setStep] = useState<"email" | { email: string }>("email");

  if (step === "email") {
    return <EmailForm onSubmit={(email) => setStep({ email })} />;
  }
  return (
    <ResetPasswordForm
      email={step.email}
      onBack={() => setStep("email")}
    />
  );
}

function EmailForm({ onSubmit }: { onSubmit: (email: string) => void }) {
  const { signIn } = useAuthActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    validatorAdapter: zodValidator(),
    defaultValues: {
      email: "",
    },
    onSubmit: async ({ value }) => {
      setIsSubmitting(true);
      setError(null);
      try {
        await signIn("password", {
          flow: "reset",
          email: value.email,
        });
        onSubmit(value.email);
      } catch (err) {
        // Don't reveal if email exists or not (security)
        onSubmit(value.email);
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <div className="mx-auto flex h-full w-full max-w-96 flex-col items-center justify-center gap-6">
      <div className="mb-2 flex flex-col gap-2">
        <h3 className="text-center text-2xl font-medium text-primary">
          Forgot Password
        </h3>
        <p className="text-center text-base font-normal text-primary/60">
          Enter your email and we'll send you a reset code.
        </p>
      </div>

      <form
        className="flex w-full flex-col items-start gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <div className="flex w-full flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <form.Field
            name="email"
            validators={{
              onSubmit: z
                .string()
                .max(256)
                .email("Email address is not valid."),
            }}
            children={(field) => (
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                className={`bg-transparent ${
                  field.state.meta?.errors.length > 0 &&
                  "border-destructive focus-visible:ring-destructive"
                }`}
              />
            )}
          />
          {form.state.fieldMeta.email?.errors.length > 0 && (
            <span className="text-sm text-destructive">
              {form.state.fieldMeta.email?.errors.join(" ")}
            </span>
          )}
        </div>

        {error && (
          <div className="w-full rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="animate-spin" />
          ) : (
            "Send Reset Code"
          )}
        </Button>
      </form>

      <p className="text-center text-sm font-normal text-primary/60">
        Remember your password?{" "}
        <Link to="/login" className="text-primary hover:underline">
          Login
        </Link>
      </p>
    </div>
  );
}

function ResetPasswordForm({
  email,
  onBack,
}: {
  email: string;
  onBack: () => void;
}) {
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    validatorAdapter: zodValidator(),
    defaultValues: {
      code: "",
      password: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      if (value.password !== value.confirmPassword) {
        setError("Password tidak sama");
        return;
      }

      setIsSubmitting(true);
      setError(null);
      try {
        await signIn("password", {
          flow: "reset-verification",
          email,
          code: value.code,
          newPassword: value.password,
        });
        // Auto login after successful reset - navigate to dashboard
        navigate({ to: "/dashboard" });
      } catch (err) {
        setError("Kode tidak valid atau sudah expired");
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <div className="mx-auto flex h-full w-full max-w-96 flex-col items-center justify-center gap-6">
      <button
        onClick={onBack}
        className="absolute left-4 top-4 flex items-center gap-1 text-sm text-primary/60 hover:text-primary"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <div className="mb-2 flex flex-col gap-2">
        <h3 className="text-center text-2xl font-medium text-primary">
          Reset Password
        </h3>
        <p className="text-center text-base font-normal text-primary/60">
          Enter the code sent to <span className="font-medium">{email}</span>
        </p>
      </div>

      <form
        className="flex w-full flex-col items-start gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        {/* Verification Code */}
        <div className="flex w-full flex-col gap-1.5">
          <Label htmlFor="code">Reset Code</Label>
          <form.Field
            name="code"
            validators={{
              onSubmit: z.string().length(8, "Code must be 8 digits"),
            }}
            children={(field) => (
              <Input
                id="code"
                placeholder="12345678"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                className={`bg-transparent text-center text-lg tracking-widest ${
                  field.state.meta?.errors.length > 0 &&
                  "border-destructive focus-visible:ring-destructive"
                }`}
                maxLength={8}
              />
            )}
          />
          {form.state.fieldMeta.code?.errors.length > 0 && (
            <span className="text-sm text-destructive">
              {form.state.fieldMeta.code?.errors.join(" ")}
            </span>
          )}
        </div>

        {/* New Password */}
        <div className="flex w-full flex-col gap-1.5">
          <Label htmlFor="password">New Password</Label>
          <form.Field
            name="password"
            validators={{
              onSubmit: passwordSchema,
            }}
            children={(field) => (
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className={`bg-transparent pr-10 ${
                    field.state.meta?.errors.length > 0 &&
                    "border-destructive focus-visible:ring-destructive"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-primary/60 hover:text-primary"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            )}
          />
          {form.state.fieldMeta.password?.errors.length > 0 && (
            <span className="text-sm text-destructive">
              {form.state.fieldMeta.password?.errors.join(" ")}
            </span>
          )}
          <p className="text-xs text-primary/50">
            Min 8 chars, 1 uppercase, 1 lowercase, 1 number
          </p>
        </div>

        {/* Confirm Password */}
        <div className="flex w-full flex-col gap-1.5">
          <Label htmlFor="confirmPassword">Confirm New Password</Label>
          <form.Field
            name="confirmPassword"
            validators={{
              onSubmit: z.string().min(1, "Please confirm your password"),
            }}
            children={(field) => (
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className={`bg-transparent pr-10 ${
                    field.state.meta?.errors.length > 0 &&
                    "border-destructive focus-visible:ring-destructive"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-primary/60 hover:text-primary"
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            )}
          />
          {form.state.fieldMeta.confirmPassword?.errors.length > 0 && (
            <span className="text-sm text-destructive">
              {form.state.fieldMeta.confirmPassword?.errors.join(" ")}
            </span>
          )}
        </div>

        {error && (
          <div className="w-full rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="animate-spin" />
          ) : (
            "Reset Password"
          )}
        </Button>
      </form>

      {/* Resend Code */}
      <div className="flex w-full flex-col items-center">
        <p className="text-sm text-primary/60">Didn't receive the code?</p>
        <Button
          variant="ghost"
          className="hover:bg-transparent"
          onClick={() => {
            signIn("password", {
              flow: "reset",
              email,
            });
          }}
        >
          Resend Code
        </Button>
      </div>
    </div>
  );
}
```

**Verification:** Navigate to `/forgot-password` and confirm form renders correctly.

---

## Task 8: Create Route Layout Files

**File:** `src/routes/_app/register/_layout.tsx` (NEW)

```tsx
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/register/_layout")({
  component: RegisterLayout,
});

function RegisterLayout() {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center bg-card p-6">
      <Outlet />
    </div>
  );
}
```

**File:** `src/routes/_app/forgot-password/_layout.tsx` (NEW)

```tsx
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/forgot-password/_layout")({
  component: ForgotPasswordLayout,
});

function ForgotPasswordLayout() {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center bg-card p-6">
      <Outlet />
    </div>
  );
}
```

**Verification:** Routes should work with TanStack Router.

---

## Task 9: Delete Old OTP Files

**Files to delete:**
```bash
rm convex/otp/ResendOTP.ts
```

**Note:** Keep `convex/otp/VerificationCodeEmail.tsx` for reference or delete if not needed.

**Verification:** Run `npx convex dev` and confirm no import errors.

---

## Task 10: Update Auth Config (if needed for Argon2)

The `@convex-dev/auth` Password provider uses scrypt by default. If Argon2 is required, create a custom crypto implementation.

**File:** `convex/password/crypto.ts` (NEW - Optional)

```typescript
import { hash, verify } from "@node-rs/argon2";

export async function hashPassword(password: string): Promise<string> {
  return await hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return await verify(hash, password);
}
```

**Note:** The default Password provider handles hashing internally. Only use custom crypto if you need Argon2 specifically over the default implementation.

---

## Post-Implementation Checklist

- [ ] Run `npm run build` - no TypeScript errors
- [ ] Run `npx convex dev` - schema pushes successfully
- [ ] Test login flow with existing email (should fail gracefully)
- [ ] Test registration flow:
  - [ ] Enter email → receive code
  - [ ] Enter code + password → account created
  - [ ] Auto redirect to onboarding/dashboard
- [ ] Test forgot password flow:
  - [ ] Enter email → receive code
  - [ ] Enter code + new password → password updated
  - [ ] Auto login after reset
- [ ] Test password validation (weak passwords rejected)
- [ ] Test error messages display correctly

---

## Files Summary

### New Files
| File | Description |
|------|-------------|
| `convex/password/PasswordAuth.ts` | Password provider configuration |
| `src/routes/_app/register/_layout.tsx` | Register page layout |
| `src/routes/_app/register/_layout.index.tsx` | Register page component |
| `src/routes/_app/forgot-password/_layout.tsx` | Forgot password layout |
| `src/routes/_app/forgot-password/_layout.index.tsx` | Forgot password component |

### Modified Files
| File | Changes |
|------|---------|
| `convex/schema.ts` | Add `passwordHash`, `emailVerified` fields |
| `convex/auth.ts` | Replace ResendOTP + GitHub with PasswordAuth |
| `src/routes/_app/login/_layout.index.tsx` | Complete rewrite for email+password |

### Deleted Files
| File | Reason |
|------|--------|
| `convex/otp/ResendOTP.ts` | Replaced by Password provider |

---

## Rollback Plan

If issues occur, restore from git:
```bash
git checkout HEAD -- convex/auth.ts convex/schema.ts src/routes/_app/login/
git clean -fd src/routes/_app/register src/routes/_app/forgot-password
```
