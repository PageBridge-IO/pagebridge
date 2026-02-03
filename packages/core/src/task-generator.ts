import type { SanityClient } from "@sanity/client";
import type { DecaySignal } from "./decay-detector.js";
import type { MatchResult } from "./url-matcher.js";

export class TaskGenerator {
  constructor(private sanity: SanityClient) {}

  async createTasks(
    siteId: string,
    signals: DecaySignal[],
    matches: MatchResult[]
  ): Promise<number> {
    let created = 0;

    for (const signal of signals) {
      const match = matches.find((m) => m.gscUrl === signal.page);
      if (!match?.sanityId) continue;

      const existingTask = await this.sanity.fetch(
        `*[_type == "gscRefreshTask" && linkedDocument._ref == $docId && status in ["open", "in_progress"]][0]._id`,
        { docId: match.sanityId }
      );

      if (existingTask) continue;

      await this.sanity.create({
        _type: "gscRefreshTask",
        site: { _type: "reference", _ref: siteId },
        linkedDocument: { _type: "reference", _ref: match.sanityId },
        reason: signal.reason,
        severity: signal.severity,
        status: "open",
        metrics: {
          positionBefore: signal.metrics.positionBefore,
          positionNow: signal.metrics.positionNow,
          positionDelta: signal.metrics.positionDelta,
          ctrBefore: signal.metrics.ctrBefore,
          ctrNow: signal.metrics.ctrNow,
          impressions: signal.metrics.impressions,
        },
        createdAt: new Date().toISOString(),
      });

      created++;
    }

    return created;
  }

  async updateTaskStatus(
    taskId: string,
    status: "open" | "snoozed" | "in_progress" | "done" | "dismissed",
    options?: { snoozeDays?: number; notes?: string }
  ): Promise<void> {
    const patch: Record<string, unknown> = { status };

    if (status === "snoozed" && options?.snoozeDays) {
      const until = new Date();
      until.setDate(until.getDate() + options.snoozeDays);
      patch.snoozedUntil = until.toISOString();
    }

    if (status === "done" || status === "dismissed") {
      patch.resolvedAt = new Date().toISOString();
    }

    if (options?.notes) {
      patch.notes = options.notes;
    }

    await this.sanity.patch(taskId).set(patch).commit();
  }
}
