import { StyleSheet, View } from 'react-native';
import { ThemedText } from './themed-text';

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

const RISK_COLORS: Record<RiskLevel, { bg: string; text: string }> = {
  low: { bg: '#d1fae5', text: '#065f46' },
  medium: { bg: '#fef3c7', text: '#92400e' },
  high: { bg: '#fee2e2', text: '#991b1b' },
  critical: { bg: '#fecaca', text: '#7f1d1d' },
};

const RISK_ICONS: Record<RiskLevel, string> = {
  low: '●',
  medium: '●',
  high: '▲',
  critical: '◆',
};

interface RiskBadgeProps {
  level: RiskLevel;
}

export function RiskBadge({ level }: RiskBadgeProps) {
  const safeLevel = level ?? 'low';
  const colors = RISK_COLORS[safeLevel] ?? RISK_COLORS.low;
  const icon = RISK_ICONS[safeLevel] ?? RISK_ICONS.low;

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <ThemedText style={[styles.icon, { color: colors.text }]}>
        {icon}
      </ThemedText>
      <ThemedText
        type="small"
        style={[styles.label, { color: colors.text }]}
      >
        {safeLevel.toUpperCase()}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  icon: {
    fontSize: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
