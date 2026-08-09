import type { Metadata } from "next";

import { SiteFooter, SiteHeader } from "./components/site-chrome";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Learning Hub",
  description: "A practical learning environment for Agent engineering.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const mode = process.env.DEPLOYMENT_MODE === "local" ? "local" : "cloud";

  return (
    <html lang="zh-CN">
      <body>
        <SiteHeader mode={mode} />
        <div className="site-content">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
