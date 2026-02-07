import { useEffect, useState } from "react";
import { useClient } from "sanity";
import { Card, Stack, Text, Badge, Flex, Box, Spinner, Tooltip } from "@sanity/ui";
import { ArrowUpIcon, ArrowDownIcon, ArrowRightIcon, CheckmarkCircleIcon, CloseCircleIcon, WarningOutlineIcon } from "@sanity/icons";

interface IndexStatus {
  verdict: "indexed" | "not_indexed" | "excluded";
  coverageState: string | null;
  lastCrawlTime: string | null;
}

interface WeeklyBreakdownEntry {
  weekStart: string;
  clicks: number;
  impressions: number;
}

interface PerformanceData {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  positionDelta: number;
  topQueries: { query: string; clicks: number; position: number }[];
  weeklyBreakdown?: WeeklyBreakdownEntry[];
  lastUpdated: string;
  indexStatus?: IndexStatus;
}

interface SearchPerformancePaneProps {
  documentId: string;
}

export function SearchPerformancePane({
  documentId,
}: SearchPerformancePaneProps) {
  const client = useClient({ apiVersion: "2024-01-01" });
  const [data, setData] = useState<PerformanceData | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const snapshot = await client.fetch(
        `*[_type == "gscSnapshot" && linkedDocument._ref == $id && period == "last28"][0]{
          clicks,
          impressions,
          ctr,
          position,
          topQueries,
          weeklyBreakdown,
          fetchedAt,
          indexStatus
        }`,
        { id: documentId },
      );

      const previousSnapshot = await client.fetch(
        `*[_type == "gscSnapshot" && linkedDocument._ref == $id && period == "last28"] | order(fetchedAt desc)[1]{
          position
        }`,
        { id: documentId },
      );

      if (snapshot) {
        setData({
          ...snapshot,
          positionDelta: previousSnapshot
            ? snapshot.position - previousSnapshot.position
            : 0,
          weeklyBreakdown: snapshot.weeklyBreakdown,
          lastUpdated: snapshot.fetchedAt,
          indexStatus: snapshot.indexStatus,
        });
      }
      setLoading(false);
    }

    fetchData();
  }, [documentId, client]);

  if (loading) {
    return (
      <Card padding={4}>
        <Flex justify="center">
          <Spinner />
        </Flex>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card padding={4} tone="caution">
        <Text>No search data available for this document.</Text>
      </Card>
    );
  }

  return (
    <Card padding={4}>
      <Stack space={4}>
        <Flex justify="space-between" align="center">
          <Text weight="semibold" size={2}>
            Search Performance (Last 28 Days)
          </Text>
          {data.indexStatus && <IndexStatusBadge status={data.indexStatus} />}
        </Flex>

        <Flex gap={3} wrap="wrap">
          <MetricCard label="Clicks" value={data.clicks.toLocaleString()} />
          <MetricCard
            label="Impressions"
            value={data.impressions.toLocaleString()}
          />
          <MetricCard label="CTR" value={`${(data.ctr * 100).toFixed(1)}%`} />
          <MetricCard
            label="Avg. Position"
            value={data.position.toFixed(1)}
            trend={data.positionDelta}
            invertTrend
          />
        </Flex>

        {data.weeklyBreakdown && data.weeklyBreakdown.length > 0 && (
          <WeeklyChart data={data.weeklyBreakdown} />
        )}

        {data.topQueries?.length > 0 && (
          <Box>
            <Text size={1} weight="semibold" muted style={{ marginBottom: 8 }}>
              Top Queries
            </Text>
            <Stack space={2}>
              {data.topQueries.slice(0, 5).map((q, i) => (
                <Flex key={i} justify="space-between" align="center">
                  <Text size={1} style={{ flex: 1 }}>
                    {q.query}
                  </Text>
                  <Text size={1} muted>
                    {q.clicks} clicks · pos {q.position.toFixed(1)}
                  </Text>
                </Flex>
              ))}
            </Stack>
          </Box>
        )}

        <Text size={0} muted>
          Last updated: {new Date(data.lastUpdated).toLocaleDateString()}
        </Text>
      </Stack>
    </Card>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  trend?: number;
  invertTrend?: boolean;
}

function MetricCard({ label, value, trend, invertTrend }: MetricCardProps) {
  const TrendIcon =
    trend === undefined || trend === 0
      ? ArrowRightIcon
      : (invertTrend ? trend < 0 : trend > 0)
        ? ArrowUpIcon
        : ArrowDownIcon;

  const trendTone =
    trend === undefined || trend === 0
      ? "default"
      : (invertTrend ? trend < 0 : trend > 0)
        ? "positive"
        : "critical";

  return (
    <Card padding={3} radius={2} shadow={1} style={{ minWidth: 100 }}>
      <Stack space={2}>
        <Text size={0} muted>
          {label}
        </Text>
        <Flex align="center" gap={2}>
          <Text size={3} weight="semibold">
            {value}
          </Text>
          {trend !== undefined && trend !== 0 && (
            <Badge tone={trendTone} fontSize={0}>
              <TrendIcon />
              {Math.abs(trend).toFixed(1)}
            </Badge>
          )}
        </Flex>
      </Stack>
    </Card>
  );
}

