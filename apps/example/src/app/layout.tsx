import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "arkiv-graph — your app in tables and a graph",
  description:
    "Query your app's entities in tables and a graph. Create a social sample on Tiramisu and sign Lifetime Extension with your wallet.",
  metadataBase: new URL("https://arkiv-graph-example.vercel.app"),
  openGraph: {
    title: "arkiv-graph — your app in tables and a graph",
    description: "Your Arkiv entities and their relationships in tables and a graph. Tiramisu testnet.",
    url: "https://arkiv-graph-example.vercel.app",
    siteName: "arkiv-graph",
  },
  icons: {
    icon: [{ url: "/arkiv-icon-orange.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{document.documentElement.dataset.theme=localStorage.getItem("arkiv-graph:theme")==="light"?"light":"dark"}catch{}` }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
