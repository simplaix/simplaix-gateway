import { source } from '@/lib/source';
import { DocsLayoutClient } from './docs-layout-client';

export default function Layout({ children }: LayoutProps<'/docs'>) {
  return (
    <DocsLayoutClient tree={source.getPageTree()}>
      {children}
    </DocsLayoutClient>
  );
}
