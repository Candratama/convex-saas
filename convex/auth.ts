import { convexAuth } from "@convex-dev/auth/server";
import { PasswordAuth } from "./password/PasswordAuth";

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [PasswordAuth],
});
