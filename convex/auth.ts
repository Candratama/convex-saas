import { convexAuth } from "@convex-dev/auth/server";
import { PasswordAuth } from "./password/PasswordAuth";

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [PasswordAuth],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      // If existing user, update emailVerified on verification
      if (args.existingUserId) {
        // Check if this is email verification flow
        if (args.type === "verification") {
          await ctx.db.patch(args.existingUserId, {
            emailVerified: true,
            emailVerificationTime: Date.now(),
          });
        }
        return args.existingUserId;
      }

      // Create new user with email from profile
      const userId = await ctx.db.insert("users", {
        email: args.profile.email,
        emailVerified: false,
      });

      return userId;
    },
  },
});
