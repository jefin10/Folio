import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { daysInMonth, formatDate, today, type ISODate } from '@folio/core';
import { tick } from '../lib/haptics';
import { C, F } from '../lib/theme';
import { Icon } from './ui';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const T = today();
const NOW_Y = Number(T.slice(0, 4));

/**
 * A tap-in date: looks like an Input, opens a Folio-style month sheet.
 * No typing, no keyboard. `value` and `onChange` speak ISO dates.
 */
export function DateField({ value, onChange, placeholder = 'Pick a date', optional }: { value: string | null; onChange: (iso: string | null) => void; placeholder?: string; optional?: boolean }) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const initial = value ?? T;
  const [view, setView] = useState({ y: Number(initial.slice(0, 4)), m: Number(initial.slice(5, 7)) });
  const years: number[] = [];
  for (let y = NOW_Y - 12; y <= NOW_Y + 12; y++) years.push(y);

  const days = daysInMonth(view.y, view.m);
  const firstDow = new Date(Date.UTC(view.y, view.m - 1, 1)).getUTCDay();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  const shiftMonth = (d: number) => {
    tick();
    setView((v) => {
      const n = v.m + d;
      return { y: v.y + Math.floor((n - 1) / 12), m: ((n - 1) % 12 + 12) % 12 + 1 };
    });
  };
  const pick = (day: number) => {
    tick();
    onChange(makeISO(view.y, view.m, day));
    setOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={() => {
          tick();
          const init = value ?? T;
          setView({ y: Number(init.slice(0, 4)), m: Number(init.slice(5, 7)) });
          setOpen(true);
        }}
        style={{ height: 48, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }}
      >
        <Icon name="calendar" size={17} color={C.mute} />
        <Text style={{ color: value ? C.chalk : C.faint, fontFamily: F.semibold, fontSize: 15 }}>{value ? formatDate(value) : placeholder}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' }} onPress={() => setOpen(false)} />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: C.ink1, borderWidth: 1, borderBottomWidth: 0, borderColor: C.line, paddingTop: 18, paddingBottom: insets.bottom + 14, paddingHorizontal: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable onPress={() => shiftMonth(-1)} hitSlop={10} style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line }}>
              <Icon name="arrowLeft" size={17} color={C.chalk} />
            </Pressable>
            <Text style={{ color: C.chalk, fontFamily: F.extrabold, fontSize: 18 }}>
              {MONTHS[view.m - 1]} {view.y}
            </Text>
            <Pressable onPress={() => shiftMonth(1)} hitSlop={10} style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line }}>
              <Icon name="arrowRight" size={17} color={C.chalk} />
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 14 }}>
            {years.map((y) => (
              <Pressable
                key={y}
                onPress={() => {
                  tick();
                  setView((v) => ({ ...v, y }));
                }}
                style={{ paddingHorizontal: 12, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: y === view.y ? C.mint : C.ink2, borderWidth: 1, borderColor: y === view.y ? C.mint : C.line }}
              >
                <Text style={{ color: y === view.y ? '#04140d' : C.mute, fontFamily: F.bold, fontSize: 12.5 }}>{y}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', marginTop: 2 }}>
            {DOW.map((d, i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center', paddingVertical: 6 }}>
                <Text style={{ color: C.faint, fontFamily: F.bold, fontSize: 11 }}>{d}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cells.map((d, i) => {
              const iso = d ? makeISO(view.y, view.m, d) : null;
              const sel = iso && value === iso;
              const isToday = iso === T;
              return (
                <View key={i} style={{ width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 5 }}>
                  {d ? (
                    <Pressable
                      onPress={() => pick(d!)}
                      style={{
                        width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: sel ? C.mint : 'transparent',
                        borderWidth: isToday && !sel ? 1 : 0,
                        borderColor: C.mint,
                      }}
                    >
                      <Text style={{ color: sel ? '#04140d' : isToday ? C.mint : C.chalkDim, fontFamily: F.bold, fontSize: 14 }}>{d}</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
          {optional && (
            <Pressable
              onPress={() => {
                tick();
                onChange(null);
                setOpen(false);
              }}
              style={{ alignSelf: 'center', marginTop: 14, paddingHorizontal: 16, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line }}
            >
              <Text style={{ color: C.mute, fontFamily: F.semibold, fontSize: 13 }}>Clear date</Text>
            </Pressable>
          )}
        </View>
      </Modal>
    </>
  );
}

function makeISO(y: number, m: number, d: number): ISODate {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
