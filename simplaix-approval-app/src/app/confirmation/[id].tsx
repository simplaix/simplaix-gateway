import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { Text } from '@/components/ui/text';
import { Heading } from '@/components/ui/heading';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Badge, BadgeText } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Center } from '@/components/ui/center';
import { Divider } from '@/components/ui/divider';
import {
  fetchConfirmation,
  confirmRequest,
  rejectRequest,
  type ConfirmationEvent,
} from '@/lib/api';
import { setResolvedConfirmation } from '@/lib/resolved-state';

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

const RISK_BADGE_ACTION: Record<RiskLevel, 'success' | 'warning' | 'error'> = {
  low: 'success',
  medium: 'warning',
  high: 'error',
  critical: 'error',
};

export default function ConfirmationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [confirmation, setConfirmation] = useState<ConfirmationEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<'approve' | 'reject' | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const data = await fetchConfirmation(id);
        setConfirmation(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleApprove = useCallback(async () => {
    if (!id) return;
    setActionLoading('approve');
    try {
      await confirmRequest(id);
      setResolvedConfirmation({ id, action: 'approved' });
      router.back();
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Approve failed');
      setActionLoading(null);
    }
  }, [id]);

  const handleReject = useCallback(async () => {
    if (!id) return;
    setActionLoading('reject');
    try {
      await rejectRequest(id, reason || undefined);
      setResolvedConfirmation({ id, action: 'rejected' });
      router.back();
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Reject failed');
      setActionLoading(null);
    }
  }, [id, reason]);

  if (loading) {
    return (
      <Box className="flex-1 bg-background-0">
        <Center className="flex-1">
          <Spinner size="large" className="text-primary-500" />
        </Center>
      </Box>
    );
  }

  if (error || !confirmation) {
    return (
      <Box className="flex-1 bg-background-0">
        <Center className="flex-1 gap-3">
          <Box className="w-14 h-14 rounded-full bg-error-50 items-center justify-center">
            <Ionicons name="alert-circle-outline" size={28} color="#ef4444" />
          </Box>
          <Text className="text-typography-500">{error ?? 'Not found'}</Text>
        </Center>
      </Box>
    );
  }

  const riskAction = RISK_BADGE_ACTION[(confirmation.risk.level as RiskLevel) ?? 'low'];

  return (
    <Box className="flex-1 bg-background-0">
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24, gap: 14 }}>
          <HStack className="justify-between items-start gap-2">
            <VStack className="flex-1 gap-1">
              <Heading size="xl" numberOfLines={2}>
                {confirmation.tool.name}
              </Heading>
              {confirmation.tool.description ? (
                <Text size="sm" className="text-typography-500 leading-relaxed">
                  {confirmation.tool.description}
                </Text>
              ) : null}
            </VStack>
            <Badge action={riskAction} size="md" className="mt-1">
              <BadgeText>{(confirmation.risk.level ?? 'low').toUpperCase()}</BadgeText>
            </Badge>
          </HStack>

          <VStack className="gap-2 mt-1">
            {confirmation.agent?.name ? (
              <MetaRow icon="robot-outline" label="Agent" value={confirmation.agent.name} />
            ) : null}
            {confirmation.tool.provider?.name ? (
              <MetaRow icon="package-variant-closed" label="Provider" value={confirmation.tool.provider.name} />
            ) : null}
            <MetaRow
              icon="clock-outline"
              label="Requested"
              value={new Date(confirmation.timestamp).toLocaleString()}
            />
          </VStack>

          <Divider className="my-1" />

          <HStack className="items-center gap-2 mt-1">
            <Ionicons name="code-slash" size={16} color="#6b7280" />
            <Text bold size="sm">Arguments</Text>
          </HStack>
          <View className="bg-background-100 rounded-xl p-4">
            <Text size="xs" className="font-mono">
              {JSON.stringify(confirmation.arguments, null, 2)}
            </Text>
          </View>

          <HStack className="items-center gap-2 mt-3">
            <MaterialCommunityIcons name="message-text-outline" size={16} color="#6b7280" />
            <Text bold size="sm">Rejection reason</Text>
            <Text size="xs" className="text-typography-400">(optional)</Text>
          </HStack>
          <TextInput
            className="border border-outline-200 rounded-xl px-4 py-3 text-[15px] min-h-[60px] text-typography-900 bg-background-50"
            value={reason}
            onChangeText={setReason}
            placeholder="Enter reason..."
            placeholderTextColor="#9ca3af"
            multiline
          />
        </ScrollView>

        <HStack className="gap-3 px-6 py-4 border-t border-outline-100">
          <Button
            action="negative"
            variant="outline"
            size="lg"
            className="flex-1 rounded-xl gap-2"
            onPress={handleReject}
            isDisabled={actionLoading !== null}
          >
            {actionLoading === 'reject' ? (
              <ButtonSpinner className="text-error-500" />
            ) : (
              <>
                <Ionicons name="close-circle-outline" size={20} color="#ef4444" />
                <ButtonText>Reject</ButtonText>
              </>
            )}
          </Button>
          <Button
            action="primary"
            size="lg"
            className="flex-1 rounded-xl gap-2"
            onPress={handleApprove}
            isDisabled={actionLoading !== null}
          >
            {actionLoading === 'approve' ? (
              <ButtonSpinner color="white" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="white" />
                <ButtonText>Approve</ButtonText>
              </>
            )}
          </Button>
        </HStack>
      </SafeAreaView>
    </Box>
  );
}

function MetaRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <HStack className="items-center gap-3">
      <MaterialCommunityIcons name={icon as any} size={16} color="#9ca3af" />
      <Text size="sm" className="text-typography-500 w-20">{label}</Text>
      <Text size="sm" className="flex-1 text-right" numberOfLines={1}>{value}</Text>
    </HStack>
  );
}
