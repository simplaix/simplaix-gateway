import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ConfirmationCard } from '@/components/confirmation-card';
import { Text } from '@/components/ui/text';
import { Heading } from '@/components/ui/heading';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Center } from '@/components/ui/center';
import { Spinner } from '@/components/ui/spinner';
import { Badge, BadgeText } from '@/components/ui/badge';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { fetchPendingConfirmations, type ConfirmationEvent } from '@/lib/api';
import { getAuthToken, getGatewayUrl } from '@/lib/storage';
import { consumeResolvedConfirmation } from '@/lib/resolved-state';

const POLL_INTERVAL_MS = 10_000;

export default function ApprovalsScreen() {
  const { refreshKey } = usePushNotifications();

  const [confirmations, setConfirmations] = useState<ConfirmationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [resolvedMap, setResolvedMap] = useState<
    Record<string, 'approved' | 'rejected'>
  >({});

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchPendingConfirmations();
      setConfirmations(data);
      setConfigured(true);
    } catch {
      const url = await getGatewayUrl();
      const token = await getAuthToken();
      setConfigured(!!url && !!token);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (refreshKey > 0) load(true);
  }, [refreshKey, load]);

  useFocusEffect(
    useCallback(() => {
      const resolved = consumeResolvedConfirmation();
      if (resolved) {
        setResolvedMap((prev) => ({
          ...prev,
          [resolved.id]: resolved.action,
        }));
      }
    }, []),
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const handleCardResolved = useCallback(
    (id: string) => {
      setResolvedMap((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      load(true);
    },
    [load],
  );

  if (configured === false) {
    return (
      <Box className="flex-1 bg-background-0">
        <Center className="flex-1 px-6 gap-5">
          <Box className="w-20 h-20 rounded-full bg-primary-50 items-center justify-center">
            <Ionicons name="link" size={36} color="#6366f1" />
          </Box>
          <VStack className="items-center gap-2">
            <Heading size="xl" className="text-center">Welcome</Heading>
            <Text size="sm" className="text-typography-500 text-center leading-relaxed">
              Use the{' '}
              <Text size="sm" bold className="text-primary-500">/pair</Text>
              {' '}command in your agent to pair this device.
            </Text>
          </VStack>
        </Center>
      </Box>
    );
  }

  if (loading && confirmations.length === 0) {
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
        <Box className="flex-1 max-w-[800px] self-center w-full">
          <HStack className="items-center gap-3 px-6 pt-6 pb-3">
            <Ionicons name="shield-checkmark" size={28} color="#6366f1" />
            <Heading size="2xl">Approvals</Heading>
            {confirmations.length > 0 && (
              <Badge action="info" size="sm" className="rounded-full px-2">
                <BadgeText>{confirmations.length}</BadgeText>
              </Badge>
            )}
          </HStack>

          <FlatList
            data={confirmations}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 100 }}
            renderItem={({ item }) => (
              <Pressable onPress={() => router.push(`/confirmation/${item.id}`)}>
                <ConfirmationCard
                  confirmation={item}
                  resolvedAction={resolvedMap[item.id] ?? null}
                  onResolved={() => handleCardResolved(item.id)}
                />
              </Pressable>
            )}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
              />
            }
            ListEmptyComponent={
              <VStack className="items-center pt-20 gap-4">
                <Box className="w-16 h-16 rounded-full bg-success-50 items-center justify-center">
                  <Ionicons name="checkmark-circle" size={32} color="#22c55e" />
                </Box>
                <VStack className="items-center gap-1">
                  <Text bold className="text-typography-700">
                    All caught up
                  </Text>
                  <Text size="sm" className="text-typography-400 text-center">
                    No pending approvals right now
                  </Text>
                </VStack>
              </VStack>
            }
          />
        </Box>
      </SafeAreaView>
    </Box>
  );
}
