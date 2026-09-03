import {
  ClerkProvider,
  useAuth as useClerkAuth,
  useClerk,
  type ClerkProviderProps,
} from "@clerk/react";
import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
} from "react";

type AuthState = {
  isLoaded: boolean;
  isSignedIn: boolean;
  signOut(options?: { redirectUrl?: string }): Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function ClerkAuthBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const { signOut } = useClerk();
  const value = useMemo<AuthState>(
    () => ({
      isLoaded,
      isSignedIn: Boolean(isSignedIn),
      signOut: (options) => signOut(options),
    }),
    [isLoaded, isSignedIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function isDeterministicSignedInSession() {
  return (
    import.meta.env.DEV &&
    import.meta.env.VITE_E2E_AUTH === "1" &&
    window.localStorage.getItem("artcovr:e2e-auth") === "signed-in"
  );
}

export function ArtcovrAuthProvider({
  children,
  ...props
}: ClerkProviderProps) {
  if (isDeterministicSignedInSession()) {
    const value: AuthState = {
      isLoaded: true,
      isSignedIn: true,
      async signOut(options) {
        window.localStorage.removeItem("artcovr:e2e-auth");
        window.location.assign(options?.redirectUrl || "/");
      },
    };
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  }

  return (
    <ClerkProvider {...props}>
      <ClerkAuthBridge>{children}</ClerkAuthBridge>
    </ClerkProvider>
  );
}

export function useArtcovrAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useArtcovrAuth must be used inside ArtcovrAuthProvider.");
  return value;
}