import { definePlugin } from "sanity";
import type { DefaultDocumentNodeResolver } from "sanity/structure";
import { ChartUpwardIcon } from "@sanity/icons";
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
