import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View, type PressableProps, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { findInstitution, formatCompact, formatMoney, inkOn, moneyParts, type Paise } from '@folio/core';
import { useInstitutionLogos } from '@folio/api';
import { Image } from 'react-native';
import { tap, tick } from '../lib/haptics';
import { useUi } from '../lib/store';
import { C, F } from '../lib/theme';
import { ICONS } from './icons';

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------
/**
 * Pressable with a static style plus an optional pressed overlay. NativeWind's
 * css-interop drops function styles (`style={({ pressed }) => …}`) on device,
 * so every press state goes through this instead.
 */
export function Tap({ style, pressedStyle, onPressIn, onPressOut, ...rest }: Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle>; pressedStyle?: StyleProp<ViewStyle> }) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      style={[style, pressed ? pressedStyle : null]}
    />
  );
}

export function Icon({ name, size = 20, color = C.chalk, strokeWidth = 1.7 }: { name: string; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={ICONS[name] ?? ICONS.sparkle!} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Pop button — flat face with right/bottom edges; sinks into them on press.
// ---------------------------------------------------------------------------
const TONES = {
  chalk: { face: C.chalk, r: '#9a9994', b: '#6b6a66', ink: C.ink },
  mint: { face: C.mint, r: C.mintEdgeR, b: C.mintEdgeB, ink: '#04140d' },
  dark: { face: C.ink3, r: '#343432', b: '#262624', ink: C.chalk },
  coral: { face: C.coral, r: '#c24636', b: '#8a2c20', ink: '#1d0603' },
  gold: { face: C.gold, r: '#b08f4e', b: '#7d6331', ink: '#1a1306' },
} as const;

export function PopButton({ label, onPress, tone = 'chalk', icon, disabled, loading, depth = 5, style, size = 'md' }: { label: string; onPress?: () => void; tone?: keyof typeof TONES; icon?: string; disabled?: boolean; loading?: boolean; depth?: number; style?: StyleProp<ViewStyle>; size?: 'sm' | 'md' | 'lg' }) {
  // Disabled buttons stay solid (dim face) so nothing shows through them.
  const t = disabled ? { face: C.ink3, r: '#2a2a28', b: '#222220', ink: C.faint } : TONES[tone];
  const press = useSharedValue(0);
  const faceStyle = useAnimatedStyle(() => ({ transform: [{ translateX: press.value * depth }, { translateY: press.value * depth }] }));
  const h = size === 'lg' ? 56 : size === 'sm' ? 38 : 48;
  return (
    <Pressable
      disabled={disabled || loading}
      onPressIn={() => {
        press.value = withTiming(1, { duration: 70 });
        tap();
      }}
      onPressOut={() => (press.value = withSpring(0, { damping: 14, stiffness: 420 }))}
      onPress={onPress}
      style={[{ paddingRight: depth, paddingBottom: depth }, style]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {/* Hard edges: a bottom strip and a right strip, offset by `depth` (no shapes behind the face). */}
      <View style={{ position: 'absolute', left: depth, right: depth, bottom: 0, height: depth, backgroundColor: t.b }} />
      <View style={{ position: 'absolute', right: 0, top: depth, bottom: 0, width: depth, backgroundColor: t.r }} />
      <Animated.View style={[{ height: h, backgroundColor: t.face, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: size === 'sm' ? 14 : 22, gap: 8 }, faceStyle]}>
        {loading ? <ActivityIndicator color={t.ink} /> : icon ? <Icon name={icon} size={size === 'lg' ? 20 : 17} color={t.ink} strokeWidth={2.2} /> : null}
        <Text style={{ color: t.ink, fontFamily: F.extrabold, fontSize: size === 'lg' ? 15 : size === 'sm' ? 13 : 14, letterSpacing: size === 'lg' ? 1.2 : 0.2, textTransform: size === 'lg' ? 'uppercase' : 'none' }}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

export function Ghost({ label, onPress, icon, color = C.chalkDim }: { label: string; onPress?: () => void; icon?: string; color?: string }) {
  return (
    <Tap
      onPress={() => {
        tick();
        onPress?.();
      }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 17 }}
      pressedStyle={{ backgroundColor: C.ink3 }}
    >
      {icon && <Icon name={icon} size={15} color={color} />}
      <Text style={{ color, fontFamily: F.bold, fontSize: 13 }}>{label}</Text>
    </Tap>
  );
}

export function CircleButton({ icon, onPress, label, size = 40 }: { icon: string; onPress?: () => void; label: string; size?: number }) {
  return (
    <Tap
      accessibilityLabel={label}
      onPress={() => {
        tick();
        onPress?.();
      }}
      style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: C.lineStrong, alignItems: 'center', justifyContent: 'center' }}
      pressedStyle={{ backgroundColor: C.ink3, transform: [{ scale: 0.94 }] }}
    >
      <Icon name={icon} size={size * 0.46} color={C.chalkDim} />
    </Tap>
  );
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------
export function Money({ value, style, decimals = 'auto', compact, showPlus, maskable = true, tone, bare }: { value: Paise; style?: StyleProp<TextStyle>; decimals?: 'auto' | 0 | 2; compact?: boolean; showPlus?: boolean; maskable?: boolean; tone?: 'auto'; bare?: boolean }) {
  const hidden = useUi((s) => s.hideBalances) && maskable;
  const symbol = bare ? '' : undefined;
  const target = compact ? formatCompact(value) : formatMoney(value, { decimals, showPlus, symbol });
  const [text, setText] = useState(target);
  const prev = useRef<Paise | null>(null);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === null || from === value || compact) {
      setText(target);
      return;
    }
    // Brief count-up between values (display only; settles on the exact figure).
    const start = Date.now();
    const a = Number(from / 100n);
    const b = Number(value / 100n);
    let raf = 0;
    const step = () => {
      const p = Math.min(1, (Date.now() - start) / 600);
      const e = 1 - Math.pow(1 - p, 3);
      if (p < 1) {
        setText(formatMoney(BigInt(Math.round(a + (b - a) * e)) * 100n, { decimals: 0, showPlus, symbol }));
        raf = requestAnimationFrame(step);
      } else setText(target);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, target, compact, showPlus, symbol]);
  const color = tone === 'auto' ? (value > 0n ? C.mint : value < 0n ? C.coral : C.chalk) : undefined;
  return <Text style={[{ color: color ?? C.chalk, fontFamily: F.bold, fontVariant: ['tabular-nums'] }, style]}>{hidden ? '₹ ••••' : text}</Text>;
}

export function HeroMoney({ value, size = 52 }: { value: Paise; size?: number }) {
  const hidden = useUi((s) => s.hideBalances);
  const p = moneyParts(value);
  if (hidden) return <Text style={{ color: C.chalk, fontFamily: F.display, fontSize: size }}>₹ ••••••</Text>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <Text style={{ color: C.chalkDim, fontFamily: F.display, fontSize: size * 0.55, marginBottom: size * 0.08 }}>{p.sign === '−' ? '−' : ''}₹</Text>
      <Money value={value < 0n ? -value : value} decimals={0} maskable={false} bare style={{ fontFamily: F.display, fontSize: size, lineHeight: size * 1.15 }} />
      <Text style={{ color: C.mute, fontFamily: F.semibold, fontSize: size * 0.32, marginBottom: size * 0.16, marginLeft: 2 }}>.{p.fraction}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------
export function Plate({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: C.ink1, borderWidth: 1, borderColor: C.line, borderRadius: 22 }, style]}>{children}</View>;
}

