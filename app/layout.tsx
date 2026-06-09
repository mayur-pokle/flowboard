import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { AuthShell } from "@/components/AuthShell";
import { ToastHost } from "@/components/Toast";

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://flowboard-two-amber.vercel.app";

const OG_DESCRIPTION =
  "Spot content opportunities. Ship them faster. AI-powered topic discovery, " +
  "Kanban execution, and SEO-ready content generation in one tool.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Flowboard — AI Content Opportunity Engine",
  description:
    "Discover, evaluate, and execute AI-powered content opportunities — calculators, templates, guides, and more — on a Trello-style Kanban board.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Flowboard — Spot content opportunities. Ship them faster.",
    description: OG_DESCRIPTION,
    type: "website",
    siteName: "Flowboard",
    url: SITE_URL
    // Image is auto-discovered from app/opengraph-image.tsx by Next.js.
  },
  twitter: {
    card: "summary_large_image",
    title: "Flowboard — Spot content opportunities. Ship them faster.",
    description: OG_DESCRIPTION
  }
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
