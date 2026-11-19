import { useSyncExternalStore } from 'react';

const PHONE_QUERY = '(max-width: 767px)';

const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

/** True on phone-width screens, where the lab uses its map-first layout. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches, () => false);
}

export const isMobileWidth = () => window.matchMedia(PHONE_QUERY).matches;
