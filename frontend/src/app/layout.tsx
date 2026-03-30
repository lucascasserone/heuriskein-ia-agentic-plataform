import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Heuriskein IA',
  description: 'Multi-Agentic Web System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="m-0 p-0 bg-dark text-white">{children}</body>
    </html>
  );
}
