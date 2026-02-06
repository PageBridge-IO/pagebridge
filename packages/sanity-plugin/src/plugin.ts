import { definePlugin } from "sanity";
import type {
  DefaultDocumentNodeResolver,
  StructureBuilder,
} from "sanity/structure";
import { ChartUpwardIcon, EarthGlobeIcon } from "@sanity/icons";
import { gscSite } from "./schemas/gscSite";
import { createGscSnapshot } from "./schemas/gscSnapshot";
import { createGscRefreshTask } from "./schemas/gscRefreshTask";
import { RefreshQueueTool } from "./components/RefreshQueueTool";
import { SearchPerformancePane } from "./components/SearchPerformancePane";

export interface GscPluginConfig {
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
            .child(
              S.documentTypeList("gscRefreshTask").title("Refresh Tasks"),
            ),
        ]),
    );

/**
 * Creates a structure resolver that adds the Performance view to content types
 * Use this with structureTool's defaultDocumentNode option
 */
export const createGscStructureResolver = (
  contentTypes: string[] = [],
): DefaultDocumentNodeResolver => {
  return (S, { schemaType }) => {
    if (contentTypes.includes(schemaType)) {
      return S.document().views([
        S.view.form(),
        S.view
          .component(SearchPerformancePane)
          .title("Performance")
          .icon(ChartUpwardIcon),
      ]);
    }
    return S.document().views([S.view.form()]);
  };
};

export const gscPlugin = definePlugin<GscPluginConfig | void>((config) => {
  const contentTypes = config?.contentTypes ?? [];

  const gscSnapshot = createGscSnapshot({ contentTypes });
  const gscRefreshTask = createGscRefreshTask({ contentTypes });

  return {
    name: "pagebridge-sanity",
    schema: {
      types: [gscSite, gscSnapshot, gscRefreshTask],
    },
    tools: [
      {
        name: "gsc-refresh-queue",
        title: "Refresh Queue",
        component: RefreshQueueTool,
      },
    ],
  };
});
