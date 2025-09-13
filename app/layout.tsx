import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Post Generator",
  description: "Generate and publish social posts from a product URL using Make.com",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body>
        <header className="border-b border-neutral-800">
          <div className="container py-4 flex items-center justify-between">
            <div className="text-lg font-semibold">Post Generator</div>
          </div>
        </header>
        <main className="container py-8">{children}</main>
        <footer className="container py-8 text-center">
          <small className="muted">© {new Date().getFullYear()} Post Generator</small>
        </footer>
      </body>
    </html>
  );
}
