import React from 'react';
import { View, ViewProps } from 'react-native';
import { config } from './config';
import { OverlayProvider } from '@gluestack-ui/overlay';
import { ToastProvider } from '@gluestack-ui/toast';

type GluestackUIProviderProps = ViewProps & {
  mode?: 'light' | 'dark';
  children?: React.ReactNode;
};

export function GluestackUIProvider({
  mode = 'light',
  children,
  ...props
}: GluestackUIProviderProps) {
  return (
    <View
      style={[
        config[mode],
        { flex: 1, height: '100%', width: '100%' },
      ]}
      {...props}
    >
      <OverlayProvider>
        <ToastProvider>{children}</ToastProvider>
      </OverlayProvider>
    </View>
  );
}
