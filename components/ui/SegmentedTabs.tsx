import { ScrollView, TouchableOpacity, View } from 'react-native';
import { makeStyles } from '../../lib/theme';
import { Txt } from './Txt';

export interface SegmentedTab<T extends string> {
  id: T;
  label: string;
  count?: number;
}

export interface SegmentedTabsProps<T extends string> {
  tabs: readonly SegmentedTab<T>[];
  value: T;
  onChange: (id: T) => void;
  /** `underline` for page-level sections, `pill` for filters. */
  variant?: 'underline' | 'pill';
  scrollable?: boolean;
}

export function SegmentedTabs<T extends string>({ tabs, value, onChange, variant = 'underline', scrollable }: SegmentedTabsProps<T>) {
  const s = useStyles();
  const items = tabs.map((tab) => {
    const active = tab.id === value;
    const showCount = typeof tab.count === 'number' && tab.count > 0;
    return (
      <TouchableOpacity
        key={tab.id}
        onPress={() => onChange(tab.id)}
        activeOpacity={0.8}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        style={[
          variant === 'underline' ? s.uTab : s.pTab,
          variant === 'pill' && active && s.pTabActive,
          scrollable && s.tabScroll,
        ]}
      >
        <Txt
          variant={variant === 'underline' ? 'bodyStrong' : 'captionStrong'}
          style={[
            variant === 'underline' ? (active ? s.uTextActive : s.uText) : (active ? s.pTextActive : s.pText),
          ]}
        >
          {tab.label}
          {showCount ? <Txt variant={variant === 'underline' ? 'bodyStrong' : 'captionStrong'} style={active ? s.countActive : s.count}>{`  ${tab.count}`}</Txt> : null}
        </Txt>
        {variant === 'underline' && active ? <View style={s.underline} /> : null}
      </TouchableOpacity>
    );
  });

  if (scrollable) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={variant === 'underline' ? s.uBar : s.pBar}>
        {items}
      </ScrollView>
    );
  }
  return <View style={variant === 'underline' ? s.uBar : s.pBar}>{items}</View>;
}

const useStyles = makeStyles(({ colors, radius, spacing }) => ({
  uBar: { flexDirection: 'row', paddingHorizontal: spacing.xl, gap: spacing.xxl, borderBottomWidth: 1, borderBottomColor: colors.line },
  uTab: { paddingVertical: spacing.md - 2, position: 'relative' },
  uText: { color: colors.text3 },
  uTextActive: { color: colors.text },
  underline: { position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, borderRadius: 1, backgroundColor: colors.accent },
  pBar: { flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.sm },
  pTab: {
    paddingHorizontal: spacing.lg - 2, paddingVertical: spacing.sm,
    borderRadius: radius.pill, backgroundColor: colors.surfaceAlt,
  },
  pTabActive: { backgroundColor: colors.text },
  pText: { color: colors.text2 },
  pTextActive: { color: colors.bg },
  tabScroll: { flexShrink: 0 },
  count: { color: colors.text4 },
  countActive: { color: colors.text3 },
}));
