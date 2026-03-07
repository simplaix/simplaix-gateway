import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { FaGithub } from 'react-icons/fa';
import Image from 'next/image';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <Image src="/logo.png" alt="Simplaix" width={32} height={32} className="rounded-sm" />
          <span className="text-base font-semibold">Simplaix Gateway</span>
        </>
      ),
    },
    links: [
      {
        type: 'icon',
        text: 'GitHub',
        label: 'GitHub',
        url: 'https://github.com/simplaix/simplaix-gateway',
        icon: <FaGithub />,
        external: true,
        on: 'nav',
      },
      {
        type: 'main',
        text: 'simplaix/simplaix-gateway',
        url: 'https://github.com/simplaix/simplaix-gateway',
        icon: <FaGithub />,
        external: true,
        on: 'menu',
      },
    ],
  };
}
