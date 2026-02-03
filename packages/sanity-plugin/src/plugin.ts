import { definePlugin } from "sanity";
import { gscSite } from "./schemas/gscSite";
import { createGscSnapshot } from "./schemas/gscSnapshot";
import { createGscRefreshTask } from "./schemas/gscRefreshTask";
import { RefreshQueueTool } from "./components/RefreshQueueTool";

export interface GscPluginConfig {
  /**
   * Array of Sanity document type names that represent your content.
   * These will be available for linking in gscSnapshot and gscRefreshTask schemas.
   * Example: ['post', 'article', 'page']
   */
  contentTypes?: string[];
}

export const gscPlugin = definePlugin<GscPluginConfig | void>((config) => {
  const contentTypes = config?.contentTypes ?? [];

  const gscSnapshot = createGscSnapshot({ contentTypes });
  const gscRefreshTask = createGscRefreshTask({ contentTypes });

  return {
    name: "gsc-sanity-plugin",
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
