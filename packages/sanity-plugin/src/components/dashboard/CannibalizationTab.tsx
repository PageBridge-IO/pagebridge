import { Card, Stack, Text, Badge, Box, Flex } from "@sanity/ui";

interface CannibalizationPage {
  page: string;
  documentId?: string;
  clicks: number;
  impressions: number;
  position: number;
}

interface CannibalizationGroup {
  query: string;
  pages: CannibalizationPage[];
}

interface CannibalizationTabProps {
  groups: CannibalizationGroup[];
}

export function CannibalizationTab({ groups }: CannibalizationTabProps) {
  if (groups.length === 0) {
    return (
      <Card padding={5} tone="positive" radius={2}>
        <Text align="center">
          No query cannibalization detected!
        </Text>
      </Card>
    );
  }

  return (
    <Stack space={3}>
      <Text size={0} muted>
        {groups.length} queries where multiple pages compete for the same
        ranking
      </Text>
      {groups.slice(0, 30).map((group, i) => (
        <Card key={i} padding={3} radius={2} shadow={1}>
          <Stack space={3}>
            <Flex align="center" gap={2}>
              <Badge tone="caution">{group.pages.length} pages</Badge>
              <Text size={1} weight="semibold">
                &quot;{group.query}&quot;
              </Text>
            </Flex>
            <Box>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "var(--font-size-0)",
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
                        color: "var(--card-muted-fg-color)",
                      }}
                    >
                      Page
                    </th>
                    {["Clicks", "Impr.", "Pos."].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "right",
                          padding: "4px 0 4px 8px",
                          fontWeight: 600,
                          color: "var(--card-muted-fg-color)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.pages.map((page, j) => (
                    <tr key={j}>
                      <td
                        style={{
                          padding: "4px 8px 4px 0",
                          maxWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {page.page}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          padding: "4px 0 4px 8px",
                        }}
                      >
                        {page.clicks.toLocaleString()}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          padding: "4px 0 4px 8px",
                          color: "var(--card-muted-fg-color)",
                        }}
                      >
                        {page.impressions.toLocaleString()}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          padding: "4px 0 4px 8px",
                        }}
                      >
                        <Badge
                          tone={
                            page.position <= 3
                              ? "positive"
                              : page.position <= 10
                                ? "caution"
                                : "critical"
                          }
                          fontSize={0}
                        >
                          {page.position.toFixed(1)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          </Stack>
        </Card>
      ))}
      {groups.length > 30 && (
        <Text size={0} muted>
          Showing 30 of {groups.length} cannibalization groups
        </Text>
      )}
    </Stack>
  );
}
