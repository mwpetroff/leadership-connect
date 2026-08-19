import React from "react";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-8 px-4">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-2xl select-none">
            T
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground font-display">
            Touchpoint
          </h1>
          <p className="text-sm text-muted-foreground text-center">
            Sign in with your Microsoft 365 organisation account to continue.
          </p>
        </div>

        {/* Sign-in card */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-8 space-y-6">
          <a
            href="/api/auth/login"
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {/* Microsoft logo mark */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 23 23"
              aria-hidden="true"
              className="h-5 w-5 shrink-0"
            >
              <path fill="#f3f3f3" d="M0 0h23v23H0z" />
              <path fill="#f35325" d="M1 1h10v10H1z" />
              <path fill="#81bc06" d="M12 1h10v10H12z" />
              <path fill="#05a6f0" d="M1 12h10v10H1z" />
              <path fill="#ffba08" d="M12 12h10v10H12z" />
            </svg>
            Sign in with Microsoft
          </a>

          <p className="text-center text-xs text-muted-foreground">
            You will be redirected to your organisation&apos;s Microsoft login page.
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Touchpoint
        </p>
      </div>
    </div>
  );
}
