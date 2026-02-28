import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from 'react-native-reanimated';

import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/text';
import { Heading } from '@/components/ui/heading';
import { Button, ButtonText } from '@/components/ui/button';
import { Center } from '@/components/ui/center';
import { VStack } from '@/components/ui/vstack';
import { Box } from '@/components/ui/box';
import { Spinner } from '@/components/ui/spinner';
import { exchangePairingToken } from '@/lib/api';
import { setGatewayUrl, setAuthToken, setPeerId } from '@/lib/storage';

type PairStatus = 'connecting' | 'connected' | 'error';

async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('[Pair] Must use physical device for push notifications');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Pair] Push permission not granted');
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: projectId ?? undefined,
  });

  return tokenData.data;
}

export default function PairScreen() {
  const params = useLocalSearchParams<{ g?: string; t?: string }>();
  const [status, setStatus] = useState<PairStatus>('connecting');
  const [errorMsg, setErrorMsg] = useState('');

  const circleScale = useSharedValue(0);
  const circleOpacity = useSharedValue(0);
  const checkScale = useSharedValue(0);
  const buttonOpacity = useSharedValue(0);
  const buttonTranslateY = useSharedValue(20);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const gatewayUrl = params.g;
      const pairingToken = params.t;

      if (!gatewayUrl || !pairingToken) {
        setStatus('error');
        setErrorMsg('Invalid pairing link. Missing gateway URL or token.');
        return;
      }

      try {
        const pushToken = await getExpoPushToken();
        if (cancelled) return;

        if (!pushToken) {
          setStatus('error');
          setErrorMsg(
            'Push notification permission is required. Please enable notifications and try again.',
          );
          return;
        }

        const result = await exchangePairingToken({
          gatewayUrl,
          pairingToken,
          pushToken,
          platform: Platform.OS,
          deviceName: Device.deviceName ?? undefined,
        });

        if (cancelled) return;

        await setGatewayUrl(result.gatewayUrl);
        await setAuthToken(result.token);
        await setPeerId(result.peerId);

        setStatus('connected');

        circleOpacity.value = withTiming(1, { duration: 300 });
        circleScale.value = withSpring(1, { damping: 12, stiffness: 180 });
        checkScale.value = withDelay(
          200,
          withSpring(1, { damping: 10, stiffness: 200 }),
        );
        buttonOpacity.value = withDelay(600, withTiming(1, { duration: 400 }));
        buttonTranslateY.value = withDelay(
          600,
          withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) }),
        );
      } catch (err: any) {
        if (cancelled) return;
        console.error('[Pair] Error:', err);
        setStatus('error');

        circleOpacity.value = withTiming(1, { duration: 300 });
        circleScale.value = withSpring(1, { damping: 12, stiffness: 180 });
        checkScale.value = withDelay(
          200,
          withSpring(1, { damping: 10, stiffness: 200 }),
        );

        if (err?.status === 401) {
          setErrorMsg(
            'Pairing link expired or invalid. Please request a new one with /pair.',
          );
        } else {
          setErrorMsg(
            'Failed to connect. Please check your network and try again.',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.g, params.t]);

  const circleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: circleOpacity.value,
    transform: [{ scale: circleScale.value }],
  }));

  const checkAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
    transform: [{ translateY: buttonTranslateY.value }],
  }));

  return (
    <Box className="flex-1 bg-background-0">
      <SafeAreaView style={{ flex: 1 }}>
        <Center className="flex-1 px-6">
          {status === 'connecting' && (
            <VStack className="items-center gap-5">
              <Box className="w-20 h-20 rounded-full bg-primary-50 items-center justify-center">
                <Spinner size="large" className="text-primary-500" />
              </Box>
              <VStack className="items-center gap-2">
                <Heading size="xl">Connecting...</Heading>
                <Text size="sm" className="text-typography-500 text-center leading-relaxed">
                  Setting up your approval app
                </Text>
              </VStack>
            </VStack>
          )}

          {status === 'connected' && (
            <VStack className="items-center gap-5">
              <Animated.View
                className="w-[88px] h-[88px] rounded-full bg-success-50 items-center justify-center"
                style={circleAnimatedStyle}
              >
                <Animated.View
                  className="w-14 h-14 rounded-full bg-success-500 items-center justify-center"
                  style={checkAnimatedStyle}
                >
                  <Ionicons name="checkmark" size={28} color="white" />
                </Animated.View>
              </Animated.View>
              <VStack className="items-center gap-2">
                <Heading size="xl">Connected</Heading>
                <Text size="sm" className="text-typography-500 text-center px-6 leading-relaxed">
                  Your device is paired and ready to receive approval requests.
                </Text>
              </VStack>
              <Animated.View style={buttonAnimatedStyle}>
                <Button
                  size="lg"
                  action="primary"
                  className="mt-4 rounded-xl gap-2"
                  onPress={() => {
                    if (router.canDismiss()) {
                      router.dismissAll();
                    }
                    router.replace('/(tabs)');
                  }}
                >
                  <Ionicons name="arrow-forward" size={18} color="white" />
                  <ButtonText>Go to Approvals</ButtonText>
                </Button>
              </Animated.View>
            </VStack>
          )}

          {status === 'error' && (
            <VStack className="items-center gap-5">
              <Animated.View
                className="w-[88px] h-[88px] rounded-full bg-error-50 items-center justify-center"
                style={circleAnimatedStyle}
              >
                <Animated.View
                  className="w-14 h-14 rounded-full bg-error-500 items-center justify-center"
                  style={checkAnimatedStyle}
                >
                  <Ionicons name="alert" size={28} color="white" />
                </Animated.View>
              </Animated.View>
              <VStack className="items-center gap-2">
                <Heading size="xl">Pairing Failed</Heading>
                <Text size="sm" className="text-typography-500 text-center px-6 leading-relaxed">
                  {errorMsg}
                </Text>
              </VStack>
            </VStack>
          )}
        </Center>
      </SafeAreaView>
    </Box>
  );
}
