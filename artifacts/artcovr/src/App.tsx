import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import NotFound from "@/pages/not-found";
import ProductPage from "@/app/product/[slug]/page";
import RefundsPage from "@/app/refunds/page";
import SignInPage from "@/app/sign-in/page";
import { Route, Switch, Redirect, useLocation, Router as WouterRouter } from "wouter";

const queryClient = new QueryClient();

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
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
        <Route path="/my-images" component={MyImagesPage} />
        <Route path="/product/:slug" component={ProductPage} />
        <Route path="/refunds" component={RefundsPage} />
        <Route path="/shipping-and-return">
          <Redirect to="/refunds" />
        </Route>
        <Route path="/sign-in" component={SignInPage} />
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
