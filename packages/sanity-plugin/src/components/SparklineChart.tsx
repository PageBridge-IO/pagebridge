import { Card, Flex, Stack, Text } from "@sanity/ui";

interface DataPoint {
  date: string;
  value: number;
}

interface SparklineChartProps {
  data: DataPoint[];
  label?: string;
  width?: number;
  height?: number;
  color?: string;
}

export function SparklineChart({
  data,
  label,
  width = 200,
  height = 50,
  color = "currentColor",
}: SparklineChartProps) {
  if (data.length < 2) return null;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const padding = 2;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const points = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * chartWidth;
    const y = padding + chartHeight - ((v - min) / range) * chartHeight;
    return `${x},${y}`;
  });

  const polyline = points.join(" ");
  const fillPoints = `${padding},${padding + chartHeight} ${polyline} ${padding + chartWidth},${padding + chartHeight}`;

  return (
    <Card padding={2} radius={2} style={{ flex: 1, minWidth: 140 }}>
      <Stack space={1}>
        {label && (
          <Text size={0} muted>
            {label}
          </Text>
        )}
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          style={{ display: "block" }}
        >
          <polygon points={fillPoints} fill={color} opacity={0.1} />
          <polyline
            points={polyline}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
        <Flex justify="space-between">
          <Text size={0} muted>
            {data[0]?.date}
          </Text>
          <Text size={0} muted>
            {data[data.length - 1]?.date}
          </Text>
        </Flex>
      </Stack>
    </Card>
  );
}
