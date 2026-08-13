import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { safeNext } from "@/lib/artcovr/navigation";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const value = requestUrl.searchParams.get("next");
  const nextPath = value && value.includes("\\")
    ? "/my-images"
    : safeNext(value, requestUrl.origin);
  let destination = new URL(nextPath, requestUrl.origin);
  if (destination.origin !== requestUrl.origin) {
    destination = new URL("/my-images", requestUrl.origin);
  }
  const successResponse = NextResponse.redirect(destination);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!code || !supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL("/sign-in?error=callback", requestUrl.origin));
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.headers
          .get("cookie")
          ?.split(";")
          .map((entry) => {
            const separator = entry.indexOf("=");
            return {
              name: entry.slice(0, separator).trim(),
              value: decodeURIComponent(entry.slice(separator + 1)),
            };
          })
          .filter((cookie) => cookie.name) ?? [];
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          successResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/sign-in?error=callback", requestUrl.origin));
  }
  return successResponse;
}
