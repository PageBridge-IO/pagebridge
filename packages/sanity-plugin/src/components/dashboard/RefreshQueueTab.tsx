import { useClient } from "sanity";
import {
  Card,
  Stack,
  Text,
  Button,
  Flex,
  Badge,
  Menu,
  MenuButton,
  MenuItem,
  type BadgeTone,
} from "@sanity/ui";
import {
  EllipsisVerticalIcon,
  CheckmarkIcon,
  ClockIcon,
  CloseIcon,
} from "@sanity/icons";
import { useEffect, useState, useCallback } from "react";

interface RefreshTask {
  _id: string;
  reason: "position_decay" | "low_ctr" | "impressions_drop" | "manual";
  severity: "low" | "medium" | "high";
  status: string;
  snoozedUntil?: string;
  metrics?: {
    positionBefore?: number;
    positionNow?: number;
    positionDelta?: number;
  };
  documentTitle?: string;
  documentSlug?: string;
  documentUpdatedAt?: string;
  createdAt: string;
}

type FilterType = "open" | "snoozed" | "all";

const severityTone: Record<string, BadgeTone> = {
  high: "critical",
  medium: "caution",
  low: "default",
};

const reasonLabels: Record<string, string> = {
  position_decay: "Position Drop",
  low_ctr: "Low CTR",
  impressions_drop: "Traffic Drop",
  manual: "Manual",
};

export function RefreshQueueTab() {
  const client = useClient({ apiVersion: "2024-01-01" });
  const [tasks, setTasks] = useState<RefreshTask[]>([]);
  const [filter, setFilter] = useState<FilterType>("open");

  const fetchTasks = useCallback(async () => {
    const query =
      filter === "all"
        ? `*[_type == "gscRefreshTask" && status != "done" && status != "dismissed"]`
        : `*[_type == "gscRefreshTask" && status == $status]`;

    const results = await client.fetch<RefreshTask[]>(
      `${query} | order(severity desc, createdAt desc) {
        _id,
        reason,
        severity,
        status,
        snoozedUntil,
        metrics,
        "documentTitle": linkedDocument->title,
        "documentSlug": linkedDocument->slug.current,
        "documentUpdatedAt": linkedDocument->_updatedAt,
        createdAt
      }`,
      { status: filter },
    );
    setTasks(results);
  }, [filter, client]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const updateStatus = async (
    taskId: string,
    status: string,
    snoozeDays?: number,
  ) => {
    const patch: Record<string, unknown> = { status };

    if (status === "snoozed" && snoozeDays) {
      const until = new Date();
      until.setDate(until.getDate() + snoozeDays);
      patch.snoozedUntil = until.toISOString();
    }

    if (status === "done") {
      patch.resolvedAt = new Date().toISOString();
    }

    await client.patch(taskId).set(patch).commit();
    setTasks((prev) =>
      prev.filter((t) => t._id !== taskId || status === filter),
    );
  };

  return (
    <Stack space={4}>
      <Flex gap={2}>
        {(["open", "snoozed", "all"] as const).map((f) => (
          <Button
            key={f}
            mode={filter === f ? "default" : "ghost"}
            text={f.charAt(0).toUpperCase() + f.slice(1)}
            onClick={() => setFilter(f)}
            fontSize={1}
          />
        ))}
      </Flex>

      {tasks.length === 0 ? (
        <Card padding={5} tone="positive" radius={2}>
          <Text align="center">No pending refresh tasks!</Text>
        </Card>
      ) : (
        <Stack space={2}>
          {tasks.map((task) => (
            <Card key={task._id} padding={3} radius={2} shadow={1}>
              <Flex justify="space-between" align="flex-start">
                <Stack space={2} style={{ flex: 1 }}>
                  <Flex gap={2} align="center">
                    <Badge tone={severityTone[task.severity]}>
                      {task.severity}
                    </Badge>
                    <Badge>{reasonLabels[task.reason]}</Badge>
                  </Flex>
                  <Text weight="semibold">
                    {task.documentTitle || "Untitled"}
                  </Text>
                  <Text size={1} muted>
                    /{task.documentSlug}
                  </Text>
                  {task.metrics && (
                    <Text size={1} muted>
                      Position: {task.metrics.positionBefore?.toFixed(1)} →{" "}
                      {task.metrics.positionNow?.toFixed(1)} (
                      {(task.metrics.positionDelta ?? 0) > 0 ? "+" : ""}
                      {task.metrics.positionDelta?.toFixed(1)})
                    </Text>
                  )}
                  {task.documentUpdatedAt && (
                    <Text size={0} muted>
                      Last edited:{" "}
                      {daysSince(new Date(task.documentUpdatedAt))} days ago
                    </Text>
                  )}
                </Stack>
                <MenuButton
                  button={<Button icon={EllipsisVerticalIcon} mode="ghost" />}
                  id={`menu-${task._id}`}
                  menu={
                    <Menu>
                      <MenuItem
                        icon={CheckmarkIcon}
                        text="Mark as Done"
                        onClick={() => updateStatus(task._id, "done")}
                      />
                      <MenuItem
                        icon={ClockIcon}
                        text="Snooze 7 days"
                        onClick={() => updateStatus(task._id, "snoozed", 7)}
                      />
                      <MenuItem
                        icon={ClockIcon}
                        text="Snooze 30 days"
                        onClick={() => updateStatus(task._id, "snoozed", 30)}
                      />
                      <MenuItem
                        icon={CloseIcon}
                        text="Dismiss"
                        tone="critical"
                        onClick={() => updateStatus(task._id, "dismissed")}
                      />
                    </Menu>
                  }
                />
              </Flex>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function daysSince(date: Date): number {
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}
