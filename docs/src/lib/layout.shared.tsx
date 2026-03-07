import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { FaGithub } from 'react-icons/fa';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: 'Simplaix Gateway',
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
