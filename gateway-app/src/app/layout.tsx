import type { Metadata } from "next";
import { AuthProvider } from "@/contexts/auth-context";
import { CopilotKitProvider } from "@/components/copilotkit-provider";
import "@copilotkit/react-ui/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gateway Management",
  description: "Manage agents, tokens, and configurations for Simplaix Gateway",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://rsms.me/" />
        <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
      </head>
      <body className="antialiased">
        <AuthProvider>
          <CopilotKitProvider>
            {children}
          </CopilotKitProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
