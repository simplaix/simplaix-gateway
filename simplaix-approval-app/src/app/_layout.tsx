import '@/global.css';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import React from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const mode = colorScheme === 'dark' ? 'dark' : 'light';
  return (
    <GluestackUIProvider mode={mode}>
      <ThemeProvider value={mode === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen
            name="(tabs)"
            options={{ headerBackTitle: 'Back' }}
          />
          <Stack.Screen
            name="confirmation/[id]"
            options={{
              headerShown: true,
              title: 'Confirmation',
              headerBackTitle: 'Back',
              presentation: 'card',
            }}
          />
          <Stack.Screen
            name="pair"
            options={{
              headerShown: false,
              presentation: 'fullScreenModal',
            }}
          />
        </Stack>
      </ThemeProvider>
    </GluestackUIProvider>
  );
}
