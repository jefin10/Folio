import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState, type ReactNode } from 'react';
import { Dimensions, Image, Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { formatMoney, themeFor, type Account, type CardTheme, type Paise } from '@folio/core';
import { tick } from '../lib/haptics';
import { useArtwork } from '../lib/photos';
import { useUi } from '../lib/store';
import { C, F } from '../lib/theme';
import { StatusScrim } from './Screen';
import { CircleButton, Icon, InstitutionBadge, Tap } from './ui';

const W = Dimensions.get('window').width;
export const WALLET_CARD_W = W - 40;
export const WALLET_CARD_H = Math.round(WALLET_CARD_W / 1.586);
const PILL_H = 34;
const ITEM_GAP = 26;
const ITEM_H = WALLET_CARD_H + 12 + PILL_H + ITEM_GAP;
const META_H = 26;
const BAR_H = 64;

/** What a card face needs, whether it's an account, a loan or a subscription. */
export interface Face {
  theme: CardTheme;
  artworkPath: string | null;
  name: string;
  institutionName: string | null;
  institutionId: string | null;
  last4: string | null;
  network: string | null;
  chip: boolean;
}

export function faceOf(a: Account): Face {
  return {
    theme: themeFor(a),
    artworkPath: a.artworkPath,
    name: a.nickname || a.name,
    institutionName: a.institutionName,
    institutionId: a.institutionId,
    last4: a.last4,
    network: a.card?.network ?? null,
    chip: a.type === 'debit_card' || a.type === 'credit_card' || a.type === 'secured_credit_card',
  };
}

function networkLabel(n: string | null): string | null {
  if (!n || n === 'other') return null;
  return n === 'rupay' ? 'RuPay' : n === 'amex' ? 'AMEX' : n === 'mastercard' ? 'Mastercard' : n.toUpperCase();
}

function Chip() {
  return (
    <Svg width={38} height={28} viewBox="0 0 38 28">
      <Rect x={0.5} y={0.5} width={37} height={27} rx={6} fill="#d4d0c8" stroke="rgba(0,0,0,0.25)" />
      <Path d="M0 9h12M0 19h12M26 9h12M26 19h12M12 0v28M26 0v28M12 14h14" stroke="rgba(0,0,0,0.3)" strokeWidth={1} fill="none" />
    </Svg>
  );
}

/**
 * Full-width card face. With your photo it is just the photo; without one,
 * a generated face (logo, name, chip, last 4, network). Never any amounts.
 */
export function WalletCard({ face, width = WALLET_CARD_W }: { face: Face; width?: number }) {
  const art = useArtwork(face.artworkPath);
  const h = Math.round(width / 1.586);
  const light = face.theme.ink === 'light';
  const fg = light ? '#fff' : '#111';
  const dim = light ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.6)';
  const colors = (face.theme.colors.length >= 2 ? face.theme.colors : [face.theme.colors[0] ?? '#222', '#0b0b0b']) as [string, string, ...string[]];

  if (art) {
    return (
      <View style={{ width, height: h, borderRadius: 18, overflow: 'hidden', backgroundColor: C.ink3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
        <Image source={{ uri: art }} style={{ width, height: h }} resizeMode="cover" />
      </View>
    );
  }
  return (
    <View style={{ width, height: h, borderRadius: 18, overflow: 'hidden', backgroundColor: C.ink3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', width, height: h }} />
      <View style={{ flex: 1, padding: 18, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {face.institutionName || face.institutionId ? <InstitutionBadge institutionId={face.institutionId} name={face.institutionName} size={30} /> : null}
          <Text numberOfLines={1} style={{ color: fg, fontFamily: F.bold, fontSize: 16, flexShrink: 1 }}>
            {face.name}
          </Text>
        </View>
        {face.chip ? <Chip /> : <View />}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
          {face.last4 ? <Text style={{ color: dim, fontFamily: F.mono, fontSize: 13, letterSpacing: 2 }}>•• {face.last4}</Text> : <View />}
          {networkLabel(face.network) ? <Text style={{ color: fg, fontFamily: F.extrabold, fontStyle: 'italic', fontSize: 13 }}>{networkLabel(face.network)}</Text> : null}
        </View>
      </View>
    </View>
  );
}

/** Card-shaped thumbnail for the bottom selector. */
export function FaceThumb({ face, active }: { face: Face; active?: boolean }) {
  const art = useArtwork(face.artworkPath);
  const colors = (face.theme.colors.length >= 2 ? face.theme.colors : [face.theme.colors[0] ?? '#333', '#111']) as [string, string, ...string[]];
  return (
    <View style={{ width: 48, height: 30, borderRadius: 5, overflow: 'hidden', borderWidth: active ? 2 : 1, borderColor: active ? C.chalk : 'rgba(255,255,255,0.12)' }}>
      {art ? <Image source={{ uri: art }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }} />}
    </View>
  );
}

export interface WalletItem {
  id: string;
  face: Face;
  /** One short line under the card (EMIs: amount · due · ends). Cards and banks have none. */
  meta?: string;
  onDetails: () => void;
}

function DeckItem({ index, itemH, scrollY, viewportH, headerH, children, pill }: { index: number; itemH: number; scrollY: SharedValue<number>; viewportH: SharedValue<number>; headerH: SharedValue<number>; children: ReactNode; pill: ReactNode }) {
  // Cards below the visible area pile up into a deck above the bottom bar;
  // scrolling pulls them out of the deck one by one.
  const card = useAnimatedStyle(() => {
    const top = headerH.value + index * itemH - scrollY.value;
    const deckTop = viewportH.value - BAR_H - 96;
    if (viewportH.value === 0 || top <= deckTop) return { transform: [{ translateY: 0 }, { scale: 1 }] };
    const over = top - deckTop;
    const settled = deckTop + Math.min(over * 0.085, 54);
    return { transform: [{ translateY: settled - top }, { scale: interpolate(over, [0, itemH * 3], [1, 0.93], Extrapolation.CLAMP) }] };
  });
  const pillStyle = useAnimatedStyle(() => {
    const top = headerH.value + index * itemH - scrollY.value;
    const deckTop = viewportH.value - BAR_H - 96;
    return { opacity: viewportH.value === 0 ? 1 : interpolate(top - deckTop, [0, 40], [1, 0], Extrapolation.CLAMP) };
  });
  return (
    <Animated.View style={[{ height: itemH, alignItems: 'center' }, card]}>
      {children}
      <Animated.View style={[{ marginTop: 12 }, pillStyle]}>{pill}</Animated.View>
    </Animated.View>
  );
}

/**
 * Vertical wallet: full-width cards, "View details" under each, the rest
 * stacked as a deck, and a bottom bar to jump between them.
 */
export function WalletList({ header, items, addLabel, onAdd, empty }: { header: ReactNode; items: WalletItem[]; addLabel: string; onAdd: () => void; empty?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const viewportH = useSharedValue(0);
  const headerH = useSharedValue(0);
  const ref = useRef<Animated.ScrollView>(null);
  const [active, setActive] = useState(-1);
  const headerHeight = useRef(0);
  const tabH = insets.bottom + 62;
  const hidden = useUi((s) => s.hideBalances);
  const itemH = ITEM_H + (items.some((it) => it.meta) ? META_H : 0);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const jump = (i: number) => {
    tick();
    setActive(i);
    ref.current?.scrollTo({ y: i < 0 ? 0 : headerHeight.current + i * itemH - 12, animated: true });
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.ink }} onLayout={(e: LayoutChangeEvent) => (viewportH.value = e.nativeEvent.layout.height - tabH)}>
      <Animated.ScrollView
        ref={ref}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: tabH + BAR_H + WALLET_CARD_H }}
        onMomentumScrollEnd={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          setActive(y < 40 ? -1 : Math.max(0, Math.min(items.length - 1, Math.round((y - headerHeight.current) / itemH))));
        }}
      >
        <View
          onLayout={(e) => {
            headerHeight.current = e.nativeEvent.layout.height;
            headerH.value = e.nativeEvent.layout.height;
          }}
        >
          {header}
        </View>
        {items.length === 0
          ? empty
          : items.map((it, i) => (
              <DeckItem
                key={it.id}
                index={i}
                itemH={itemH}
                scrollY={scrollY}
                viewportH={viewportH}
                headerH={headerH}
                pill={
                  <Tap
                    onPress={() => {
                      tick();
                      it.onDetails();
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: PILL_H, paddingLeft: 18, paddingRight: 14, borderRadius: PILL_H / 2, borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.ink1 }}
                    pressedStyle={{ backgroundColor: C.ink3 }}
                  >
                    <Text style={{ color: C.chalk, fontFamily: F.bold, fontSize: 13 }}>View details</Text>
                    <Icon name="chevronRight" size={14} color={C.chalkDim} />
                  </Tap>
                }
              >
                <Pressable onPress={it.onDetails}>
                  <WalletCard face={it.face} />
                </Pressable>
                {it.meta ? (
                  <Text numberOfLines={1} adjustsFontSizeToFit style={{ height: META_H - 6, marginTop: 10, maxWidth: WALLET_CARD_W, color: C.chalkDim, fontFamily: F.semibold, fontSize: 13 }}>
                    {hidden ? it.meta.replace(/₹[\d,.]+/g, '₹ ••••') : it.meta}
                  </Text>
                ) : null}
              </DeckItem>
            ))}
      </Animated.ScrollView>

      {items.length > 0 && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: tabH, height: BAR_H, backgroundColor: C.ink1, borderTopWidth: 1, borderTopColor: C.line }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', gap: 12, paddingHorizontal: 16, height: BAR_H }}>
            <Pressable onPress={() => jump(-1)} style={{ alignItems: 'center', paddingHorizontal: 4 }}>
              <Text style={{ color: active < 0 ? C.chalk : C.mute, fontFamily: F.extrabold, fontSize: 12, letterSpacing: 1.2 }}>ALL ({items.length})</Text>
              <View style={{ marginTop: 4, height: 2, width: 18, backgroundColor: active < 0 ? C.chalk : 'transparent' }} />
            </Pressable>
            {items.map((it, i) => (
              <Pressable key={it.id} onPress={() => jump(i)}>
                <FaceThumb face={it.face} active={active === i} />
              </Pressable>
            ))}
            <Pressable onPress={onAdd} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: C.lineStrong }}>
              <Icon name="plus" size={14} color={C.chalk} />
              <Text style={{ color: C.chalk, fontFamily: F.bold, fontSize: 12.5 }}>{addLabel}</Text>
            </Pressable>
          </ScrollView>
        </View>
      )}
      <StatusScrim />
    </View>
  );
}

