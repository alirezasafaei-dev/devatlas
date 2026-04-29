import type { Metadata } from "next";
import type { ReactNode } from "react";

import { webEnv } from "../lib/env";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(webEnv.siteUrl),
  title: "DevAtlas",
  description: "DevAtlas platform foundation"
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps): ReactNode {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
