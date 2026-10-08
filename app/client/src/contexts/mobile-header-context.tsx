import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  type ReactNode,
  type DependencyList,
} from 'react';

interface MobileHeaderContextValue {
  content: ReactNode;
  setContent: (content: ReactNode) => void;
  panel: ReactNode | null;
  setPanel: (panel: ReactNode | null) => void;
}

const MobileHeaderContext = createContext<MobileHeaderContextValue | null>(null);

export function MobileHeaderProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ReactNode>(null);
  const [panel, setPanel] = useState<ReactNode | null>(null);
  const value = useMemo(
    () => ({ content, setContent, panel, setPanel }),
    [content, panel],
  );
  return <MobileHeaderContext.Provider value={value}>{children}</MobileHeaderContext.Provider>;
}

// Pages call this to inject content into the mobile header bar row.
// No-op when rendered outside the provider (e.g. in unit tests).
// eslint-disable-next-line react-hooks/exhaustive-deps
export function useMobileHeader(factory: () => ReactNode, deps: DependencyList) {
  const ctx = useContext(MobileHeaderContext);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const content = useMemo(factory, deps);
  useEffect(() => {
    if (!ctx) return;
    ctx.setContent(content);
    return () => ctx.setContent(null);
  }, [content, ctx]);
}

// Pages call this to inject an expandable panel that renders below the header row.
// No-op when rendered outside the provider (e.g. in unit tests).
// eslint-disable-next-line react-hooks/exhaustive-deps
export function useMobilePanel(factory: () => ReactNode | null, deps: DependencyList) {
  const ctx = useContext(MobileHeaderContext);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const panel = useMemo(factory, deps);
  useEffect(() => {
    if (!ctx) return;
    ctx.setPanel(panel);
    return () => ctx.setPanel(null);
  }, [panel, ctx]);
}

// Used by the Layout to read the current content and panel.
export function useMobileHeaderSlots() {
  const ctx = useContext(MobileHeaderContext);
  return { content: ctx?.content ?? null, panel: ctx?.panel ?? null };
}
