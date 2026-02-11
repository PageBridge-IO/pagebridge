import { Card, Flex, Stack, Text, Badge } from "@sanity/ui";

interface PublishingImpactData {
  lastEditedAt: string;
  daysSinceEdit: number;
  positionBefore: number;
  positionAfter: number;
  positionDelta: number;
  clicksBefore: number;
  clicksAfter: number;
  impressionsBefore: number;
  impressionsAfter: number;
  ctrBefore: number;
  ctrAfter: number;
}

interface PublishingImpactSectionProps {
  impact: PublishingImpactData;
}

export function PublishingImpactSection({
  impact,
}: PublishingImpactSectionProps) {
  return (
    <Card padding={3} radius={2} border>
      <Stack space={3}>
        <Text size={1} weight="semibold">
          Publishing Impact
        </Text>
        <Text size={0} muted>
          Since your last edit {impact.daysSinceEdit} days ago:
        </Text>
        <Flex gap={3} wrap="wrap">
          <DeltaCard
            label="Position"
            before={impact.positionBefore.toFixed(1)}
            after={impact.positionAfter.toFixed(1)}
            delta={impact.positionDelta}
            invertDelta
          />
          <DeltaCard
            label="Clicks"
            before={impact.clicksBefore.toLocaleString()}
            after={impact.clicksAfter.toLocaleString()}
            delta={impact.clicksAfter - impact.clicksBefore}
          />
          <DeltaCard
            label="Impressions"
            before={impact.impressionsBefore.toLocaleString()}
            after={impact.impressionsAfter.toLocaleString()}
            delta={impact.impressionsAfter - impact.impressionsBefore}
          />
          <DeltaCard
            label="CTR"
            before={`${(impact.ctrBefore * 100).toFixed(1)}%`}
            after={`${(impact.ctrAfter * 100).toFixed(1)}%`}
            delta={impact.ctrAfter - impact.ctrBefore}
          />
        </Flex>
      </Stack>
    </Card>
  );
}

function DeltaCard({
  label,
  before,
  after,
  delta,
  invertDelta,
}: {
  label: string;
  before: string;
  after: string;
  delta: number;
  invertDelta?: boolean;
}) {
  const isPositive = invertDelta ? delta < 0 : delta > 0;
  const tone = delta === 0 ? "default" : isPositive ? "positive" : "critical";
  const arrow = delta === 0 ? "" : isPositive ? "+" : "";

  return (
    <Card padding={2} radius={2} shadow={1} style={{ minWidth: 90 }}>
      <Stack space={1}>
        <Text size={0} muted>
          {label}
        </Text>
        <Text size={1}>
          {before} → {after}
        </Text>
        {delta !== 0 && (
          <Badge tone={tone} fontSize={0}>
            {arrow}
            {typeof delta === "number" && Math.abs(delta) < 1
              ? delta.toFixed(2)
              : Math.round(delta)}
          </Badge>
        )}
      </Stack>
    </Card>
  );
}
