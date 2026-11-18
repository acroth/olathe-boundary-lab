'use client';
import * as React from 'react';
import { ToggleGroup as TG } from 'radix-ui';
import { cn } from '@/lib/utils';

/** Segmented control (shadcn toggle group, styled as pills inside a muted track). */
function ToggleGroup({ className, ...props }: React.ComponentProps<typeof TG.Root>) {
  return <TG.Root data-slot="toggle-group" className={cn('inline-flex w-fit items-center gap-0.5 rounded-lg bg-muted p-0.5', className)} {...props} />;
}
function ToggleGroupItem({ className, ...props }: React.ComponentProps<typeof TG.Item>) {
  return <TG.Item data-slot="toggle-group-item"
    className={cn("inline-flex h-7 min-w-7 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm [&_svg:not([class*='size-'])]:size-3.5", className)} {...props} />;
}
export { ToggleGroup, ToggleGroupItem };
