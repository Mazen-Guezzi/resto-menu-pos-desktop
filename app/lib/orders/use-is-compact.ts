'use client';

import { useEffect, useState } from 'react';

const COMPACT_MAX_WIDTH = 500;

/**
 * True when the window is narrow enough that the split-pane orders board
 * shouldn't be shown. Driven by window.innerWidth so it Just Works whether
 * the user resizes manually or toggles floating mode via IPC.
 */
export function useIsCompact(): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const check = () => setCompact(window.innerWidth < COMPACT_MAX_WIDTH);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return compact;
}
