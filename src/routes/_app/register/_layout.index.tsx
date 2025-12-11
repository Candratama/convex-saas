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
    <VerifyAndPasswordForm email={step.email} onBack={() => setStep("email")} />
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
          password: "temp-placeholder-will-be-set-after-verification",
        });
        onSubmit(value.email);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (
          errorMessage.includes("already registered") ||
          errorMessage.includes("already exists")
        ) {
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
      } catch {
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
        className="absolute left-4 top-4 flex items-center gap-1 text-sm text-primary/60 hover:text-primary lg:left-8 lg:top-8"
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
                  {showConfirmPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
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
        <p className="text-sm text-primary/60">Didn&apos;t receive the code?</p>
        <Button
          variant="ghost"
          className="hover:bg-transparent"
          onClick={() => {
            signIn("password", {
              flow: "signUp",
              email,
              password: "temp-placeholder-for-resend",
            });
          }}
        >
          Resend Code
        </Button>
      </div>
    </div>
  );
}
