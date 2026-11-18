import { OVERLAY } from '../map/MapPanel';

/** A short sample of a feeder overlay's line style. */
export default function LineSwatch({ level }: { level: 'ms' | 'hs' }) {
  const overlay = OVERLAY[level];
  const strokeWidth = level === 'hs' ? 3 : 2.2;
  return (
    <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden className="shrink-0">
      <line x1="1" y1="5" x2="21" y2="5" stroke={overlay.color} strokeWidth={strokeWidth} strokeDasharray={overlay.dash ? '5 2.5' : undefined} strokeLinecap="round" />
    </svg>
  );
}
