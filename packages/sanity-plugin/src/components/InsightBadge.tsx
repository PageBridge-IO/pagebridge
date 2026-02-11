import { useEffect, useState } from "react";
import { useClient } from "sanity";
import type { DocumentBadgeComponent } from "sanity";

interface Alert {
  type: string;
  severity: "low" | "medium" | "high";
  message: string;
}

const severityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };

const badgeLabels: Record<string, string> = {
  ctr_anomaly: "CTR Issue",
  quick_win_available: "Quick Win",
  position_decay: "Decaying",
  stale_content: "Stale",
  cannibalization: "Cannibalization",
};

const severityColors: Record<string, "danger" | "warning" | "primary"> = {
  high: "danger",
  medium: "warning",
  low: "primary",
};

export const InsightBadge: DocumentBadgeComponent = (props) => {
  const client = useClient({ apiVersion: "2024-01-01" });
  const [topAlert, setTopAlert] = useState<Alert | null>(null);
  const documentId = props.published?._id as string | undefined;

  useEffect(() => {
    if (!documentId) return;

    client
      .fetch<{ alerts: Alert[] } | null>(
        `*[_type == "gscSnapshot" && linkedDocument._ref == $id && period == "last28"][0]{ alerts }`,
        { id: documentId },
      )
      .then((result) => {
        const alerts = result?.alerts;
        if (!alerts || alerts.length === 0) {
          setTopAlert(null);
          return;
        }
        // Pick the highest-severity alert
        const sorted = [...alerts].sort(
          (a, b) => (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0),
        );
        setTopAlert(sorted[0] ?? null);
      });
  }, [documentId, client]);

  if (!topAlert) return null;

  return {
    label: badgeLabels[topAlert.type] ?? "Alert",
    title: topAlert.message,
    color: severityColors[topAlert.severity] ?? "primary",
  };
};
