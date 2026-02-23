import { useState } from "react";
import { Card, Stack, Text, Badge, Box, Flex } from "@sanity/ui";
import { BoltIcon, ChevronDownIcon, ChevronRightIcon } from "@sanity/icons";

interface QuickWinQueryDetail {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface QuickWinEntry {
  page: string;
  documentId?: string;
  documentTitle?: string;
  queryCount: number;
  impressions: number;
  position: number;
  queries?: QuickWinQueryDetail[];
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
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const toggleRow = (index: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

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
              Pages with queries at positions 8-20 — small content tweaks could
              push these to page 1. Click a row to see keywords.
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
                        width: "20px",
                      }}
                    />
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
                    {["Queries", "Impr.", "Avg Pos."].map((h) => (
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
                  {quickWins.slice(0, 20).map((entry, i) => {
                    const isExpanded = expandedRows.has(i);
                    const hasQueries =
                      entry.queries && entry.queries.length > 0;
                    return (
                      <>
                        <tr
                          key={i}
                          onClick={() => hasQueries && toggleRow(i)}
                          style={{
                            cursor: hasQueries ? "pointer" : "default",
                            borderBottom: isExpanded
                              ? "none"
                              : undefined,
                          }}
                        >
                          <td
                            style={{
                              padding: "6px 4px 6px 0",
                              color: "var(--card-muted-fg-color)",
                              width: "20px",
                            }}
                          >
                            {hasQueries &&
                              (isExpanded ? (
                                <ChevronDownIcon />
                              ) : (
                                <ChevronRightIcon />
                              ))}
                          </td>
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
                            {entry.queryCount}
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
                        {isExpanded && hasQueries && (
                          <tr key={`${i}-queries`}>
                            <td colSpan={5} style={{ padding: 0 }}>
                              <Box
                                paddingLeft={4}
                                paddingRight={2}
                                paddingBottom={3}
                                paddingTop={1}
                                style={{
                                  borderBottom:
                                    "1px solid var(--card-border-color)",
                                }}
                              >
                                <table
                                  style={{
                                    width: "100%",
                                    borderCollapse: "collapse",
                                    fontSize: "var(--font-size-0)",
                                  }}
                                >
                                  <thead>
                                    <tr>
                                      <th
                                        style={{
                                          textAlign: "left",
                                          padding: "2px 0",
                                          fontWeight: 600,
                                          color:
                                            "var(--card-muted-fg-color)",
                                        }}
                                      >
                                        Keyword
                                      </th>
                                      {["Clicks", "Impr.", "CTR", "Pos."].map(
                                        (h) => (
                                          <th
                                            key={h}
                                            style={{
                                              textAlign: "right",
                                              padding: "2px 0 2px 8px",
                                              fontWeight: 600,
                                              color:
                                                "var(--card-muted-fg-color)",
                                            }}
                                          >
                                            {h}
                                          </th>
                                        ),
                                      )}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {entry.queries!.map((q, qi) => (
                                      <tr key={qi}>
                                        <td
                                          style={{
                                            padding: "3px 8px 3px 0",
                                            maxWidth: 0,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                          }}
                                        >
                                          {q.query}
                                        </td>
                                        <td
                                          style={{
                                            textAlign: "right",
                                            padding: "3px 0 3px 8px",
                                            color:
                                              "var(--card-muted-fg-color)",
                                          }}
                                        >
                                          {q.clicks.toLocaleString()}
                                        </td>
                                        <td
                                          style={{
                                            textAlign: "right",
                                            padding: "3px 0 3px 8px",
                                            color:
                                              "var(--card-muted-fg-color)",
                                          }}
                                        >
                                          {q.impressions.toLocaleString()}
                                        </td>
                                        <td
                                          style={{
                                            textAlign: "right",
                                            padding: "3px 0 3px 8px",
                                            color:
                                              "var(--card-muted-fg-color)",
                                          }}
                                        >
                                          {(q.ctr * 100).toFixed(1)}%
                                        </td>
                                        <td
                                          style={{
                                            textAlign: "right",
                                            padding: "3px 0 3px 8px",
                                          }}
                                        >
                                          <Badge
                                            tone="primary"
                                            fontSize={0}
                                          >
                                            {q.position.toFixed(1)}
                                          </Badge>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </Box>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
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
