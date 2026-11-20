import type { Metadata, Viewport } from 'next';
import './globals.css';
import { TooltipProvider } from '@/components/ui/tooltip';

const DESCRIPTION = 'View, compare and edit Olathe USD 233\'s proposed elementary and middle school boundary concepts, and see how full each school would be. Independent project, not affiliated with Olathe Public Schools.';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.olatheboundarylab.com'),
  title: 'Olathe Boundary Lab',
  description: DESCRIPTION,
  // link previews in texts, email and social posts
  openGraph: {
    type: 'website', url: '/', siteName: 'Olathe Boundary Lab', title: 'Olathe Boundary Lab', description: DESCRIPTION,
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'Map of Olathe elementary boundary concept 1 with how full each school would be' }],
  },
  twitter: { card: 'summary_large_image', title: 'Olathe Boundary Lab', description: DESCRIPTION, images: ['/og-image.jpg'] },
  icons: { icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23263238'/><path d='M6 22 L13 9 L19 18 L23 12 L27 22 Z' fill='%23e6a23c'/></svg>" },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><TooltipProvider>{children}</TooltipProvider></body></html>;
}
