import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export function GET() {
  return NextResponse.json(
    { status: "ok", timestamp: new Date().toISOString() },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export function HEAD() {
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
