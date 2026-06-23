import { type NextRequest, NextResponse } from "next/server";

const protectedRoutes = ["/dashboard", "/onboarding"];
const authRoutes = ["/login", "/signup"];
const onboardingRoutes = ["/onboarding/owner", "/onboarding/employee"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = protectedRoutes.some((route) => pathname.startsWith(route));
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));
  const isOnboardingRoute = onboardingRoutes.some((route) => pathname.startsWith(route));

  const token = request.cookies.get("yesboss_token")?.value;
  const userStr = request.cookies.get("yesboss_user")?.value;
  
  const hasAuth = token || userStr;
  const user = userStr ? JSON.parse(userStr) : null;
  const role = user?.role;
  const orgCompleted = user?.organization_completed;

  if (isProtected && !hasAuth) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (isAuthRoute && hasAuth) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isOnboardingRoute && orgCompleted) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*", "/login", "/signup"],
};