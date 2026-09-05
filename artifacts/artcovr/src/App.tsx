import { type ReactNode, useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider, useAuth, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AboutPage from "@/app/about/page";
import ArchivePage from "@/app/archive/page";
import AuthCallbackPage from "@/app/auth/callback/page";
import ContactPage from "@/app/contact/page";
import CheckoutPageComponent from "@/app/checkout/[slug]/page";
import FaqPage from "@/app/faq/page";
import Home from "@/app/page";
import PrivacyPage from "@/app/legal/privacy/page";
import TermsPage from "@/app/legal/terms/page";
import LicensePage from "@/app/license/page";
import MyImagesPage from "@/app/my-images/page";
import CatalogIntelligencePage from "@/app/catalog-intelligence/page";
import NotFound from "@/pages/not-found";
import ProductPage from "@/app/product/[slug]/page";
import RefundsPage from "@/app/refunds/page";
import SignInPage from "@/app/sign-in/page";
import SignUpPage from "@/app/sign-up/page";
import { SeoHead } from "@/components/artcovr/SeoHead";
import { Route, Switch, Redirect, useLocation, Router as WouterRouter } from "wouter";

const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string) {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY.");
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
    colorPrimary: "#122519",
    colorForeground: "#0b0b0b",
    colorMutedForeground: "#5d5d58",
    colorDanger: "#a11212",
    colorBackground: "#f3ecd9",
    colorInput: "#fffdf5",
    colorInputForeground: "#0b0b0b",
    colorNeutral: "#b5ad9b",
    fontFamily: "ARTCOVR Grotesk, Arial, sans-serif",
    borderRadius: "0",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#f3ecd9] rounded-none w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !bg-transparent",
    headerTitle: "text-[#0b0b0b] font-extrabold tracking-tight",
    headerSubtitle: "text-[#5d5d58]",
    socialButtonsBlockButtonText: "text-[#0b0b0b] font-bold",
    formFieldLabel: "text-[#0b0b0b] font-bold",
    footerActionLink: "text-[#122519] font-bold underline underline-offset-4",
    footerActionText: "text-[#5d5d58]",
    dividerText: "text-[#5d5d58]",
    identityPreviewEditButton: "text-[#122519]",
    formFieldSuccessText: "text-[#122519]",
    alertText: "text-[#a11212]",
    logoBox: "h-12",
    logoImage: "max-h-12",
    socialButtonsBlockButton: "border border-[#0b0b0b]/30 !bg-transparent",
    formButtonPrimary: "bg-[#122519] text-[#f3ecd9] rounded-none hover:bg-[#0b0b0b]",
    formFieldInput: "border border-[#0b0b0b]/30 !bg-[#fffdf5] text-[#0b0b0b] rounded-none",
    footerAction: "!bg-transparent",
    dividerLine: "bg-[#0b0b0b]/20",
    alert: "border border-[#a11212]/40 !bg-transparent",
    otpCodeFieldInput: "border-[#0b0b0b]/30 !bg-[#fffdf5]",
    formFieldRow: "gap-2",
    main: "gap-5",
  },
};

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={HomeEntry} />
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
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function CheckoutRoute() {
  return <CheckoutPageComponent />;
}

function HomeEntry() {
  const { isLoaded, isSignedIn } = useAuth();
  if (isLoaded && isSignedIn) return <Redirect to="/my-images" />;
  return <Home />;
}

function ProtectedMyImagesRoute() {
  const { isLoaded, isSignedIn } = useAuth();
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
  const { isLoaded, isSignedIn } = useAuth();
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

  return (
    <ClerkProvider
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
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <ClerkQueryClientCacheInvalidator />
      <SeoHead />
      <Router />
    </ClerkProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={basePath}>
          <ClerkProviderWithRoutes />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
