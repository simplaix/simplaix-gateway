import { useCallback, useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { Text } from '@/components/ui/text';
import { Heading } from '@/components/ui/heading';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Card } from '@/components/ui/card';
import { Divider } from '@/components/ui/divider';
import { Spinner } from '@/components/ui/spinner';
import { Center } from '@/components/ui/center';
import {
  getGatewayUrl,
  getAuthToken,
  getPeerId,
  clearCredentials,
} from '@/lib/storage';
import { checkConnection } from '@/lib/api';

type ConnectionStatus = 'unknown' | 'checking' | 'connected' | 'failed';

export default function SettingsScreen() {
  const [gatewayUrl, setGatewayUrlState] = useState<string | null>(null);
  const [peerId, setPeerIdState] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('unknown');
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const savedUrl = await getGatewayUrl();
      const savedToken = await getAuthToken();
      const savedPeerId = await getPeerId();
      setGatewayUrlState(savedUrl);
      setPeerIdState(savedPeerId);

      if (savedUrl && savedToken) {
        setStatus('checking');
        const ok = await checkConnection();
        setStatus(ok ? 'connected' : 'failed');
      }

      setInitialLoading(false);
    })();
  }, []);

  const handleCheckConnection = useCallback(async () => {
    setStatus('checking');
    const ok = await checkConnection();
    setStatus(ok ? 'connected' : 'failed');
  }, []);

  const handleUnpair = useCallback(async () => {
    await clearCredentials();
    setGatewayUrlState(null);
    setPeerIdState(null);
    setStatus('unknown');
  }, []);

  const isPaired = !!gatewayUrl && !!peerId;

  const statusLabel =
    status === 'checking'
      ? 'Checking…'
      : status === 'connected'
        ? 'Connected'
        : status === 'failed'
          ? 'Connection failed'
          : 'Not configured';

  const statusDotColor =
    status === 'connected'
      ? 'bg-success-500'
      : status === 'failed'
        ? 'bg-error-500'
        : 'bg-typography-400';

  const statusTextColor =
    status === 'connected'
      ? 'text-success-600'
      : status === 'failed'
        ? 'text-error-600'
        : 'text-typography-500';

  if (initialLoading) {
    return (
      <Box className="flex-1 bg-background-0">
        <Center className="flex-1">
          <Spinner size="large" className="text-primary-500" />
        </Center>
      </Box>
    );
  }

  return (
    <Box className="flex-1 bg-background-0">
      <SafeAreaView style={{ flex: 1 }}>
        <VStack className="flex-1 px-6 pt-6 pb-20 max-w-[800px] self-center w-full">
          <HStack className="items-center gap-3 mb-6">
            <Ionicons name="settings" size={28} color="#6366f1" />
            <Heading size="2xl">Settings</Heading>
          </HStack>

          <Card variant="outline" className="p-4 gap-3">
            <HStack className="justify-between items-center">
              <HStack className="items-center gap-2">
                <MaterialCommunityIcons name="wifi" size={18} color="#6b7280" />
                <Text bold>Connection</Text>
              </HStack>
              <HStack className="items-center gap-1.5">
                <Box className={`w-2.5 h-2.5 rounded-full ${statusDotColor}`} />
                <Text size="sm" className={statusTextColor}>
                  {statusLabel}
                </Text>
              </HStack>
            </HStack>

            {isPaired && (
              <>
                <Divider />
                <HStack className="items-center gap-3">
                  <Ionicons name="globe-outline" size={16} color="#9ca3af" />
                  <Text size="sm" className="text-typography-500 w-16">Gateway</Text>
                  <Text size="sm" className="flex-1 text-right" numberOfLines={1}>
                    {gatewayUrl}
                  </Text>
                </HStack>
                <HStack className="items-center gap-3">
                  <Ionicons name="finger-print-outline" size={16} color="#9ca3af" />
                  <Text size="sm" className="text-typography-500 w-16">Peer ID</Text>
                  <Text size="xs" className="flex-1 text-right font-mono" numberOfLines={1}>
                    {peerId}
                  </Text>
                </HStack>
              </>
            )}

            {!isPaired && (
              <VStack className="items-center py-4 gap-3">
                <Box className="w-14 h-14 rounded-full bg-primary-50 items-center justify-center">
                  <Ionicons name="link" size={24} color="#6366f1" />
                </Box>
                <Text size="sm" className="text-typography-500 text-center leading-relaxed">
                  No device paired. Use the{' '}
                  <Text size="sm" bold className="text-primary-500">/pair</Text>
                  {' '}command to get started.
                </Text>
              </VStack>
            )}
          </Card>

          {isPaired && (
            <VStack className="mt-4 gap-2">
              <Button
                action="primary"
                size="lg"
                className="rounded-xl gap-2"
                onPress={handleCheckConnection}
                isDisabled={status === 'checking'}
              >
                {status === 'checking' ? (
                  <ButtonSpinner color="white" />
                ) : (
                  <>
                    <Ionicons name="refresh" size={18} color="white" />
                    <ButtonText>Check Connection</ButtonText>
                  </>
                )}
              </Button>

              <Button
                action="negative"
                variant="outline"
                size="lg"
                className="rounded-xl gap-2"
                onPress={handleUnpair}
              >
                <Ionicons name="unlink" size={18} color="#ef4444" />
                <ButtonText>Unpair Device</ButtonText>
              </Button>
            </VStack>
          )}
        </VStack>
      </SafeAreaView>
    </Box>
  );
}
