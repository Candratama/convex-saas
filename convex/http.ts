/**
 * HTTP Router Configuration
 * Includes auth routes for @convex-dev/auth
 */

import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

// Auth routes for @convex-dev/auth (OAuth callbacks, etc.)
auth.addHttpRoutes(http);

export default http;
