import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "arkiv-graph — tu app en tabla y grafo",
  description:
    "Consulta las entidades de tu app en tablas y un grafo. Crea una muestra social en Tiramisu y firma Lifetime Extension desde tu wallet.",
  metadataBase: new URL("https://arkiv-graph-example.vercel.app"),
  openGraph: {
    title: "arkiv-graph — tu app en tabla y grafo",
    description: "Tus Arkiv entities y sus relaciones en tabla y grafo. Tiramisu testnet.",
    url: "https://arkiv-graph-example.vercel.app",
    siteName: "arkiv-graph",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
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
