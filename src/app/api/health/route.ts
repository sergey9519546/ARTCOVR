import { NextResponse } from "next/server";
export const dynamic = "force-static";
export function GET() {
  return NextResponse.json({ status: "ok", timestamp: Date.now(), uptime: process.uptime() }, { status: 200 });
}
