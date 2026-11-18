import type { Metadata, Viewport } from 'next';
import './globals.css';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = {
  title: 'Olathe Boundary Lab',
  description: 'Try Olathe USD 233 elementary boundary options and see capacity, utilization and busing distances. Independent analysis, not affiliated with Olathe Public Schools.',
  icons: { icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23263238'/><path d='M6 22 L13 9 L19 18 L23 12 L27 22 Z' fill='%23e6a23c'/></svg>" },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><TooltipProvider>{children}</TooltipProvider><Analytics /></body></html>;
}