export function Eyebrow({ children, color = C.mute }: { children: ReactNode; color?: string }) {
  return <Text style={{ color, fontFamily: F.extrabold, fontSize: 10.5, letterSpacing: 2, textTransform: 'uppercase' }}>{children}</Text>;
}

export function Title({ children, size = 26 }: { children: ReactNode; size?: number }) {
  return <Text style={{ color: C.chalk, fontFamily: F.displayBold, fontSize: size, lineHeight: size * 1.2, letterSpacing: -0.4 }}>{children}</Text>;
}

export function Section({ title, action, children }: { eyebrow?: string; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ marginTop: 34 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 14 }}>
        <Title size={21}>{title}</Title>
        {action}
      </View>
      {children}
    </View>
  );
}

export function Skeleton({ height, width = '100%', radius = 14, style }: { height: number; width?: number | `${number}%`; radius?: number; style?: StyleProp<ViewStyle> }) {
  const o = useSharedValue(0.4);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [o]);
  const s = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ height, width, borderRadius: radius, backgroundColor: C.ink3 }, s, style]} />;
}

export function Empty({ icon = 'sparkle', title, action }: { icon?: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24 }}>
      <View style={{ width: 60, height: 60, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={26} color={C.mint} />
      </View>
      <Text style={{ color: C.chalk, fontFamily: F.displayBold, fontSize: 18, marginTop: 16, textAlign: 'center' }}>{title}</Text>
      {action && <View style={{ marginTop: 18 }}>{action}</View>}
    </View>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'mint' | 'coral' | 'gold' | 'sky' }) {
  const bg = { neutral: C.ink4, mint: 'rgba(61,220,151,0.13)', coral: 'rgba(255,107,87,0.13)', gold: 'rgba(232,194,122,0.13)', sky: 'rgba(106,168,255,0.13)' }[tone];
  const fg = { neutral: C.chalkDim, mint: C.mint, coral: C.coral, gold: C.gold, sky: C.sky }[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ color: fg, fontFamily: F.extrabold, fontSize: 10.5 }}>{label}</Text>
    </View>
  );
}

