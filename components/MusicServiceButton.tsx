import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import { makeStyles, serviceColor, useTheme } from '../lib/theme';
import { serviceConnectHint, serviceLabel } from '../lib/services';
import { MusicService } from '../types';
import { ServiceDot, Txt } from './ui';

interface MusicServiceButtonProps {
  service: MusicService;
  connected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  loading?: boolean;
  isPrimary?: boolean;
}

export function MusicServiceButton({
  service, connected, onConnect, onDisconnect, loading = false, isPrimary = false,
}: MusicServiceButtonProps) {
  const s = useStyles();
  const { colors } = useTheme();
  const brand = serviceColor(colors, service);

  return (
    <View style={s.container}>
      <View style={s.left}>
        <ServiceDot service={service} size={12} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.labelRow}>
            <Txt variant="bodyStrong">{serviceLabel(service)}</Txt>
            {isPrimary ? (
              <View style={s.primaryBadge}>
                <Txt variant="micro" color="accent">Primary</Txt>
              </View>
            ) : null}
          </View>
          <Txt variant="caption" color="text3">{connected ? 'Connected' : serviceConnectHint(service)}</Txt>
        </View>
      </View>

      <TouchableOpacity
        style={[s.button, connected ? s.disconnectButton : { backgroundColor: brand }, loading && s.buttonDisabled]}
        onPress={connected ? onDisconnect : onConnect}
        disabled={loading}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${connected ? 'Disconnect' : 'Connect'} ${serviceLabel(service)}`}
      >
        {loading ? (
          <ActivityIndicator color={connected ? colors.text3 : colors.brandInk} size="small" />
        ) : (
          <Txt variant="captionStrong" style={connected ? s.disconnectText : s.buttonText}>
            {connected ? 'Disconnect' : 'Connect'}
          </Txt>
        )}
      </TouchableOpacity>
    </View>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing }) => ({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    gap: spacing.md,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1, minWidth: 0 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  primaryBadge: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm - 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  button: {
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 1,
    paddingHorizontal: spacing.lg,
    minWidth: 100,
    alignItems: 'center',
  },
  disconnectButton: { backgroundColor: colors.surfaceAlt },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.brandInk },
  disconnectText: { color: colors.text3 },
}));
