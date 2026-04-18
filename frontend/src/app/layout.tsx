import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "ScriptToVideo AI — Automated YouTube Video Platform",
  description:
    "Upload a script, click generate, approve, and automatically publish to YouTube. AI-powered scene breakdown, voiceover, visuals, and video assembly.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
        {children}
      </body>
    </html>
  );
}
