import { type NextRequest, NextResponse } from "next/server";

const protectedRoutes = ["/dashboard", "/onboarding"];
const authRoutes = ["/login", "/signup"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = protectedRoutes.some((route) => pathname.startsWith(route));
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

  const token = request.cookies.get("yesboss_token")?.value;
  const userStr = request.cookies.get("yesboss_user")?.value;
  
  const hasAuth = token || userStr;
  const user = userStr ? JSON.parse(userStr) : null;
  const role = user?.role;

  if (isProtected && !hasAuth) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (isAuthRoute && hasAuth) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (pathname === "/dashboard" && role) {
    if (role === "owner") {
      return NextResponse.redirect(new URL("/onboarding/owner", request.url));
    }
    if (role === "employee") {
      return NextResponse.redirect(new URL("/onboarding/employee", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*", "/login", "/signup"],
};