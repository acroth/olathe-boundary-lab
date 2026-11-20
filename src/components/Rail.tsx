'use client';
import Link from 'next/link';
import { Blocks, Info, MapPinned, MessageSquareText, PenLine, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type RailPage = 'build' | 'draw' | 'about' | 'contact';

interface Props {
  active: RailPage;
  /** In the lab, Concept builder / Free draw switch modes in place; elsewhere they link back to the lab. */
  onMode?: (m: 'build' | 'draw') => void;
}

const LAB: { id: 'build' | 'draw'; label: string; icon: LucideIcon; href: string }[] = [
  { id: 'build', label: 'Concept builder', icon: Blocks, href: '/' },
  { id: 'draw', label: 'Free draw', icon: PenLine, href: '/#mode=draw' },
];
const PAGES: { id: 'about' | 'contact'; label: string; icon: LucideIcon; href: string }[] = [
  { id: 'about', label: 'About & data', icon: Info, href: '/about' },
  { id: 'contact', label: 'Feedback', icon: MessageSquareText, href: '/contact' },
];

const item = 'relative flex size-11 max-md:h-12 max-md:w-[72px] max-md:flex-col max-md:gap-0.5 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-5';
const on = 'bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground';

function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent side="right">{label}</TooltipContent></Tooltip>;
}

/** Left navigation rail (bottom tab bar on phones). */
export default function Rail({ active, onMode }: Props) {
  return (
    <TooltipProvider>
      <nav aria-label="Main" className="rail fixed z-30 flex border-border bg-card
        inset-x-0 bottom-0 h-[calc(60px+env(safe-area-inset-bottom))] flex-row items-start justify-around border-t px-2 pt-2 pb-[env(safe-area-inset-bottom)]
        md:inset-y-0 md:left-0 md:right-auto md:h-auto md:w-[72px] md:flex-col md:items-center md:justify-start md:gap-0 md:border-t-0 md:border-r md:p-0">
        <Link href="/" aria-label="Olathe Boundary Lab home" className="hidden h-[72px] w-full items-center justify-center border-b md:flex">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary"><MapPinned className="size-5" strokeWidth={2.2} /></span>
        </Link>
        <div className="contents md:flex md:flex-col md:items-center md:gap-2 md:pt-3">
          {LAB.map(x => {
            const cls = cn(item, active === x.id && on);
            const body = <><x.icon /><span className="text-[10.5px] leading-none font-medium md:sr-only">{x.label}</span></>;
            return <Tip key={x.id} label={x.label}>
              {onMode
                ? <button className={cls} aria-current={active === x.id ? 'page' : undefined} onClick={() => onMode(x.id)}>{body}</button>
                : <Link className={cls} href={x.href}>{body}</Link>}
            </Tip>;
          })}
        </div>
        <div className="contents md:flex md:flex-col md:items-center md:gap-2 md:pt-2">
          {PAGES.map(x => <Tip key={x.id} label={x.label}>
            <Link className={cn(item, active === x.id && on)} href={x.href} aria-current={active === x.id ? 'page' : undefined}><x.icon /><span className="text-[10.5px] leading-none font-medium md:sr-only">{x.label}</span></Link>
          </Tip>)}
        </div>
      </nav>
    </TooltipProvider>
  );
}
