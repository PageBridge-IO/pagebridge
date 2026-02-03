import { definePlugin } from "sanity";
import { gscSite } from "./schemas/gscSite.js";
import { gscSnapshot } from "./schemas/gscSnapshot.js";
import { gscRefreshTask } from "./schemas/gscRefreshTask.js";
import { RefreshQueueTool } from "./components/RefreshQueueTool.js";

export interface GscPluginConfig {
  contentTypes?: string[];
}

export const gscPlugin = definePlugin<GscPluginConfig | void>((config) => {
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
