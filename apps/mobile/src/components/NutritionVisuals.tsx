import Svg, { Circle, Polyline } from "react-native-svg";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

export function ProgressRing({
  progress,
  value,
  label,
  size = 132
}: {
  progress: number;
  value: string;
  label: string;
  size?: number;
}) {
  const strokeWidth = 11;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <View style={[styles.ringWrap, { height: size, width: size }]}>
      <Svg height={size} width={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          fill="transparent"
          r={radius}
          stroke="rgba(255,255,255,0.24)"
          strokeWidth={strokeWidth}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          fill="transparent"
          r={radius}
          stroke="#FFFFFF"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - clamped)}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.ringText}>
        <Text style={styles.ringValue}>{value}</Text>
        <Text style={styles.ringLabel}>{label}</Text>
      </View>
    </View>
  );
}

export function WeeklyBars({ labels, values }: { labels: string[]; values: number[] }) {
  const max = Math.max(...values, 1);

  return (
    <View style={styles.barChart}>
      {values.map((value, index) => {
        const height = Math.max(8, Math.round((value / max) * 142));
        const active = value === max && value > 0;
        return (
          <View key={`${labels[index]}-${index}`} style={styles.barColumn}>
            <View style={styles.barTrack}>
              <View style={[styles.bar, active && styles.barActive, { height }]} />
            </View>
            <Text style={styles.barLabel}>{labels[index]}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function TrendLine({ values }: { values: number[] }) {
  const width = 320;
  const height = 126;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const points = values.map((value, index) => {
    const x = values.length <= 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - 14 - ((value - min) / span) * (height - 28);
    return `${x},${y}`;
  });

  return (
    <View style={styles.lineWrap}>
      <Svg height={height} viewBox={`0 0 ${width} ${height}`} width="100%">
        <Polyline fill="none" points={points.join(" ")} stroke={colors.accent} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        {points.map((point, index) => {
          const [cx, cy] = point.split(",").map(Number);
          return <Circle key={`${point}-${index}`} cx={cx} cy={cy} fill={colors.surface} r="5" stroke={colors.accent} strokeWidth="3" />;
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  ringWrap: {
    alignItems: "center",
    justifyContent: "center"
  },
  ringText: {
    alignItems: "center",
    justifyContent: "center",
    position: "absolute"
  },
  ringValue: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "900"
  },
  ringLabel: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 1
  },
  barChart: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 8,
    height: 176,
    justifyContent: "space-between"
  },
  barColumn: {
    alignItems: "center",
    flex: 1,
    gap: 8
  },
  barTrack: {
    alignItems: "stretch",
    height: 142,
    justifyContent: "flex-end",
    width: "100%"
  },
  bar: {
    backgroundColor: colors.accentSoft,
    borderRadius: 7,
    minWidth: 18
  },
  barActive: {
    backgroundColor: colors.accent
  },
  barLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700"
  },
  lineWrap: {
    minHeight: 126,
    width: "100%"
  }
});
