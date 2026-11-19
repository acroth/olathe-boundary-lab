import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** A titled section that stays closed until someone wants the detail inside it. */
export default function Fold({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="fold">
      <summary>{title}<ChevronDown className="fold-chevron" aria-hidden /></summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}
