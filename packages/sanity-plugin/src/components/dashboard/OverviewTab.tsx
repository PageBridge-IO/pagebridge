import { Card, Stack, Text, Box } from "@sanity/ui";

interface PageEntry {
  page: string;
  documentId?: string;
  documentTitle?: string;
  clicks?: number;
  impressions?: number;
  position?: number;
}

interface OverviewTabProps {
  topPerformers: PageEntry[];
  zeroClickPages: PageEntry[];
  orphanPages: PageEntry[];
}

export function OverviewTab({
  topPerformers,
  zeroClickPages,
  orphanPages,
}: OverviewTabProps) {
  return (
    <Stack space={5}>
      <DataTable
        title="Top Performers"
        subtitle="Pages driving the most clicks (last 28 days)"
        entries={topPerformers}
        columns={["clicks", "impressions", "position"]}
      />

      {zeroClickPages.length > 0 && (
        <DataTable
          title="Zero-Click Pages"
          subtitle="High impressions but almost no clicks — titles/descriptions may need work"
          entries={zeroClickPages}
          columns={["impressions", "clicks", "position"]}
          tone="caution"
        />
      )}

      {orphanPages.length > 0 && (
        <Card padding={3} radius={2} tone="critical" border>
          <Stack space={3}>
            <Text size={1} weight="semibold">
              Orphan Pages ({orphanPages.length})
            </Text>
            <Text size={0} muted>
              Pages with no impressions in the last 28 days
            </Text>
            <Stack space={1}>
              {orphanPages.slice(0, 20).map((p, i) => (
                <Text key={i} size={1}>
                  {p.documentTitle || p.page}
                </Text>
              ))}
              {orphanPages.length > 20 && (
                <Text size={0} muted>
                  +{orphanPages.length - 20} more
                </Text>
              )}
            </Stack>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

function DataTable({
  title,
  subtitle,
  entries,
  columns,
  tone,
}: {
  title: string;
  subtitle: string;
  entries: PageEntry[];
  columns: ("clicks" | "impressions" | "position")[];
  tone?: "caution" | "critical";
}) {
  if (entries.length === 0) return null;

  const columnHeaders: Record<string, string> = {
    clicks: "Clicks",
    impressions: "Impr.",
    position: "Pos.",
  };

  return (
    <Card padding={3} radius={2} border tone={tone}>
      <Stack space={3}>
        <Text size={1} weight="semibold">
          {title}
        </Text>
        <Text size={0} muted>
          {subtitle}
        </Text>
        <Box>
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
                  Page
                </th>
                {columns.map((col) => (
                  <th
                    key={col}
                    style={{
                      textAlign: "right",
                      padding: "4px 0 4px 8px",
                      fontWeight: 600,
                      fontSize: "var(--font-size-0)",
                      color: "var(--card-muted-fg-color)",
                    }}
                  >
                    {columnHeaders[col]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.slice(0, 20).map((entry, i) => (
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
                    {entry.documentTitle || entry.page}
                  </td>
                  {columns.map((col) => (
                    <td
                      key={col}
                      style={{
                        textAlign: "right",
                        padding: "6px 0 6px 8px",
                      }}
                    >
                      {col === "position"
                        ? (entry[col]?.toFixed(1) ?? "-")
                        : (entry[col]?.toLocaleString() ?? "-")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      </Stack>
    </Card>
  );
}
