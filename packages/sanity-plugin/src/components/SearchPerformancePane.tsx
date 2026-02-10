import { useEffect, useState } from "react";
import { useClient } from "sanity";
import {
  Card,
  Stack,
  Text,
  Badge,
  Flex,
  Box,
  Spinner,
  Tooltip,
} from "@sanity/ui";
import {
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowRightIcon,
  CheckmarkCircleIcon,
  CloseCircleIcon,
  WarningOutlineIcon,
  BoltIcon,
} from "@sanity/icons";

interface IndexStatus {
  verdict: "indexed" | "not_indexed" | "excluded";
  coverageState: string | null;
  lastCrawlTime: string | null;
}

interface QueryData {
  query: string;
  clicks: number;
  impressions: number;
  ctr?: number;
  position: number;
}

interface PerformanceData {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  positionDelta: number;
  topQueries: QueryData[];
  quickWinQueries: QueryData[];
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
          quickWinQueries,
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
          topQueries: snapshot.topQueries ?? [],
          quickWinQueries: snapshot.quickWinQueries ?? [],
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

        {data.quickWinQueries.length > 0 && (
          <QuickWinsSection queries={data.quickWinQueries} />
        )}

        {data.topQueries.length > 0 && (
          <TopQueriesTable queries={data.topQueries} />
        )}

        <Text size={0} muted>
          Last updated: {new Date(data.lastUpdated).toLocaleDateString()}
        </Text>
      </Stack>
    </Card>
  );
}

// --- Quick Wins Section ---

function QuickWinsSection({ queries }: { queries: QueryData[] }) {
  return (
    <Card padding={3} radius={2} tone="positive" border>
      <Stack space={3}>
        <Flex align="center" gap={2}>
          <BoltIcon />
          <Text size={1} weight="semibold">
            Quick Wins — Page 1 Opportunities
          </Text>
        </Flex>
        <Text size={0} muted>
          These queries rank at positions 8-20 with strong impressions. Small
          content improvements could push them to page 1.
        </Text>
        <Stack space={2}>
          {queries.map((q, i) => (
            <Card key={i} padding={2} radius={2} shadow={1}>
              <Flex justify="space-between" align="center" gap={2}>
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    size={1}
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {q.query}
                  </Text>
                </Box>
                <Flex align="center" gap={2} style={{ flexShrink: 0 }}>
                  <Badge tone="primary" fontSize={0}>
                    pos {q.position.toFixed(1)}
                  </Badge>
                  <Text size={0} muted>
                    {q.impressions.toLocaleString()} imp
                  </Text>
                </Flex>
              </Flex>
            </Card>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

// --- Top Queries Table ---

function TopQueriesTable({ queries }: { queries: QueryData[] }) {
  return (
    <Box>
      <Text size={1} weight="semibold" muted style={{ marginBottom: 8 }}>
        Top Queries
      </Text>
      <Stack space={1}>
        <Flex
          gap={2}
          style={{
            paddingBottom: 4,
            borderBottom: "1px solid var(--card-border-color)",
          }}
        >
          <Text size={0} muted weight="semibold" style={{ flex: 1 }}>
            Query
          </Text>
          <Text
            size={0}
            muted
            weight="semibold"
            style={{ width: 60, textAlign: "right" }}
          >
            Clicks
          </Text>
          <Text
            size={0}
            muted
            weight="semibold"
            style={{ width: 60, textAlign: "right" }}
          >
            Impr.
          </Text>
          <Text
            size={0}
            muted
            weight="semibold"
            style={{ width: 50, textAlign: "right" }}
          >
            CTR
          </Text>
          <Text
            size={0}
            muted
            weight="semibold"
            style={{ width: 50, textAlign: "right" }}
          >
            Pos.
          </Text>
        </Flex>
        {queries.slice(0, 10).map((q, i) => (
          <Flex key={i} gap={2} align="center" style={{ padding: "4px 0" }}>
            <Text
              size={1}
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {q.query}
            </Text>
            <Text size={1} style={{ width: 60, textAlign: "right" }}>
              {q.clicks.toLocaleString()}
            </Text>
            <Text size={1} muted style={{ width: 60, textAlign: "right" }}>
              {q.impressions.toLocaleString()}
            </Text>
            <Text size={1} muted style={{ width: 50, textAlign: "right" }}>
              {q.ctr != null ? `${(q.ctr * 100).toFixed(1)}%` : "-"}
            </Text>
            <Text size={1} style={{ width: 50, textAlign: "right" }}>
              <PositionText position={q.position} />
            </Text>
          </Flex>
        ))}
      </Stack>
    </Box>
  );
}

function PositionText({ position }: { position: number }) {
  const tone =
    position <= 3 ? "positive" : position <= 10 ? "caution" : "critical";
  return (
    <Badge tone={tone} fontSize={0}>
      {position.toFixed(1)}
    </Badge>
  );
}

// --- Metric Card ---

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

// --- Index Status Badge ---

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
                Last crawled:{" "}
                {new Date(status.lastCrawlTime).toLocaleDateString()}
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
