import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// First line of defense only — every route handler additionally verifies the
// session and scopes all queries by the session's user id.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (req.auth?.user) return;

  const { nextUrl } = req;
  if (nextUrl.pathname.startsWith("/api/")) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const loginUrl = new URL("/login", nextUrl);
  loginUrl.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
  return Response.redirect(loginUrl);
});

export const config = {
  matcher: ["/map/:path*", "/api/visits/:path*", "/api/photos/:path*"],
};
