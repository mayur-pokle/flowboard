"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Eye, EyeOff, LogIn, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function SignInPage() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackError = params?.get("error");
  const callbackUrl = params?.get("callbackUrl") || "/board";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    callbackError ? mapAuthError(callbackError) : null
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl
      });
      if (!result || result.error) {
        setError("Invalid email or password");
      } else {
        // Hard-redirect rather than router.push so NextAuth's cookie is
        // attached before the next API call (avoids a one-frame 401).
        window.location.assign(result.url || callbackUrl);
      }
    } catch (err) {
      setError((err as Error).message || "Sign-in failed");
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
          <h2 className="text-base font-semibold text-ink-900 mb-1">
            Sign in
          </h2>
          <p className="text-xs text-ink-500 mb-5">
            Use your Zeni team credentials to continue.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="text-xs font-medium text-ink-700 mb-1.5 block"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@zeni.ai"
                autoFocus
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="text-xs font-medium text-ink-700 mb-1.5 block"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  className="input pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-ink-400 hover:text-ink-700 rounded"
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
                  }
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
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
              Sign in
            </Button>
          </form>
        </div>

        <p className="text-[11px] text-ink-500 mt-6 leading-relaxed text-center">
          Access is limited to authorized team members.
          <br />
          Need an account? Ask your admin to add you to the user list.
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
    case "CredentialsSignin":
      return "Invalid email or password.";
    case "AccessDenied":
      return "Your account isn't on the user list. Ask your admin to add it.";
    case "Configuration":
      return "Auth isn't configured on the server.";
    default:
      return "Sign-in failed. Please try again.";
  }
}
