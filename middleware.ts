import { NextResponse } from "next/server";

const allowedOrigins = [
  "https://www.trackitco.com",
  "https://trackitco.com",
  "http://localhost:3000",
];

function getCorsOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
}

export function middleware(request: Request) {
  const response = request.method === "OPTIONS"
    ? new NextResponse(null, { status: 204 })
    : NextResponse.next();

  const allowOrigin = getCorsOrigin(request);
  response.headers.set("Access-Control-Allow-Origin", allowOrigin);
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie");
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Expose-Headers", "Content-Type");

  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
