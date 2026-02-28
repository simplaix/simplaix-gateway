import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex flex-col justify-center items-center text-center flex-1 px-4">
      <div className="max-w-2xl">
        <h1 className="text-4xl font-bold mb-4">Simplaix Gateway</h1>
        <p className="text-lg text-fd-muted-foreground mb-8">
          Enterprise-grade Agent Gateway providing identity, security, credential
          management, and policy enforcement for AI agents. Supports MCP,
          CopilotKit, AG-UI/Strands, and any HTTP-based agent runtime.
        </p>
        <div className="flex flex-row gap-4 justify-center">
          <Link
            href="/docs"
            className="inline-flex items-center justify-center rounded-md bg-fd-primary px-6 py-3 text-sm font-medium text-fd-primary-foreground shadow hover:bg-fd-primary/90"
          >
            Get Started
          </Link>
          <Link
            href="/docs/api-reference/auth"
            className="inline-flex items-center justify-center rounded-md border border-fd-border px-6 py-3 text-sm font-medium hover:bg-fd-accent hover:text-fd-accent-foreground"
          >
            API Reference
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12 text-left">
          <div className="rounded-lg border border-fd-border p-4">
            <h3 className="font-semibold mb-1">Multi-Protocol Routing</h3>
            <p className="text-sm text-fd-muted-foreground">
              Route to MCP servers, CopilotKit, Strands/AG-UI, or any HTTP agent
              with identity and credential injection.
            </p>
          </div>
          <div className="rounded-lg border border-fd-border p-4">
            <h3 className="font-semibold mb-1">Credential Vault</h3>
            <p className="text-sm text-fd-muted-foreground">
              Encrypted per-user credential storage with automatic resolution
              and injection.
            </p>
          </div>
          <div className="rounded-lg border border-fd-border p-4">
            <h3 className="font-semibold mb-1">Policy Engine</h3>
            <p className="text-sm text-fd-muted-foreground">
              Configurable rules: allow, deny, or require human confirmation per
              tool.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
