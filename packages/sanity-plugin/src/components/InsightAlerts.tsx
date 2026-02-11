import { Card, Stack, Text, Flex, Badge } from "@sanity/ui";
import {
  WarningOutlineIcon,
  BoltIcon,
  TrendUpwardIcon,
  ErrorOutlineIcon,
  DocumentsIcon,
} from "@sanity/icons";
import type { ComponentType } from "react";

interface Alert {
  type: string;
  severity: "low" | "medium" | "high";
  message: string;
}

interface InsightAlertsProps {
  alerts: Alert[];
}

const alertConfig: Record<
  string,
  { icon: ComponentType; label: string }
> = {
  ctr_anomaly: { icon: WarningOutlineIcon, label: "CTR Anomaly" },
  quick_win_available: { icon: BoltIcon, label: "Quick Win" },
  position_decay: { icon: TrendUpwardIcon, label: "Decay" },
  stale_content: { icon: ErrorOutlineIcon, label: "Stale" },
  cannibalization: { icon: DocumentsIcon, label: "Cannibalization" },
};

const severityTone = {
  high: "critical" as const,
  medium: "caution" as const,
  low: "default" as const,
};

export function InsightAlerts({ alerts }: InsightAlertsProps) {
  if (!alerts || alerts.length === 0) return null;

  // Sort by severity (high first)
  const sorted = [...alerts].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.severity] - order[b.severity];
  });

  return (
    <Stack space={2}>
      {sorted.map((alert, i) => {
        const config = alertConfig[alert.type] ?? {
          icon: WarningOutlineIcon,
          label: alert.type,
        };
        const Icon = config.icon;
        const tone = severityTone[alert.severity];

        return (
          <Card key={i} padding={3} radius={2} tone={tone} border>
            <Flex align="center" gap={3}>
              <Icon />
              <Stack space={2} style={{ flex: 1 }}>
                <Flex align="center" gap={2}>
                  <Badge tone={tone} fontSize={0}>
                    {config.label}
                  </Badge>
                  <Badge tone={tone} fontSize={0}>
                    {alert.severity}
                  </Badge>
                </Flex>
                <Text size={1}>{alert.message}</Text>
              </Stack>
            </Flex>
          </Card>
        );
      })}
    </Stack>
  );
}
