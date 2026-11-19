// A small function icon beside the lab's own estimates. Hover, focus or tap it to see what it means.
import { useState, type SyntheticEvent } from 'react';
import { SquareFunction } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export const ESTIMATE_EXPLANATION = 'Model generated';

/** Stops the tap from also toggling a row the icon sits in, and from the tooltip's own close-on-press. */
const keepOpen = (event: SyntheticEvent) => { event.preventDefault(); event.stopPropagation(); };

/** focusable: false inside a button, where a second focus stop isn't allowed. */
export default function EstimateMark({ focusable = true }: { focusable?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <span className="estimate-mark" tabIndex={focusable ? 0 : undefined} aria-label={ESTIMATE_EXPLANATION} role="img"
          onPointerDown={keepOpen} onClick={event => { keepOpen(event); setOpen(true); }}>
          <SquareFunction aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{ESTIMATE_EXPLANATION}</TooltipContent>
    </Tooltip>
  );
}
