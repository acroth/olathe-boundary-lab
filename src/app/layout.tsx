import type { Metadata, Viewport } from 'next';
import './globals.css';
import { TooltipProvider } from '@/components/ui/tooltip';

const DESCRIPTION = 'View, compare and edit Olathe USD 233\'s proposed elementary and middle school boundary concepts, and see how full each school would be. Independent project, not affiliated with Olathe Public Schools.';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.olatheboundarylab.com'),
  title: 'Olathe Boundary Lab',
  description: DESCRIPTION,
  // link previews in texts, email and social posts (public/og-image.png, made by scripts/social-image.mjs).
  // The favicon is src/app/icon.svg and src/app/apple-icon.png, which Next.js links automatically.
  openGraph: {
    type: 'website', url: '/', siteName: 'Olathe Boundary Lab', title: 'Olathe Boundary Lab', description: DESCRIPTION,
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Olathe Boundary Lab: a map of the proposed school boundary concepts' }],
  },
  twitter: { card: 'summary_large_image', title: 'Olathe Boundary Lab', description: DESCRIPTION, images: ['/og-image.png'] },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><TooltipProvider>{children}</TooltipProvider></body></html>;
}
