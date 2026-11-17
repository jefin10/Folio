import { Text, View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { toChartRupees, type Paise } from '@folio/core';
import { C, F } from '../lib/theme';

export function Bars({ data, series, width, height = 180 }: { data: { label: string; values: Paise[] }[]; series: { color: string }[]; width: number; height?: number }) {
  const max = Math.max(1, ...data.flatMap((d) => d.values.map(toChartRupees)));
  const groupW = width / Math.max(1, data.length);
  const barW = Math.min(16, (groupW - 10) / series.length);
  const base = height - 22;
  const empty = data.every((d) => d.values.every((v) => v <= 0n));
  return (
    <View>
      <Svg width={width} height={height}>
        <Line x1={0} x2={width} y1={base + 0.5} y2={base + 0.5} stroke={C.line} strokeWidth={1} />
        {data.map((d, i) => {
          const gx = i * groupW + (groupW - barW * series.length - (series.length - 1) * 3) / 2;
          return d.values.map((v, j) => {
            const h = (Math.max(0, toChartRupees(v)) / max) * (base - 8);
            return <Rect key={`${i}-${j}`} x={gx + j * (barW + 3)} y={base - h} width={barW} height={h} rx={Math.min(4, barW / 2)} fill={series[j]!.color} />;
          });
        })}
        {data.map((d, i) => (
          <SvgText key={`l${i}`} x={i * groupW + groupW / 2} y={height - 5} fontSize={10} fontFamily={F.bold} fill={C.mute} textAnchor="middle">
            {d.label}
          </SvgText>
        ))}
      </Svg>
      {empty && (
        <Text style={{ position: 'absolute', left: 0, right: 0, top: base / 2 - 10, textAlign: 'center', color: C.mute, fontFamily: F.semibold, fontSize: 13 }}>Nothing here yet</Text>
      )}
    </View>
  );
}
