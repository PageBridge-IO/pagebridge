import { Card, Stack, Text, Badge, Box, Flex } from "@sanity/ui";
import { BoltIcon } from "@sanity/icons";

interface QuickWinEntry {
  page: string;
  documentId?: string;
  documentTitle?: string;
  clicks: number;
  impressions: number;
  position: number;
}

interface NewKeyword {
  query: string;
  page: string;
  documentId?: string;
  impressions: number;
  position: number;
}

interface OpportunitiesTabProps {
  quickWins: QuickWinEntry[];
  newKeywords: NewKeyword[];
}

export function OpportunitiesTab({
  quickWins,
  newKeywords,
}: OpportunitiesTabProps) {
  return (
    <Stack space={5}>
      {quickWins.length > 0 && (
        <Card padding={3} radius={2} tone="positive" border>
          <Stack space={3}>
            <Flex align="center" gap={2}>
              <BoltIcon />
              <Text size={1} weight="semibold">
                Quick Wins — Site-Wide ({quickWins.length})
              </Text>
            </Flex>
            <Text size={0} muted>
              Queries at positions 8-20 with high impressions across all pages
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
                    {["Impr.", "Pos."].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "right",
                          padding: "4px 0 4px 8px",
                          fontWeight: 600,
                          fontSize: "var(--font-size-0)",
                          color: "var(--card-muted-fg-color)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {quickWins.slice(0, 20).map((entry, i) => (
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
                      <td
                        style={{
                          textAlign: "right",
                          padding: "6px 0 6px 8px",
                          color: "var(--card-muted-fg-color)",
                        }}
                      >
                        {entry.impressions.toLocaleString()}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          padding: "6px 0 6px 8px",
                        }}
                      >
                        <Badge tone="primary" fontSize={0}>
                          {entry.position.toFixed(1)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          </Stack>
        </Card>
      )}

      {newKeywords.length > 0 && (
        <Card padding={3} radius={2} border>
          <Stack space={3}>
            <Text size={1} weight="semibold">
              New Keywords ({newKeywords.length})
            </Text>
            <Text size={0} muted>
              Queries appearing in the last 7 days not seen previously
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
                      Query
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "4px 0 4px 8px",
                        fontWeight: 600,
                        fontSize: "var(--font-size-0)",
                        color: "var(--card-muted-fg-color)",
                      }}
                    >
                      Page
                    </th>
                    {["Impr.", "Pos."].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "right",
                          padding: "4px 0 4px 8px",
                          fontWeight: 600,
                          fontSize: "var(--font-size-0)",
                          color: "var(--card-muted-fg-color)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {newKeywords.slice(0, 30).map((entry, i) => (
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
                        {entry.query}
                      </td>
                      <td
                        style={{
                          padding: "6px 0 6px 8px",
                          maxWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          color: "var(--card-muted-fg-color)",
                        }}
                      >
                        {entry.page}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          padding: "6px 0 6px 8px",
                          color: "var(--card-muted-fg-color)",
                        }}
                      >
                        {entry.impressions.toLocaleString()}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          padding: "6px 0 6px 8px",
                        }}
                      >
                        <Badge
                          tone={
                            entry.position <= 10 ? "positive" : "caution"
                          }
                          fontSize={0}
                        >
                          {entry.position.toFixed(1)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          </Stack>
        </Card>
      )}

      {quickWins.length === 0 && newKeywords.length === 0 && (
        <Card padding={5} radius={2}>
          <Text align="center" muted>
            No opportunities detected yet. Run a sync to analyze your data.
          </Text>
        </Card>
      )}
    </Stack>
  );
}
