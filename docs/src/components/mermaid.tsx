'use client';

import { use, useEffect, useId, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import Zoom from 'react-medium-image-zoom';
import 'react-medium-image-zoom/dist/styles.css';

export function Mermaid({ chart }: { chart: string }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return <MermaidContent chart={chart} />;
}

const cache = new Map<string, Promise<unknown>>();

function cachePromise<T>(key: string, setPromise: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached) return cached as Promise<T>;
  const promise = setPromise();
  cache.set(key, promise);
  return promise;
}

function MermaidContent({ chart }: { chart: string }) {
  const id = useId();
  const bindRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const { default: mermaid } = use(cachePromise('mermaid', () => import('mermaid')));

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    fontFamily: 'inherit',
    theme: resolvedTheme === 'dark' ? 'dark' : 'neutral',
    themeVariables:
      resolvedTheme === 'dark'
        ? {}
        : {
            background: 'transparent',
            primaryColor: '#e2e8f0',
            primaryTextColor: '#0f172a',
            primaryBorderColor: '#cbd5e1',
            lineColor: '#64748b',
            secondaryColor: '#f1f5f9',
            tertiaryColor: '#f8fafc',
            edgeLabelBackground: '#f8fafc',
            clusterBkg: '#f1f5f9',
            clusterBorder: '#cbd5e1',
            titleColor: '#0f172a',
            nodeTextColor: '#0f172a',
          },
  });

  const { svg, bindFunctions } = use(
    cachePromise(`${chart}-${resolvedTheme}`, () =>
      mermaid.render(id, chart.replaceAll('\\n', '\n')),
    ),
  );

  return (
    <Zoom classDialog="mermaid-zoom-dialog">
      <div
        ref={(el) => {
          (bindRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
          if (el) bindFunctions?.(el);
        }}
        className="overflow-x-auto rounded-lg border border-fd-border bg-fd-card px-6 py-4 my-4 flex justify-center cursor-zoom-in"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </Zoom>
  );
}
