// A small calculator icon beside the lab's own estimates, explained on hover.
import { Calculator } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export const ESTIMATE_EXPLANATION = "Our estimate. The district hasn't published a number for this, so the lab's model fills it in.";

/** focusable: false inside a button, where a second focus stop isn't allowed. */
export default function EstimateMark({ focusable = true }: { focusable?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="estimate-mark" tabIndex={focusable ? 0 : undefined} aria-label={ESTIMATE_EXPLANATION} role="img">
          <Calculator aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-60">{ESTIMATE_EXPLANATION}</TooltipContent>
    </Tooltip>
  );
}