interface WeeklyChartProps {
  data: WeeklyBreakdownEntry[];
}

function formatWeekLabel(weekStart: string): string {
  const date = new Date(weekStart + "T00:00:00");
  const endDate = new Date(date);
  endDate.setDate(endDate.getDate() + 6);
  const startMonth = date.toLocaleDateString("en-US", { month: "short" });
  const endMonth = endDate.toLocaleDateString("en-US", { month: "short" });
  const startDay = date.getDate();
  const endDay = endDate.getDate();
  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}`;
  }
  return `${startMonth} ${startDay}-${endMonth} ${endDay}`;
}

function WeeklyChart({ data }: WeeklyChartProps) {
  const maxValue = Math.max(
    ...data.map((w) => Math.max(w.clicks, w.impressions)),
    1,
  );
  const barHeight = 120;

  return (
    <Card padding={3} radius={2} shadow={1}>
      <Stack space={3}>
        <Flex justify="space-between" align="center">
          <Text size={1} weight="semibold">
            Weekly Trend
          </Text>
          <Flex gap={3} align="center">
            <Flex gap={1} align="center">
              <Box
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  backgroundColor: "#2276fc",
                }}
              />
              <Text size={0} muted>
                Clicks
              </Text>
            </Flex>
            <Flex gap={1} align="center">
              <Box
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  backgroundColor: "#8fc7ff",
                }}
              />
              <Text size={0} muted>
                Impressions
              </Text>
            </Flex>
          </Flex>
        </Flex>

        <Flex gap={2} align="flex-end" style={{ height: barHeight }}>
          {data.map((week, i) => {
            const clicksHeight = (week.clicks / maxValue) * barHeight;
            const impressionsHeight =
              (week.impressions / maxValue) * barHeight;
            return (
              <Box key={i} style={{ flex: 1, height: "100%" }}>
                <Flex
                  gap={1}
                  align="flex-end"
                  justify="center"
                  style={{ height: "100%" }}
                >
                  <Tooltip
                    content={
                      <Box padding={2}>
                        <Text size={0}>{week.clicks} clicks</Text>
                      </Box>
                    }
                    placement="top"
                  >
                    <Box
                      style={{
                        width: "40%",
                        height: Math.max(clicksHeight, 2),
                        backgroundColor: "#2276fc",
                        borderRadius: "2px 2px 0 0",
                        cursor: "default",
                      }}
                    />
                  </Tooltip>
                  <Tooltip
                    content={
                      <Box padding={2}>
                        <Text size={0}>
                          {week.impressions} impressions
                        </Text>
                      </Box>
                    }
                    placement="top"
                  >
                    <Box
                      style={{
                        width: "40%",
                        height: Math.max(impressionsHeight, 2),
                        backgroundColor: "#8fc7ff",
                        borderRadius: "2px 2px 0 0",
                        cursor: "default",
                      }}
                    />
                  </Tooltip>
                </Flex>
              </Box>
            );
          })}
        </Flex>

        <Flex gap={2}>
          {data.map((week, i) => (
            <Box key={i} style={{ flex: 1, textAlign: "center" }}>
              <Text size={0} muted>
                {formatWeekLabel(week.weekStart)}
              </Text>
            </Box>
          ))}
        </Flex>
      </Stack>
    </Card>
  );
}

interface IndexStatusBadgeProps {
  status: IndexStatus;
}

function IndexStatusBadge({ status }: IndexStatusBadgeProps) {
  const config = {
    indexed: {
      tone: "positive" as const,
      icon: CheckmarkCircleIcon,
      label: "Indexed",
    },
    not_indexed: {
      tone: "critical" as const,
      icon: CloseCircleIcon,
      label: "Not Indexed",
    },
    excluded: {
      tone: "caution" as const,
      icon: WarningOutlineIcon,
      label: "Excluded",
    },
  };

  const { tone, icon: Icon, label } = config[status.verdict];
  const tooltipContent = status.coverageState || label;

  return (
    <Tooltip
      content={
        <Box padding={2}>
          <Stack space={2}>
            <Text size={1}>{tooltipContent}</Text>
            {status.lastCrawlTime && (
              <Text size={0} muted>
                Last crawled: {new Date(status.lastCrawlTime).toLocaleDateString()}
              </Text>
            )}
          </Stack>
        </Box>
      }
      placement="top"
    >
      <Badge tone={tone} fontSize={1} style={{ cursor: "help" }}>
        <Flex align="center" gap={1}>
          <Icon />
          {label}
        </Flex>
      </Badge>
    </Tooltip>
  );
}
