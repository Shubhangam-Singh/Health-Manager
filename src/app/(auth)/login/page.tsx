import LoginForm from "@/components/LoginForm";

/**
 * Server shell around a client form -- the same pattern as SlotPicker.
 * It exists so the ?error= that Auth.js appends can be read on the server and
 * passed down as a prop, instead of the client reaching for useSearchParams
 * (which would force this page dynamic and need a Suspense boundary).
 */
type Props = { searchParams: Promise<{ error?: string }> };

// Auth.js error codes are internal identifiers, not user-facing text.
const MESSAGES: Record<string, string> = {
  // Stays vague on purpose: never reveal whether the email exists (D17).
  CredentialsSignin: "Invalid email or password",
  AccessDenied: "That account is not allowed to sign in",
  Verification: "That sign-in link has expired. Please try again.",
  Configuration: "Sign-in is temporarily unavailable. Please try again shortly.",
};

export default async function LoginPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const message = error ? (MESSAGES[error] ?? "Could not sign you in") : undefined;

  return <LoginForm initialError={message} />;
}
