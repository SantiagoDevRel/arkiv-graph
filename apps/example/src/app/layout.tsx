import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "arkiv-graph — your Arkiv database as a live graph",
  description:
    "arkiv-graph turns your Arkiv entities into an interactive graph or relational tables. Nodes are entities, edges are the relationships you define, and references to other chains show up as external nodes. Live demo: a fake social app stored entirely on an Arkiv testnet.",
  metadataBase: new URL("https://arkiv-graph-example.vercel.app"),
  openGraph: {
    title: "arkiv-graph — your Arkiv database as a live graph",
    description: "Nodes are entities, edges are relationships, other chains show up as external nodes. Live on Braga testnet.",
    url: "https://arkiv-graph-example.vercel.app",
    siteName: "arkiv-graph",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