export function Meter({ bps, tone = 'mint' }: { bps: number; tone?: 'mint' | 'gold' | 'coral' }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withSpring(Math.max(0, Math.min(100, bps / 100)), { damping: 20, stiffness: 110 });
  }, [bps, w]);
  const s = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: C.ink4, overflow: 'hidden' }}>
      <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: tone === 'mint' ? C.mint : tone === 'gold' ? C.gold : C.coral }, s]} />
    </View>
  );
}

export function Chip({ label, active, onPress, color }: { label: string; active?: boolean; onPress?: () => void; color?: string | null }) {
  return (
    <Pressable
      onPress={() => {
        tick();
        onPress?.();
      }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 13, borderRadius: 17, borderWidth: 1, borderColor: active ? C.chalk : C.line, backgroundColor: active ? C.chalk : C.ink2 }}
    >
      {color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /> : null}
      <Text style={{ color: active ? C.ink : C.chalkDim, fontFamily: F.bold, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function Avatar({ name, color, emoji, size = 38 }: { name: string; color?: string | null; emoji?: string | null; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? C.chalkDim, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: C.ink, fontFamily: F.extrabold, fontSize: size * 0.36 }}>{emoji || initials}</Text>
    </View>
  );
}

export function InstitutionBadge({ institutionId, name, size = 32 }: { institutionId?: string | null; name: string | null; size?: number }) {
  const logos = useInstitutionLogos();
  const url = institutionId ? logos.get(institutionId) : undefined;
  const cat = findInstitution(name ?? undefined);
  const bg = cat?.colors[0] ?? '#2a2a2a';
  const short = cat?.short ?? (name ?? '?').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  if (url) {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#fff', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        <Image source={{ uri: url }} style={{ width: size * 0.76, height: size * 0.76 }} resizeMode="contain" />
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
      <Text style={{ color: inkOn(bg), fontFamily: F.extrabold, fontSize: size * (short.length > 3 ? 0.24 : 0.3) }}>{short}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------
export function Field({ label, children, error }: { label: string; children: ReactNode; hint?: string; error?: string | null }) {
  return (
    <View style={{ gap: 7 }}>
      <Eyebrow>{label}</Eyebrow>
      {children}
      {error ? <Text style={{ color: C.coral, fontFamily: F.semibold, fontSize: 12 }}>{error}</Text> : null}
    </View>
  );
}

export function Input(props: TextInputProps) {
  const [focus, setFocus] = useState(false);
  return (
    <TextInput
      placeholderTextColor={C.faint}
      {...props}
      onFocus={(e) => {
        setFocus(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocus(false);
        props.onBlur?.(e);
      }}
      style={[{ height: 48, borderRadius: 14, borderWidth: 1, borderColor: focus ? 'rgba(61,220,151,0.6)' : C.line, backgroundColor: focus ? C.ink3 : C.ink2, color: C.chalk, fontFamily: F.semibold, fontSize: 15, paddingHorizontal: 14 }, props.style]}
    />
  );
}

export function AmountInput({ value, onChange, big, autoFocus }: { value: string; onChange: (v: string) => void; big?: boolean; autoFocus?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, paddingHorizontal: 16, height: big ? 84 : 48 }}>
      <Text style={{ color: C.chalkDim, fontFamily: F.display, fontSize: big ? 34 : 16, marginRight: 6 }}>₹</Text>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^\d.,kKlL]/g, ''))}
        keyboardType="decimal-pad"
        autoFocus={autoFocus}
        placeholder="0"
        placeholderTextColor={C.faint}
        style={{ flex: 1, color: C.chalk, fontFamily: big ? F.display : F.semibold, fontSize: big ? 46 : 15, fontVariant: ['tabular-nums'] }}
      />
    </View>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: C.ink2, borderRadius: 22, borderWidth: 1, borderColor: C.line, padding: 4 }}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => {
            tick();
            onChange(o.value);
          }}
          style={{ flex: 1, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: value === o.value ? C.chalk : 'transparent' }}
        >
          <Text style={{ color: value === o.value ? C.ink : C.mute, fontFamily: F.bold, fontSize: 12.5 }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

export const T = ({ children, style, dim, faint, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; dim?: boolean; faint?: boolean; numberOfLines?: number }) => (
  <Text numberOfLines={numberOfLines} style={[{ color: faint ? C.faint : dim ? C.mute : C.chalk, fontFamily: F.sans, fontSize: 14 }, style]}>
    {children}
  </Text>
);
