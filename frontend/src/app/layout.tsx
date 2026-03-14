import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hyve — On-Chain Credit Union",
  description:
    "XRPL-based employer-sponsored financial wellness platform for SMBs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <nav className="border-b border-card-border bg-card-bg/50 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <a href="/" className="text-2xl font-bold text-accent">
              Hyve
            </a>
            <div className="flex gap-4 text-sm">
              <a
                href="/employer"
                className="hover:text-accent transition-colors"
              >
                Employer
              </a>
              <a
                href="/employee"
                className="hover:text-accent transition-colors"
              >
                Employee
              </a>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
