export default function AuthCallbackPage() {
  if (typeof window !== "undefined") {
    window.location.replace(`${import.meta.env.BASE_URL}sign-in`);
  }
  return <div className="flex min-h-[100dvh] items-center justify-center text-sm opacity-60">Opening sign in…</div>;
}
