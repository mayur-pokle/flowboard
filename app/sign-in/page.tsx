"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { LogIn, AlertCircle, Mail, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function SignInPage() {
  const params = useSearchParams();
  const showCheckEmail = params?.get("check-email") === "1";
  const callbackError = params?.get("error");

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(showCheckEmail);
  const [error, setError] = useState<string | null>(
    callbackError ? mapAuthError(callbackError) : null
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await signIn("email", {
        email,
        redirect: false,
        callbackUrl: "/board"
      });
      if (result?.error) {
        setError(mapAuthError(result.error));
      } else {
        setSent(true);
      }
    } catch (err) {
      setError((err as Error).message || "Couldn't send the link");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-ink-50 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-10">
          <img
            src="/flowboard-logo.svg"
            alt="Flowboard"
            className="h-8 w-auto"
          />
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-ink-900 leading-tight mb-3">
            Spot content opportunities.
            <br />
            Ship them faster.
          </h1>
          <p className="text-sm text-ink-600 leading-relaxed">
            Flowboard generates weekly AI-powered content ideas tailored to your
            brand and competitors, then helps you take them from kanban card to
            published article in a few clicks.
          </p>
        </div>

        <div className="card p-6">
          {sent ? (
            <div className="text-center py-2">
              <div className="size-10 rounded-full bg-emerald-50 text-emerald-600 grid place-items-center mx-auto mb-3">
                <CheckCircle2 className="size-5" />
              </div>
              <h2 className="text-base font-semibold text-ink-900 mb-1">
                Check your inbox
              </h2>
              <p className="text-sm text-ink-600 leading-relaxed">
                We sent a magic sign-in link to{" "}
                <span className="font-medium text-ink-800">
                  {email || "your email"}
                </span>
                . Click the link there to finish signing in.
              </p>
              <p className="text-[11px] text-ink-500 mt-4">
                The link expires in 1 hour. Didn't get it? Check spam, or{" "}
                <button
                  onClick={() => {
                    setSent(false);
                    setError(null);
                  }}
                  className="text-brand-700 underline hover:no-underline"
                >
                  try again
                </button>
                .
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-base font-semibold text-ink-900 mb-1">
                Sign in
              </h2>
              <p className="text-xs text-ink-500 mb-5">
                Enter your work email — we'll send you a one-click sign-in link.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="text-xs font-medium text-ink-700 mb-1.5 block"
                  >
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                    <input
                      id="email"
                      type="email"
                      autoComplete="username"
                      required
                      className="input pl-9"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@zeni.ai"
                      autoFocus
                    />
                  </div>
                </div>

                {error ? (
                  <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 flex items-start gap-2">
                    <AlertCircle className="size-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                ) : null}

                <Button
                  type="submit"
                  variant="primary"
                  loading={submitting}
                  className="w-full"
                >
                  <LogIn className="size-4" />
                  Send magic link
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="text-[11px] text-ink-500 mt-6 leading-relaxed text-center">
          Access is limited to authorized team members.
          <br />
          Need an account? Ask your admin to add you to the allowlist.
        </p>

        <div className="text-[11px] text-ink-400 mt-8 text-center">
          © {new Date().getFullYear()} Flowboard. Internal preview.
        </div>
      </div>
    </div>
  );
}

function mapAuthError(code: string) {
  switch (code) {
    case "AccessDenied":
      return "This email isn't on the allowlist. Ask your admin to add it.";
    case "Verification":
      return "That sign-in link is invalid or expired. Request a new one.";
    case "EmailSignin":
      return "Couldn't send the email. Check the server email config.";
    case "Configuration":
      return "Email provider isn't configured on the server.";
    default:
      return "Sign-in failed. Please try again.";
  }
}
