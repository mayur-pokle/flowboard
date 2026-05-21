import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { AuthShell } from "@/components/AuthShell";
import { ToastHost } from "@/components/Toast";

export const metadata: Metadata = {
  title: "Flowboard — AI Content Opportunity Engine",
  description:
    "Discover, evaluate, and execute AI-powered content opportunities — calculators, templates, guides, and more — on a Trello-style Kanban board.",
  icons: { icon: "/favicon.svg" }
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Providers>
          <AuthShell>{children}</AuthShell>
          <ToastHost />
        </Providers>
      </body>
    </html>
  );
}
