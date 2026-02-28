import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { Text } from '@/components/ui/text';
import { Button, ButtonText } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Badge, BadgeText } from '@/components/ui/badge';
import { confirmRequest, rejectRequest, type ConfirmationEvent } from '@/lib/api';

interface ConfirmationCardProps {
  confirmation: ConfirmationEvent;
  resolvedAction?: 'approved' | 'rejected' | null;
  onResolved?: () => void;
}

function timeAgo(ts: string | undefined): string {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  if (Number.isNaN(diff)) return '';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

const RISK_BADGE_ACTION: Record<RiskLevel, 'success' | 'warning' | 'error'> = {
  low: 'success',
  medium: 'warning',
  high: 'error',
  critical: 'error',
};

const DISMISS_DELAY = 1200;

export function ConfirmationCard({
  confirmation,
  resolvedAction: externalResolved,
  onResolved,
}: ConfirmationCardProps) {
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);
  const [resolved, setResolved] = useState<'approved' | 'rejected' | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const overlayOpacity = useSharedValue(0);
  const iconScale = useSharedValue(0);
  const cardOpacity = useSharedValue(1);
  const cardTranslateY = useSharedValue(0);

  const triggerResolveAnimation = useCallback(
    (action: 'approved' | 'rejected') => {
      setResolved(action);
      overlayOpacity.value = withTiming(1, { duration: 250 });
      iconScale.value = withDelay(
        100,
        withSpring(1, { damping: 10, stiffness: 200 }),
      );

      const doDismiss = () => {
        cardOpacity.value = withTiming(
          0,
          { duration: 300, easing: Easing.out(Easing.cubic) },
          (finished) => {
            if (finished && onResolved) runOnJS(onResolved)();
          },
        );
        cardTranslateY.value = withTiming(-8, {
          duration: 300,
          easing: Easing.out(Easing.cubic),
        });
      };

      setTimeout(doDismiss, DISMISS_DELAY);
    },
    [onResolved],
  );

  useEffect(() => {
    if (externalResolved) {
      triggerResolveAnimation(externalResolved);
    }
  }, [externalResolved, triggerResolveAnimation]);

  const handleApprove = useCallback(async () => {
    setLoading('approve');
    setErrorText(null);
    try {
      await confirmRequest(confirmation.id);
      triggerResolveAnimation('approved');
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setLoading(null);
    }
  }, [confirmation.id, triggerResolveAnimation]);

  const handleReject = useCallback(async () => {
    setLoading('reject');
    setErrorText(null);
    try {
      await rejectRequest(confirmation.id);
      triggerResolveAnimation('rejected');
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setLoading(null);
    }
  }, [confirmation.id, triggerResolveAnimation]);

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslateY.value }],
  }));

  const argsPreview = JSON.stringify(confirmation.arguments, null, 2);
  const truncatedArgs =
    argsPreview.length > 200 ? argsPreview.slice(0, 200) + '…' : argsPreview;

  const isApproved = resolved === 'approved';
  const riskAction = RISK_BADGE_ACTION[(confirmation.risk.level as RiskLevel) ?? 'low'];

  return (
    <Animated.View className="mb-3" style={cardAnimatedStyle}>
      <Card variant="outline" className="p-4 gap-3 overflow-hidden">
        <HStack className="justify-between items-start gap-2">
          <HStack className="flex-1 gap-3 items-start">
            <View className="w-9 h-9 rounded-lg bg-primary-50 items-center justify-center mt-0.5">
              <MaterialCommunityIcons name="function-variant" size={18} color="#6366f1" />
            </View>
            <VStack className="flex-1 gap-0.5">
              <Text size="md" bold numberOfLines={1}>
                {confirmation.tool.name}
              </Text>
              {confirmation.tool.provider?.name ? (
                <HStack className="items-center gap-1">
                  <MaterialCommunityIcons name="package-variant-closed" size={12} color="#9ca3af" />
                  <Text size="xs" className="text-typography-400">
                    {confirmation.tool.provider.name}
                  </Text>
                </HStack>
              ) : null}
            </VStack>
          </HStack>
          <Badge action={riskAction} size="sm">
            <BadgeText>{(confirmation.risk.level ?? 'low').toUpperCase()}</BadgeText>
          </Badge>
        </HStack>

        <HStack className="justify-between items-center">
          {confirmation.agent?.name ? (
            <HStack className="items-center gap-1.5">
              <MaterialCommunityIcons name="robot-outline" size={14} color="#9ca3af" />
              <Text size="sm" className="text-typography-500">
                {confirmation.agent.name}
              </Text>
            </HStack>
          ) : <View />}
          <HStack className="items-center gap-1">
            <Ionicons name="time-outline" size={13} color="#9ca3af" />
            <Text size="xs" className="text-typography-400">
              {timeAgo(confirmation.timestamp)}
            </Text>
          </HStack>
        </HStack>

        <View className="bg-background-100 rounded-lg p-3">
          <Text size="xs" className="font-mono" numberOfLines={6}>
            {truncatedArgs}
          </Text>
        </View>

        {errorText && (
          <HStack className="items-center gap-1.5">
            <Ionicons name="warning-outline" size={14} color="#ef4444" />
            <Text size="sm" className="text-error-500">
              {errorText}
            </Text>
          </HStack>
        )}

        {!resolved && (
          <HStack className="gap-2 mt-1">
            <Button
              action="negative"
              variant="outline"
              className="flex-1 gap-1.5"
              onPress={handleReject}
              isDisabled={loading !== null}
            >
              {loading === 'reject' ? null : (
                <Ionicons name="close" size={16} color="#ef4444" />
              )}
              <ButtonText>
                {loading === 'reject' ? 'Rejecting...' : 'Reject'}
              </ButtonText>
            </Button>
            <Button
              action="primary"
              className="flex-1 gap-1.5"
              onPress={handleApprove}
              isDisabled={loading !== null}
            >
              {loading === 'approve' ? null : (
                <Ionicons name="checkmark" size={16} color="white" />
              )}
              <ButtonText>
                {loading === 'approve' ? 'Approving...' : 'Approve'}
              </ButtonText>
            </Button>
          </HStack>
        )}

        {resolved && (
          <Animated.View
            className={`absolute inset-0 rounded-xl items-center justify-center gap-2 ${
              isApproved ? 'bg-success-50/80' : 'bg-error-50/80'
            }`}
            style={overlayAnimatedStyle}
          >
            <Animated.View
              className={`w-12 h-12 rounded-full items-center justify-center ${
                isApproved ? 'bg-success-500' : 'bg-error-500'
              }`}
              style={iconAnimatedStyle}
            >
              <Ionicons
                name={isApproved ? 'checkmark' : 'close'}
                size={24}
                color="white"
              />
            </Animated.View>
            <Text
              bold
              className={isApproved ? 'text-success-600' : 'text-error-600'}
            >
              {isApproved ? 'Approved' : 'Rejected'}
            </Text>
          </Animated.View>
        )}
      </Card>
    </Animated.View>
  );
}
