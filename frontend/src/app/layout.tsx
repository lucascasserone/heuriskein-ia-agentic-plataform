import type { Metadata } from 'next';
import './globals.css';
import 'reactflow/dist/style.css';

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
      <body className="m-0 p-0 bg-dark text-white">{children}</body>
    </html>
  );
}
