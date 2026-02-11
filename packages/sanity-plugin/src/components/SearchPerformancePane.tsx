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
import { InsightAlerts } from "./InsightAlerts";
import { SparklineChart } from "./SparklineChart";
import { PublishingImpactSection } from "./PublishingImpactSection";

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

interface AlertData {
  type: string;
  severity: "low" | "medium" | "high";
  message: string;
}

interface DailyMetricPoint {
  date: string;
  clicks: number;
  impressions: number;
  position: number;
}

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

interface CannibalizationTarget {
  competingPage: string;
  competingDocumentId: string;
  sharedQueries: string[];
}

interface PerformanceData {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  positionDelta: number;
  topQueries: QueryData[];
  quickWinQueries: QueryData[];
  alerts: AlertData[];
  dailyClicks: DailyMetricPoint[];
  publishingImpact?: PublishingImpactData;
  cannibalizationTargets: CannibalizationTarget[];
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
          alerts,
          dailyClicks,
          publishingImpact,
          cannibalizationTargets,
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
          alerts: snapshot.alerts ?? [],
          dailyClicks: snapshot.dailyClicks ?? [],
          publishingImpact: snapshot.publishingImpact ?? undefined,
          cannibalizationTargets: snapshot.cannibalizationTargets ?? [],
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

        {data.alerts.length > 0 && <InsightAlerts alerts={data.alerts} />}

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

        {data.dailyClicks.length > 0 && (
          <Flex gap={3} wrap="wrap">
            <SparklineChart
              data={data.dailyClicks.map((d) => ({
                date: d.date,
                value: d.clicks,
              }))}
              label="Clicks"
              color="var(--card-focus-ring-color)"
            />
            <SparklineChart
              data={data.dailyClicks.map((d) => ({
                date: d.date,
                value: d.impressions,
              }))}
              label="Impressions"
              color="var(--card-badge-caution-bg-color)"
            />
          </Flex>
        )}

        {data.publishingImpact && (
          <PublishingImpactSection impact={data.publishingImpact} />
        )}

        {data.quickWinQueries.length > 0 && (
          <QuickWinsSection queries={data.quickWinQueries} />
        )}

        {data.cannibalizationTargets.length > 0 && (
          <CannibalizationNotice targets={data.cannibalizationTargets} />
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
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "var(--font-size-1)",
        }}
      >
        <thead>
          <tr
            style={{
              borderBottom: "1px solid var(--card-border-color)",
            }}
          >
            <th
              style={{
                textAlign: "left",
                padding: "4px 0",
                fontWeight: 600,
                fontSize: "var(--font-size-0)",
                color: "var(--card-muted-fg-color)",
              }}
            >
              Query
            </th>
            {["Clicks", "Impr.", "CTR", "Pos."].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "right",
                  padding: "4px 0 4px 8px",
                  fontWeight: 600,
                  fontSize: "var(--font-size-0)",
                  color: "var(--card-muted-fg-color)",
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {queries.slice(0, 10).map((q, i) => (
            <tr key={i}>
              <td
                style={{
                  padding: "6px 8px 6px 0",
                  maxWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {q.query}
              </td>
              <td style={{ textAlign: "right", padding: "6px 0 6px 8px" }}>
                {q.clicks.toLocaleString()}
              </td>
              <td
                style={{
                  textAlign: "right",
                  padding: "6px 0 6px 8px",
                  color: "var(--card-muted-fg-color)",
                }}
              >
                {q.impressions.toLocaleString()}
              </td>
              <td
                style={{
                  textAlign: "right",
                  padding: "6px 0 6px 8px",
                  color: "var(--card-muted-fg-color)",
                }}
              >
                {q.impressions > 0
                  ? `${((q.clicks / q.impressions) * 100).toFixed(1)}%`
                  : "-"}
              </td>
              <td style={{ textAlign: "right", padding: "6px 0 6px 8px" }}>
                <PositionText position={q.position} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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

// --- Cannibalization Notice ---

function CannibalizationNotice({
  targets,
}: {
  targets: CannibalizationTarget[];
}) {
  return (
    <Card padding={3} radius={2} tone="caution" border>
      <Stack space={3}>
        <Flex align="center" gap={2}>
          <WarningOutlineIcon />
          <Text size={1} weight="semibold">
            Cannibalization Warning
          </Text>
        </Flex>
        <Text size={0} muted>
          {targets.length} other page{targets.length > 1 ? "s" : ""} competing
          for the same queries.
        </Text>
        <Stack space={2}>
          {targets.slice(0, 5).map((t, i) => (
            <Card key={i} padding={2} radius={2} shadow={1}>
              <Stack space={1}>
                <Text
                  size={1}
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.competingPage}
                </Text>
                <Text size={0} muted>
                  Shared queries: {t.sharedQueries.slice(0, 3).join(", ")}
                  {t.sharedQueries.length > 3
                    ? ` +${t.sharedQueries.length - 3} more`
                    : ""}
                </Text>
              </Stack>
            </Card>
          ))}
        </Stack>
      </Stack>
    </Card>
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
