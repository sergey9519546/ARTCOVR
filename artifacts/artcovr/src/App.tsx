import {
  lazy,
  Suspense,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useTransition,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/app/page";
import { SeoHead } from "@/components/artcovr/SeoHead";
import {
  ArtcovrAuthProvider,
  useArtcovrAuth,
} from "@/lib/artcovr/auth";
import { isDevelopmentClerkKey } from "@/lib/artcovr/clerk-config";
import {
  Route,
  Switch,
  Redirect,
  useLocation,
  Router as WouterRouter,
  type NavigateOptions,
  type Path,
} from "wouter";

const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Keep the homepage eager so its preloader owns the first visible frame and
// the existing animation sequence starts without a route-chunk boundary.
// Everything else is route-only code and should not be part of the homepage
// entry chunk.
const AboutPage = lazy(() => import("@/app/about/page"));
const ArchivePage = lazy(() => import("@/app/archive/page"));
const AuthCallbackPage = lazy(() => import("@/app/auth/callback/page"));
const ContactPage = lazy(() => import("@/app/contact/page"));
const CheckoutPageComponent = lazy(() => import("@/app/checkout/[slug]/page"));
const FaqPage = lazy(() => import("@/app/faq/page"));
const PrivacyPage = lazy(() => import("@/app/legal/privacy/page"));
const TermsPage = lazy(() => import("@/app/legal/terms/page"));
const LicensePage = lazy(() => import("@/app/license/page"));
const MyImagesPage = lazy(() => import("@/app/my-images/page"));
const CatalogIntelligencePage = lazy(
  () => import("@/app/catalog-intelligence/page"),
);
const ProductPage = lazy(() => import("@/app/product/[slug]/page"));
const RefundsPage = lazy(() => import("@/app/refunds/page"));
const SignInPage = lazy(() => import("@/app/sign-in/page"));
const SignUpPage = lazy(() => import("@/app/sign-up/page"));
const NotFound = lazy(() => import("@/pages/not-found"));

function stripBase(path: string) {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY.");
}

if (import.meta.env.PROD && isDevelopmentClerkKey(clerkPubKey)) {
  throw new Error(
    "Production builds cannot use a development Clerk publishable key.",
  );
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: "top" as const,
    socialButtonsVariant: "blockButton" as const,
  },
  variables: {
    colorPrimary: "#f3ecd9",
    colorForeground: "#f3ecd9",
    colorMutedForeground: "#b5ad9b",
    colorDanger: "#a11212",
    colorBackground: "#000000",
    colorInput: "#000000",
    colorInputForeground: "#f3ecd9",
    fontFamily: "ARTCOVR Grotesk, Arial, sans-serif",
    borderRadius: "0",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "!bg-transparent !border-0 rounded-none w-[560px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#f3ecd9] font-extrabold tracking-tight",
    headerSubtitle: "text-[#b5ad9b]",
    socialButtonsBlockButtonText: "text-[#000000] font-extrabold",
    formFieldLabel: "text-[#f3ecd9] font-bold",
    footerActionLink: "text-[#f3ecd9] font-bold underline underline-offset-4",
    footerActionText: "text-[#b5ad9b]",
    dividerText: "text-[#5d5d58]",
    identityPreviewEditButton: "text-[#f3ecd9]",
    formFieldSuccessText: "text-[#f3ecd9]",
    alertText: "text-[#a11212]",
    logoBox: "h-12",
    logoImage: "max-h-12",
    socialButtonsBlockButton: "border border-[#f3ecd9]/30 !bg-[#f3ecd9]",
    formButtonPrimary: "bg-[#f3ecd9] text-[#0b0b0b] rounded-none hover:bg-[#fffdf5]",
    formFieldInput: "border border-[#f3ecd9]/30 !bg-transparent text-[#f3ecd9] rounded-none",
    footerAction: "!bg-transparent",
    dividerLine: "bg-[#f3ecd9]/20",
    alert: "border border-[#a11212]/40 !bg-transparent",
    otpCodeFieldInput: "border-[#f3ecd9]/30 !bg-transparent",
    formFieldRow: "gap-2",
    main: "gap-5",
  },
};

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Suspense fallback={<RouteLoading />}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/about" component={AboutPage} />
          <Route path="/archive" component={ArchivePage} />
          <Route path="/auth/callback" component={AuthCallbackPage} />
          <Route path="/bag">
            <Redirect to="/archive" />
          </Route>
          <Route path="/checkout/:slug" component={CheckoutRoute} />
          <Route path="/contact" component={ContactPage} />
          <Route path="/faq" component={FaqPage} />
          <Route path="/legal/privacy" component={PrivacyPage} />
          <Route path="/legal/terms" component={TermsPage} />
          <Route path="/license" component={LicensePage} />
          <Route path="/my-images" component={ProtectedMyImagesRoute} />
          <Route path="/catalog-intelligence" component={ProtectedCatalogIntelligenceRoute} />
          <Route path="/product/:slug" component={ProductPage} />
          <Route path="/refunds" component={RefundsPage} />
          <Route path="/shipping-and-return">
            <Redirect to="/refunds" />
          </Route>
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </RoutedErrorBoundary>
  );
}

