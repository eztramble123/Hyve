import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavLinks from "./NavLinks";

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
  icons: {
    icon: "/hyve_icon.svg",
    shortcut: "/hyve_icon.svg",
    apple: "/hyve_icon.svg",
  },
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
        <nav>
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            {/* Logo */}
            <a href="/" className="flex items-center gap-2 group">
              <img
                src="/hyve_icon.svg"
                alt="Hyve"
                className="w-6 h-6 group-hover:opacity-80 transition-opacity"
              />
              <span
                className="text-xl font-semibold tracking-widest text-accent group-hover:opacity-80 transition-opacity"
                style={{ letterSpacing: "0.2em" }}
              >
                hyve
              </span>
            </a>

            <NavLinks />
          </div>

          {/* Thin amber underline */}
          <div className="h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
        </nav>
        <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
