import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TNBT Intelligence Engine",
  description: "Video Intelligence Engine — Foradom Enterprises Ltd.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-white antialiased">
        {children}
      </body>
    </html>
  );
}
