import { OVERLAY_LINE } from '../map/MapPanel';

/** A short sample of the feeder overlay's line style. */
export default function LineSwatch() {
  return (
    <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden className="shrink-0">
      <line x1="1" y1="5" x2="21" y2="5" stroke={OVERLAY_LINE.color} strokeWidth={OVERLAY_LINE.width} strokeLinecap="round" />
    </svg>
  );
}
