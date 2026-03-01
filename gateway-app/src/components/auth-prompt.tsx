"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLinkIcon, LoaderIcon, CheckIcon, LinkIcon } from "@/components/ui/icons";

interface AuthPromptProps {
  status: "executing" | "complete" | "inProgress" | string;
  serviceType: string;
  authUrl: string;
  message: string;
}

/**
 * In-chat auth prompt component.
 *
 * Rendered when a tool returns an auth_required response.
 * Shows a card with a link for the user to authenticate.
 */
export function AuthPrompt({ status, serviceType, authUrl, message }: AuthPromptProps) {
  const isExecuting = status === "executing" || status === "inProgress";

  if (isExecuting) {
    return (
      <Card className="my-2">
        <CardContent className="p-4 flex items-center gap-3">
          <LoaderIcon size={16} className="text-[var(--accent-primary)]" />
          <span className="text-sm text-[var(--ink-secondary)]">Checking authentication...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="my-2 border-[var(--accent-primary)] bg-[var(--surface-raised)]">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--accent-primary-muted)] flex items-center justify-center flex-shrink-0">
            <LinkIcon size={20} className="text-[var(--accent-primary)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-[var(--ink-primary)] mb-1">
              Authentication Required
            </div>
            <p className="text-sm text-[var(--ink-secondary)] mb-3">
              {message}
            </p>
            <Button
              variant="default"
              size="sm"
              onClick={() => window.open(authUrl, "_blank", "noopener,noreferrer")}
              className="gap-2"
            >
              <ExternalLinkIcon size={14} />
              Connect {serviceType.replace(/_/g, " ")}
            </Button>
            <p className="text-xs text-[var(--ink-tertiary)] mt-2">
              Click the button above, complete authentication, then tell me you&apos;re done.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Auth status check result component.
 *
 * Shows whether the user has successfully authenticated.
 */
export function AuthStatusResult({
  status,
  authenticated,
  serviceType,
}: {
  status: string;
  authenticated: boolean;
  serviceType: string;
}) {
  const isExecuting = status === "executing" || status === "inProgress";

  if (isExecuting) {
    return (
      <Card className="my-2">
        <CardContent className="p-4 flex items-center gap-3">
          <LoaderIcon size={16} className="text-[var(--accent-primary)]" />
          <span className="text-sm text-[var(--ink-secondary)]">Verifying authentication...</span>
        </CardContent>
      </Card>
    );
  }

  if (authenticated) {
    return (
      <Card className="my-2 border-[var(--signal-success)] bg-[var(--signal-success-muted)]">
        <CardContent className="p-4 flex items-center gap-3">
          <CheckIcon size={16} className="text-[var(--signal-success)]" />
          <div>
            <div className="font-medium text-[var(--signal-success)]">Connected</div>
            <div className="text-sm text-[var(--ink-secondary)]">
              {serviceType.replace(/_/g, " ")} is authenticated. Retrying your request...
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="my-2 border-[var(--signal-warning)] bg-[var(--signal-warning-muted)]">
      <CardContent className="p-4 flex items-center gap-3">
        <LinkIcon size={16} className="text-[var(--signal-warning)]" />
        <div>
          <div className="font-medium text-[var(--signal-warning)]">Not Connected</div>
          <div className="text-sm text-[var(--ink-secondary)]">
            {serviceType.replace(/_/g, " ")} authentication is not complete yet.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
