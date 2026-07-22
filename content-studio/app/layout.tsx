import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RevBoss Content Studio",
  description: "Internal content generation tool for RevBoss client content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
