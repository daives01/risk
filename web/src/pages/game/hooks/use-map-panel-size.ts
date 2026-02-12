import { useLayoutEffect, useRef, useState } from "react";

export function useMapPanelSize() {
  const mapPanelRef = useRef<HTMLDivElement | null>(null);
  const [mapPanelHeight, setMapPanelHeight] = useState<number | null>(null);
  const [mapPanelWidth, setMapPanelWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const node = mapPanelRef.current;
    if (!node) return;
    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      const widthFallback = rect.width > 0 ? (rect.width * 3) / 4 : 0;
      const nextHeight = rect.height > 0 ? rect.height : widthFallback;
      setMapPanelHeight(nextHeight > 0 ? nextHeight : null);
      setMapPanelWidth(rect.width > 0 ? rect.width : null);
    };
    updateSize();
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextHeight = entry.contentRect.height;
      setMapPanelHeight(nextHeight > 0 ? nextHeight : null);
      setMapPanelWidth(entry.contentRect.width > 0 ? entry.contentRect.width : null);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return {
    mapPanelRef,
    mapPanelHeight,
    mapPanelWidth,
  };
}
