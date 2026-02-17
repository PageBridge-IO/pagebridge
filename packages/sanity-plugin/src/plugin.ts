import { lazy, Suspense, createElement } from "react";
import { definePlugin } from "sanity";
import type {
  DefaultDocumentNodeResolver,
  StructureBuilder,
} from "sanity/structure";
import { ChartUpwardIcon, EarthGlobeIcon } from "@sanity/icons";
import { gscSite } from "./schemas/gscSite";
import { createGscSnapshot } from "./schemas/gscSnapshot";
import { createGscRefreshTask } from "./schemas/gscRefreshTask";
import { createGscSiteInsight } from "./schemas/gscSiteInsight";
import { InsightBadge } from "./components/InsightBadge";

const LazyInsightsDashboardTool = lazy(() =>
  import("./components/InsightsDashboardTool").then((m) => ({
    default: m.InsightsDashboardTool,
  })),
);
const LazySearchPerformancePane = lazy(() =>
  import("./components/SearchPerformancePane").then((m) => ({
    default: m.SearchPerformancePane,
  })),
);

function SearchPerformancePaneWrapper(props: { documentId: string; schemaType?: string | { name: string } }) {
  return createElement(Suspense, { fallback: null }, createElement(LazySearchPerformancePane, props));
}

function InsightsDashboardToolWrapper(props: Record<string, never>) {
  return createElement(Suspense, { fallback: null }, createElement(LazyInsightsDashboardTool, props));
}

export interface PageBridgePluginConfig {
  /**
   * Array of Sanity document type names that represent your content.
   * These will be available for linking in gscSnapshot and gscRefreshTask schemas.
   * Example: ['post', 'article', 'page']
   */
  contentTypes?: string[];
}

/** Document type names registered by the PageBridge plugin */
export const PAGEBRIDGE_TYPES = [
  "gscSite",
  "gscSnapshot",
  "gscRefreshTask",
  "gscSiteInsight",
] as const;

/**
 * Creates a "PageBridge" folder list item for the desk structure.
 * Use with structureTool's `structure` option to group PageBridge
 * documents into a single folder and filter them from the default list.
 *
 * @example
 * ```ts
 * structureTool({
 *   structure: (S, context) =>
 *     S.list()
 *       .title("Content")
 *       .items([
 *         createPageBridgeStructure(S),
 *         S.divider(),
 *         ...S.documentTypeListItems().filter(
 *           (item) => !PAGEBRIDGE_TYPES.includes(item.getId() as any),
 *         ),
 *       ]),
 * })
 * ```
 */
export const createPageBridgeStructure = (S: StructureBuilder) =>
  S.listItem()
    .title("PageBridge")
    .icon(EarthGlobeIcon)
    .child(
      S.list()
        .title("PageBridge")
        .items([
          S.listItem()
            .title("GSC Sites")
            .schemaType("gscSite")
            .child(S.documentTypeList("gscSite").title("GSC Sites")),
          S.listItem()
            .title("Snapshots")
            .schemaType("gscSnapshot")
            .child(S.documentTypeList("gscSnapshot").title("Snapshots")),
          S.listItem()
            .title("Refresh Tasks")
            .schemaType("gscRefreshTask")
            .child(S.documentTypeList("gscRefreshTask").title("Refresh Tasks")),
          S.listItem()
            .title("Site Insights")
            .schemaType("gscSiteInsight")
            .child(
              S.documentTypeList("gscSiteInsight").title("Site Insights"),
            ),
        ]),
    );

/**
 * Creates a structure resolver that adds the Performance view to content types
 * Use this with structureTool's defaultDocumentNode option
 */
export const createPageBridgeStructureResolver = (
  contentTypes: string[] = [],
): DefaultDocumentNodeResolver => {
  return (S, { schemaType }) => {
    if (contentTypes.includes(schemaType)) {
      return S.document().views([
        S.view.form(),
        S.view
          .component(SearchPerformancePaneWrapper)
          .title("Performance")
          .icon(ChartUpwardIcon),
      ]);
    }
    return S.document().views([S.view.form()]);
  };
};

export const pageBridgePlugin = definePlugin<PageBridgePluginConfig | void>((config) => {
  const contentTypes = config?.contentTypes ?? [];

  const gscSnapshot = createGscSnapshot({ contentTypes });
  const gscRefreshTask = createGscRefreshTask({ contentTypes });
  const gscSiteInsight = createGscSiteInsight({ contentTypes });

  return {
    name: "pagebridge-sanity",
    schema: {
      types: [gscSite, gscSnapshot, gscRefreshTask, gscSiteInsight],
    },
    document: {
      badges: (prev, context) => {
        if (contentTypes.length === 0) return prev;
        if (contentTypes.includes(context.schemaType)) {
          return [...prev, InsightBadge];
        }
        return prev;
      },
    },
    tools: [
      {
        name: "gsc-insights",
        title: "SEO Insights",
        component: InsightsDashboardToolWrapper,
      },
    ],
  };
});