/** Two headline numbers at the top of Cards / Debit / EMIs. */
export function WalletHeader({ title, onAdd, onBack, left, right }: { title: string; onAdd: () => void; onBack?: () => void; left: { label: string; value: Paise; tone?: string }; right: { label: string; value: Paise; tone?: string } }) {
  const hidden = useUi((s) => s.hideBalances);
  const fmt = (v: Paise) => (hidden ? '₹ ••••' : formatMoney(v, { decimals: 0 }));
  return (
    <View style={{ paddingHorizontal: 20, paddingBottom: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {onBack ? <CircleButton icon="arrowLeft" label="Back" onPress={onBack} /> : null}
          <Text style={{ color: C.chalk, fontFamily: F.extrabold, fontSize: 30, letterSpacing: -0.6 }}>{title}</Text>
        </View>
        <Tap onPress={onAdd} hitSlop={10} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.lineStrong }} pressedStyle={{ backgroundColor: C.ink3 }}>
          <Icon name="plus" size={18} color={C.chalk} />
        </Tap>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 16 }}>
        {[left, right].map((x, i) => (
          <View key={x.label} style={{ flex: 1, paddingLeft: i ? 16 : 0, borderLeftWidth: i ? 1 : 0, borderLeftColor: C.line }}>
            <Text style={{ color: C.mute, fontFamily: F.extrabold, fontSize: 10.5, letterSpacing: 1.6 }}>{x.label.toUpperCase()}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: x.tone ?? C.chalk, fontFamily: F.extrabold, fontSize: 26, marginTop: 4, fontVariant: ['tabular-nums'] }}>
              {fmt(x.value)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
