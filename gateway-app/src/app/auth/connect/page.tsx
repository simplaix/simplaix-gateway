"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * /auth/connect – Credential Connect Page
 *
 * Opened when the in-chat agent prompts the user to authenticate for a service.
 * For "gateway_api" the user is already logged into the Gateway app, so this page
 * simply stores the current JWT in the credential vault and shows a success message.
 *
 * Query params:
 *   ?service=gateway_api   – the credential service type to connect
 */

type ConnectStatus = "idle" | "storing" | "success" | "error";

function ConnectPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isAuthenticated, isLoading, token, user } = useAuth();

  const service = searchParams.get("service") || "gateway_api";

  const [status, setStatus] = useState<ConnectStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const storeCredential = useCallback(async () => {
    if (!token) return;

    setStatus("storing");
    setErrorMsg(null);

    try {
      const res = await fetch("/api/gateway/credentials/jwt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Gateway-Token": token,
        },
        body: JSON.stringify({
          serviceType: service,
          token: token,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to store credential (${res.status})`);
      }

      setStatus("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to store credential");
      setStatus("error");
    }
  }, [token, service]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const returnTo = `/auth/connect?service=${encodeURIComponent(service)}`;
      router.push(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [isLoading, isAuthenticated, service, router]);

  // Auto-store on mount when authenticated
  useEffect(() => {
    if (isAuthenticated && token && status === "idle") {
      storeCredential();
    }
  }, [isAuthenticated, token, status, storeCredential]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="text-[var(--ink-secondary)]">Loading...</div>
      </div>
    );
  }

  const serviceLabel = service.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Connect {serviceLabel}
          </CardTitle>
          <CardDescription className="text-center">
            {status === "success"
              ? "You're all set! You can close this tab and go back to the chat."
              : `Connecting your account to ${serviceLabel}...`}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Storing */}
          {status === "storing" && (
            <div className="flex items-center justify-center gap-3 py-6">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--accent-primary)] border-t-transparent" />
              <span className="text-sm text-[var(--ink-secondary)]">
                Storing credential...
              </span>
            </div>
          )}

          {/* Success */}
          {status === "success" && (
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-[var(--signal-success-muted)] flex items-center justify-center">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--signal-success)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-[var(--signal-success)]">Connected!</p>
                <p className="text-sm text-[var(--ink-secondary)] mt-1">
                  {serviceLabel} is now linked to your account
                  {user?.email ? ` (${user.email})` : ""}.
                </p>
                <p className="text-sm text-[var(--ink-secondary)] mt-1">
                  Go back to the chat and tell the agent you&apos;re done.
                </p>
              </div>
              <Button variant="outline" onClick={() => window.close()} className="mt-2">
                Close this tab
              </Button>
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-[var(--signal-danger-muted)] flex items-center justify-center">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--signal-danger)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-[var(--signal-danger)]">Connection Failed</p>
                <p className="text-sm text-[var(--ink-secondary)] mt-1">
                  {errorMsg || "Something went wrong. Please try again."}
                </p>
              </div>
              <Button onClick={storeCredential} className="mt-2">
                Retry
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ConnectPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
          <div className="text-[var(--ink-secondary)]">Loading...</div>
        </div>
      }
    >
      <ConnectPageContent />
    </Suspense>
  );
}
