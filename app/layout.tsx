import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'OVIA | Workflow Atlas', description: 'Evidence-based architecture and business workflows for OVIA.' };
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
