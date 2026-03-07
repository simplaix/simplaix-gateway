'use client';

import * as PageTree from 'fumadocs-core/page-tree';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import { ReactNode } from 'react';

function SidebarSeparator({ item }: { item: PageTree.Separator }) {
  return (
    <p className="inline-flex items-center gap-2 mb-1.5 px-2 mt-6 first:mt-0 text-md font-semibold text-fd-foreground">
      {item.name}
    </p>
  );
}

export function DocsLayoutClient({
  tree,
  children,
}: {
  tree: PageTree.Root;
  children: ReactNode;
}) {
  return (
    <DocsLayout
      tree={tree}
      {...baseOptions()}
      sidebar={{ components: { Separator: SidebarSeparator } }}
    >
      {children}
    </DocsLayout>
  );
}
