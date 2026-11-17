import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import { Dimensions, Image, Pressable, Text, View } from 'react-native';
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, Extrapolation, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { accountMeta, displayName, formatMoney, themeFor, type Account, type Paise } from '@folio/core';
import { tick } from '../lib/haptics';
import { useArtwork } from '../lib/photos';
import { useUi } from '../lib/store';
import { C, F } from '../lib/theme';
import { Icon, InstitutionBadge } from './ui';

const W = Dimensions.get('window').width;
export const CARD_W = Math.min(340, W - 64);
export const CARD_H = CARD_W / 1.586;
const GAP = 14;

function Pattern({ kind, ink }: { kind?: string | null; ink: 'light' | 'dark' }) {
  if (!kind) return null;
  const s = ink === 'light' ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)';
  return (
    <Svg style={{ position: 'absolute', left: 0, top: 0 }} width={CARD_W} height={CARD_H} viewBox="0 0 340 214" preserveAspectRatio="xMidYMid slice">
      {kind === 'lines' && Array.from({ length: 22 }, (_, i) => <Line key={i} x1={-60 + i * 22} y1={0} x2={60 + i * 22} y2={214} stroke={s} strokeWidth={1} />)}
      {kind === 'waves' && Array.from({ length: 9 }, (_, i) => <Path key={i} d={`M-20 ${40 + i * 22} C 60 ${10 + i * 22}, 140 ${70 + i * 22}, 220 ${40 + i * 22} S 380 ${10 + i * 22}, 420 ${40 + i * 22}`} fill="none" stroke={s} strokeWidth={1.2} />)}
      {kind === 'dots' && Array.from({ length: 120 }, (_, i) => <Circle key={i} cx={(i % 15) * 24 + 8} cy={Math.floor(i / 15) * 26 + 10} r={1.4} fill={s} />)}
      {kind === 'grid' && Array.from({ length: 16 }, (_, i) => <Line key={i} x1={i * 24} y1={0} x2={i * 24} y2={214} stroke={s} />)}
      {kind === 'grid' && Array.from({ length: 10 }, (_, i) => <Line key={`h${i}`} x1={0} y1={i * 24} x2={340} y2={i * 24} stroke={s} />)}
      {kind === 'rings' && Array.from({ length: 8 }, (_, i) => <Circle key={i} cx={300} cy={30} r={30 + i * 26} fill="none" stroke={s} strokeWidth={1.2} />)}
    </Svg>
  );
}

function Chip() {
  return (
    <Svg width={34} height={25} viewBox="0 0 38 28">
      <Rect x={0.5} y={0.5} width={37} height={27} rx={6} fill="#cdb67a" stroke="rgba(0,0,0,0.25)" />
      <Path d="M0 9h12M0 19h12M26 9h12M26 19h12M12 0v28M26 0v28M12 14h14" stroke="rgba(0,0,0,0.28)" strokeWidth={1} fill="none" />
    </Svg>
  );
}

