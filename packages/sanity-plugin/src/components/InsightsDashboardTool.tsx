import { useClient } from "sanity";
import { useEffect, useState } from "react";
import { SANITY_API_VERSION } from "../constants";
import {
  Card,
  Stack,
  Text,
  Button,
  Flex,
  Spinner,
  Select,
} from "@sanity/ui";
import { OverviewTab } from "./dashboard/OverviewTab";
import { RefreshQueueTab } from "./dashboard/RefreshQueueTab";
import { CannibalizationTab } from "./dashboard/CannibalizationTab";
import { OpportunitiesTab } from "./dashboard/OpportunitiesTab";

type TabId = "overview" | "refresh" | "cannibalization" | "opportunities";

interface SiteOption {
  _id: string;
  siteUrl: string;
}

interface PageEntry {
  page: string;
  documentId?: string;
  documentTitle?: string;
  clicks?: number;
  impressions?: number;
  position?: number;
}

interface QuickWinQueryEntry {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface QuickWinPageEntry {
  page: string;
  documentId?: string;
  documentTitle?: string;
  queryCount: number;
  totalImpressions: number;
  avgPosition: number;
  queries?: QuickWinQueryEntry[];
}

interface KeywordEntry {
  query: string;
  page: string;
  documentId?: string;
  impressions: number;
  position: number;
}

interface CannibalizationGroup {
  query: string;
  pages: { page: string; documentId?: string; clicks: number; impressions: number; position: number }[];
}

interface SiteInsightData {
  topPerformers: PageEntry[];
  zeroClickPages: PageEntry[];
  orphanPages: PageEntry[];
  quickWinPages: QuickWinPageEntry[];
  newKeywordOpportunities: KeywordEntry[];
  cannibalizationGroups: CannibalizationGroup[];
  lastComputedAt: string;
}

const tabs: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "refresh", label: "Refresh Queue" },
  { id: "cannibalization", label: "Cannibalization" },
  { id: "opportunities", label: "Opportunities" },
];

export function InsightsDashboardTool() {
  const client = useClient({ apiVersion: SANITY_API_VERSION });
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [insightData, setInsightData] = useState<SiteInsightData | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch available sites
  useEffect(() => {
    client
      .fetch<SiteOption[]>(
        `*[_type == "gscSite"]{ _id, siteUrl } | order(siteUrl asc)`,
      )
      .then((results) => {
        setSites(results);
        if (results.length > 0 && !selectedSiteId) {
          setSelectedSiteId(results[0]!._id);
        }
        setLoading(false);
      });
  }, [client, selectedSiteId]);

  // Fetch insight data for selected site
  useEffect(() => {
    if (!selectedSiteId) return;

    setLoading(true);
    client
      .fetch<SiteInsightData | null>(
        `*[_type == "gscSiteInsight" && site._ref == $siteId][0]{
          topPerformers,
          zeroClickPages,
          orphanPages,
          quickWinPages,
          newKeywordOpportunities,
          cannibalizationGroups,
          lastComputedAt
        }`,
        { siteId: selectedSiteId },
      )
      .then((result) => {
        // Apply safe defaults for partially-created documents
        setInsightData(result ? {
          topPerformers: result.topPerformers ?? [],
          zeroClickPages: result.zeroClickPages ?? [],
          orphanPages: result.orphanPages ?? [],
          quickWinPages: result.quickWinPages ?? [],
          newKeywordOpportunities: result.newKeywordOpportunities ?? [],
          cannibalizationGroups: result.cannibalizationGroups ?? [],
          lastComputedAt: result.lastComputedAt ?? "",
        } : null);
        setLoading(false);
      });
  }, [selectedSiteId, client]);

  if (loading && sites.length === 0) {
    return (
      <Card padding={4}>
        <Flex justify="center">
          <Spinner />
        </Flex>
      </Card>
    );
  }

  if (sites.length === 0) {
    return (
      <Card padding={4} tone="caution">
        <Text>
          No GSC sites configured. Create a gscSite document first.
        </Text>
      </Card>
    );
  }

  return (
    <Card padding={4}>
      <Stack space={4}>
        <Flex justify="space-between" align="center">
          <Text size={3} weight="semibold">
            SEO Insights
          </Text>
          {sites.length > 1 && (
            <Select
              value={selectedSiteId}
              onChange={(e) =>
                setSelectedSiteId(
                  (e.target as HTMLSelectElement).value,
                )
              }
              fontSize={1}
            >
              {sites.map((site) => (
                <option key={site._id} value={site._id}>
                  {site.siteUrl}
                </option>
              ))}
            </Select>
          )}
        </Flex>

        <Flex gap={2}>
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              mode={activeTab === tab.id ? "default" : "ghost"}
              text={tab.label}
              onClick={() => setActiveTab(tab.id)}
              fontSize={1}
            />
          ))}
        </Flex>

        {loading ? (
          <Card padding={4}>
            <Flex justify="center">
              <Spinner />
            </Flex>
          </Card>
        ) : (
          <TabContent
            tab={activeTab}
            data={insightData}
          />
        )}

        {insightData?.lastComputedAt && (
          <Text size={0} muted>
            Last computed:{" "}
            {new Date(insightData.lastComputedAt).toLocaleDateString()}
          </Text>
        )}
      </Stack>
    </Card>
  );
}

function TabContent({
  tab,
  data,
}: {
  tab: TabId;
  data: SiteInsightData | null;
}) {
  switch (tab) {
    case "overview":
      return (
        <OverviewTab
          topPerformers={data?.topPerformers ?? []}
          zeroClickPages={data?.zeroClickPages ?? []}
          orphanPages={data?.orphanPages ?? []}
        />
      );
    case "refresh":
      return <RefreshQueueTab />;
    case "cannibalization":
      return (
        <CannibalizationTab
          groups={data?.cannibalizationGroups ?? []}
        />
      );
    case "opportunities":
      return (
        <OpportunitiesTab
          quickWins={(data?.quickWinPages ?? []).map((p) => ({
            page: p.page,
            documentId: p.documentId,
            documentTitle: p.documentTitle,
            queryCount: p.queryCount,
            impressions: p.totalImpressions,
            position: p.avgPosition,
            queries: p.queries ?? [],
          }))}
          newKeywords={data?.newKeywordOpportunities ?? []}
        />
      );
    default:
      return null;
  }
}
