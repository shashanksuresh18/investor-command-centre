import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Investor Morning Command Centre",
  description: "Ranked emails, portfolio state, and AI morning briefing",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