export function FinanceCard({ account, balance, available, onPress, artworkPath }: { account: Account; balance: Paise; available?: Paise | null; onPress?: () => void; artworkPath?: string | null }) {
  const theme = themeFor(account);
  const meta = accountMeta(account.type);
  const hidden = useUi((s) => s.hideBalances);
  // An uploaded photo always wins over Folio's own artwork.
  const art = useArtwork(artworkPath ?? account.artworkPath);
  const light = theme.ink === 'light';
  const fg = light ? '#fff' : '#111';
  const dim = light ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.55)';
  const isCredit = meta.group === 'credit';
  const label = isCredit ? 'OUTSTANDING' : meta.group === 'loan' ? 'PRINCIPAL LEFT' : 'AVAILABLE BALANCE';
  const colors = (theme.colors.length >= 2 ? theme.colors : [theme.colors[0] ?? '#222', theme.colors[0] ?? '#111']) as [string, string, ...string[]];

  return (
    <Pressable
      onPress={() => {
        tick();
        onPress?.();
      }}
      style={{ width: CARD_W, height: CARD_H, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', elevation: 14, shadowColor: '#000' }}
    >
      {art ? <Image source={{ uri: art }} style={{ position: 'absolute', width: CARD_W, height: CARD_H }} resizeMode="cover" /> : <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', width: CARD_W, height: CARD_H }} />}
      {!art && <Pattern kind={theme.pattern} ink={theme.ink} />}
      {!art && <LinearGradient colors={['rgba(255,255,255,0.14)', 'transparent']} start={{ x: 0.1, y: 0 }} end={{ x: 0.6, y: 0.7 }} style={{ position: 'absolute', width: CARD_W, height: CARD_H }} />}
      {art ? (
        // The owner's own card photo is the face, shown as-is; only a balance chip on top.
        <View style={{ flex: 1, justifyContent: 'flex-end', padding: 10 }}>
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: CARD_H / 3 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 6 }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, color: 'rgba(255,255,255,0.88)', fontFamily: F.bold, fontSize: 11, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4, overflow: 'hidden' }}>{displayName(account)}</Text>
            <Text style={{ color: '#fff', fontFamily: F.extrabold, fontSize: 13, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4, overflow: 'hidden', fontVariant: ['tabular-nums'] }}>
              {hidden ? '₹ ••••' : formatMoney(balance, { decimals: 0 })}
              {available != null && !hidden ? <Text style={{ color: 'rgba(255,255,255,0.6)', fontFamily: F.semibold }}> · {formatMoney(available, { decimals: 0 })} free</Text> : null}
            </Text>
          </View>
        </View>
      ) : (
      <View style={{ flex: 1, padding: 18, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text numberOfLines={1} style={{ color: dim, fontFamily: F.extrabold, fontSize: 10, letterSpacing: 2 }}>{(account.institutionName || meta.short).toUpperCase()}</Text>
            <Text numberOfLines={1} style={{ color: fg, fontFamily: F.display, fontSize: 18, marginTop: 2 }}>{displayName(account)}</Text>
          </View>
          {account.institutionName || account.institutionId ? <InstitutionBadge institutionId={account.institutionId} name={account.institutionName} size={30} /> : <Icon name={account.icon || meta.icon} size={20} color={fg} />}
        </View>
        <View>
          {(isCredit || account.type === 'debit_card') && <Chip />}
          <Text style={{ color: dim, fontFamily: F.extrabold, fontSize: 9.5, letterSpacing: 1.8, marginTop: 6 }}>{label}</Text>
          <Text style={{ color: fg, fontFamily: F.display, fontSize: 25, fontVariant: ['tabular-nums'] }}>{hidden ? '₹ ••••••' : formatMoney(balance, { decimals: 2 })}</Text>
          {available != null && <Text style={{ color: dim, fontFamily: F.semibold, fontSize: 11.5 }}>{hidden ? '••••' : `${formatMoney(available, { decimals: 0 })} available`}</Text>}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <Text style={{ color: dim, fontFamily: F.mono, fontSize: 12.5, letterSpacing: 2 }}>{account.last4 ? `•••• ${account.last4}` : account.customTypeLabel ?? meta.label}</Text>
          {isCredit && account.card?.network && account.card.network !== 'other' ? (
            <Text style={{ color: fg, fontFamily: F.displayBold, fontStyle: 'italic', fontSize: 13 }}>{account.card.network === 'rupay' ? 'RuPay' : account.card.network.toUpperCase()}</Text>
          ) : (
            <Text style={{ color: dim, fontFamily: F.extrabold, fontSize: 9.5, letterSpacing: 1.6 }}>{(account.customTypeLabel || meta.short).toUpperCase()}</Text>
          )}
        </View>
      </View>
      )}
      {account.status !== 'active' && (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' } as never}>
          <Text style={{ color: '#fff', fontFamily: F.extrabold, letterSpacing: 2 }}>{account.status.toUpperCase()}</Text>
        </View>
      )}
    </Pressable>
  );
}

function CarouselItem({ index, x, children }: { index: number; x: SharedValue<number>; children: ReactNode }) {
  const style = useAnimatedStyle(() => {
    const pos = index * (CARD_W + GAP);
    const d = (x.value - pos) / (CARD_W + GAP);
    return {
      transform: [
        { perspective: 900 },
        { scale: interpolate(Math.abs(d), [0, 1], [1, 0.9], Extrapolation.CLAMP) },
        { rotateY: `${interpolate(d, [-1, 0, 1], [12, 0, -12], Extrapolation.CLAMP)}deg` },
        { translateY: interpolate(Math.abs(d), [0, 1], [0, 10], Extrapolation.CLAMP) },
      ],
      opacity: interpolate(Math.abs(d), [0, 1, 2], [1, 0.6, 0.35], Extrapolation.CLAMP),
    };
  });
  return <Animated.View style={[{ width: CARD_W, marginRight: GAP }, style]}>{children}</Animated.View>;
}

/** Snap carousel: centred card full size, neighbours tilt back in depth. Haptic tick per card. */
export function Carousel<T>({ items, keyOf, render, trailing, onIndex }: { items: T[]; keyOf: (t: T) => string; render: (t: T, i: number) => ReactNode; trailing?: ReactNode; onIndex?: (i: number) => void }) {
  const x = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const handler = useAnimatedScrollHandler((e) => {
    x.value = e.contentOffset.x;
  });
  const total = items.length + (trailing ? 1 : 0);
  return (
    <View>
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_W + GAP}
        decelerationRate="fast"
        onScroll={handler}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: (W - CARD_W) / 2, paddingVertical: 10 }}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / (CARD_W + GAP));
          if (i !== index) {
            tick();
            setIndex(i);
            if (i < items.length) onIndex?.(i);
          }
        }}
      >
        {items.map((it, i) => (
          <CarouselItem key={keyOf(it)} index={i} x={x}>
            {render(it, i)}
          </CarouselItem>
        ))}
        {trailing && (
          <CarouselItem index={items.length} x={x}>
            {trailing}
          </CarouselItem>
        )}
      </Animated.ScrollView>
      {total > 1 && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 }}>
          {Array.from({ length: total }, (_, i) => (
            <View key={i} style={{ height: 5, width: i === index ? 18 : 5, borderRadius: 3, backgroundColor: C.chalk, opacity: i === index ? 1 : 0.25 }} />
          ))}
        </View>
      )}
    </View>
  );
}

export function AddCardFace({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ width: CARD_W, height: CARD_H, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.lineStrong, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: C.ink1 }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: C.mute, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="plus" size={20} color={C.mute} />
      </View>
      <Text style={{ color: C.mute, fontFamily: F.bold, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

/** Small card-shaped thumbnail: your uploaded photo if there is one, else the card colours. */
export function AccountThumb({ account, artworkPath, width = 34 }: { account: Account; artworkPath?: string | null; width?: number }) {
  const art = useArtwork(artworkPath ?? account.artworkPath);
  const h = Math.round(width / 1.586);
  const theme = themeFor(account);
  if (art) return <Image source={{ uri: art }} style={{ width, height: h, borderRadius: 5 }} resizeMode="cover" />;
  return <LinearGradient colors={(theme.colors.length >= 2 ? theme.colors : [theme.colors[0] ?? '#333', '#111']) as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width, height: h, borderRadius: 5 }} />;
}
