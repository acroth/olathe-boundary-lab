// A small calculator icon beside the lab's own estimates, explained on hover.
import { Calculator } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export const ESTIMATE_EXPLANATION = 'Model generated';

/** focusable: false inside a button, where a second focus stop isn't allowed. */
export default function EstimateMark({ focusable = true }: { focusable?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="estimate-mark" tabIndex={focusable ? 0 : undefined} aria-label={ESTIMATE_EXPLANATION} role="img">
          <Calculator aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{ESTIMATE_EXPLANATION}</TooltipContent>
    </Tooltip>
  );
}
