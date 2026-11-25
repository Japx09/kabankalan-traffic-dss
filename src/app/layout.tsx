import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kabankalan City 3D Traffic Microsimulation DSS — Ceres Terminal Corridor",
  description:
    "Interactive 3D multimodal traffic microsimulation and decision-support system for evaluating Ceres Bus Terminal Gates 1 & 2, dedicated PUV staging bays, and Pedro Zayco intersection signalization in Kabankalan City.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#090d12",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} dark`}
      suppressHydrationWarning
    >
      <body className="min-h-screen w-screen overflow-hidden bg-[var(--surface-canvas)] font-sans text-[var(--ink-primary)] antialiased">
        {children}
      </body>
    </html>
  );
}
