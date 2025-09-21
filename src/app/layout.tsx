import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NYC 311 Driving Simulator",
  description: "A 3D visualization of NYC 311 noise complaints.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
