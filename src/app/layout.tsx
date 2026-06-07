import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Servicing Copilot",
  description: "AI-ops for private mortgage servicers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <nav className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center gap-6">
            <Link href="/" className="font-semibold text-lg text-indigo-700">
              Servicing Copilot
            </Link>
            <Link href="/import" className="text-sm text-gray-600 hover:text-gray-900">
              Import
            </Link>
            <Link href="/cases" className="text-sm text-gray-600 hover:text-gray-900">
              Cases
            </Link>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
