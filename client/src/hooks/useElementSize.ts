import { useLayoutEffect, useRef, useState } from "react";

/**
 * Report the pixel size of an element, kept up to date via ResizeObserver.
 * We use this to give react-window's virtualized list an explicit height/width
 * (the list needs concrete dimensions) without pulling in an extra auto-sizer
 * dependency.
 */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, ...size };
}
