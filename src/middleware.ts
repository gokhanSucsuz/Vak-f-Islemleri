import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const path = req.nextUrl.pathname;
    const role = req.nextauth.token?.role;

    if (path.startsWith("/dashboard/users") && role !== "superadmin") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token?.role && !!token?.id,
    },
  }
);

export const config = {
  matcher: ["/dashboard/:path*", "/api/transactions/:path*", "/api/baby-food/:path*", "/api/in-kind-aid/:path*"],
};
