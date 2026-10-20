import type { Metadata, Viewport } from "next";
import { DiscoBall } from "@/components/DiscoBall";
import "./globals.css";

export const metadata: Metadata = {
  title: "Musikquiz",
  description: "Pub-Quiz mit Songs – live hosten, Teams spielen am eigenen Handy.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f1222",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <DiscoBall />
        {children}
      </body>
    </html>
  );
}
