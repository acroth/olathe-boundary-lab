'use client';
import * as React from 'react';
import { Slider as SliderPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

function Slider({ className, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const n = (props.value ?? props.defaultValue ?? [0]).length;
  return (
    <SliderPrimitive.Root data-slot="slider" className={cn('relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50', className)} {...props}>
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      {Array.from({ length: n }, (_, i) => <SliderPrimitive.Thumb key={i} className="block size-4 shrink-0 rounded-full border border-primary bg-white shadow-sm transition-[color,box-shadow] hover:ring-4 hover:ring-ring/40 focus-visible:ring-4 focus-visible:ring-ring/40 focus-visible:outline-hidden" />)}
    </SliderPrimitive.Root>
  );
}
export { Slider };