function RouteLoading() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[100] flex min-h-[100dvh] items-center justify-center bg-black text-white dark:bg-cream dark:text-black"
      role="status"
      aria-live="polite"
      aria-label="Loading page"
    >
      <div className="artcovr-wordmark artcovr-wordmark-optical text-4xl">ARTCOVR</div>
    </div>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    window.history.scrollRestoration = "manual";

    const lenis = (
      window as Window & {
        __lenis?: {
          scrollTo: (
            target: number,
            options?: { immediate?: boolean; force?: boolean },
          ) => void;
        };
      }
    ).__lenis;
    lenis?.scrollTo(0, { immediate: true, force: true });
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [location]);

  return null;
}

function CheckoutRoute() {
  return <CheckoutPageComponent />;
}

function ProtectedMyImagesRoute() {
  const { isLoaded, isSignedIn } = useArtcovrAuth();
  if (!isLoaded) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-4 text-sm opacity-60" aria-live="polite">
        Loading your account…
      </div>
    );
  }
  if (!isSignedIn) return <Redirect to="/sign-in?redirect_url=%2Fmy-images" />;
  return <MyImagesPage />;
}

function ProtectedCatalogIntelligenceRoute() {
  const { isLoaded, isSignedIn } = useArtcovrAuth();
  if (!isLoaded) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-4 text-sm opacity-60" aria-live="polite">
        Loading curation access…
      </div>
    );
  }
  if (!isSignedIn) return <Redirect to="/sign-in?redirect_url=%2Fcatalog-intelligence" />;
  return <CatalogIntelligencePage />;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) {
        queryClient.clear();
      }
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  const deterministicAuth = import.meta.env.DEV &&
    import.meta.env.VITE_E2E_AUTH === "1" &&
    window.localStorage.getItem("artcovr:e2e-auth") === "signed-in";

  return (
    <ArtcovrAuthProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to access your account",
          },
        },
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "Start making your next cover yours",
          },
        },
        socialButtonsBlockButton: "CONTINUE WITH GOOGLE",
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      {!deterministicAuth ? <ClerkQueryClientCacheInvalidator /> : null}
      <ScrollToTop />
      <SeoHead />
      <Router />
    </ArtcovrAuthProvider>
  );
}

function App() {
  const [, startTransition] = useTransition();
  const aroundNavigation = useCallback(
    (
      navigate: (to: Path, options?: NavigateOptions) => void,
      to: Path,
      options?: NavigateOptions,
    ) => {
      startTransition(() => navigate(to, options));
    },
    [startTransition],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={basePath} aroundNav={aroundNavigation}>
          <ClerkProviderWithRoutes />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
