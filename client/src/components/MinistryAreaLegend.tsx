import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CALLING_COLORS, MAP_AREA_COLORS, type CallingType } from "@shared/schema";

export function MinistryAreaLegend() {
  const legendItems: { label: string; color: string; type: CallingType | 'primary' }[] = [
    { label: "Primary Ministry Area", color: MAP_AREA_COLORS.primaryMinistryArea, type: "primary" },
    { label: "People", color: CALLING_COLORS.people, type: "people" },
    { label: "Problem", color: CALLING_COLORS.problem, type: "problem" },
    { label: "Purpose", color: CALLING_COLORS.purpose, type: "purpose" },
  ];

  return (
    <Card className="shadow-sm" data-testid="card-ministry-legend">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Ministry Area Types</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {legendItems.map((item) => (
          <div
            key={item.type}
            className="flex items-center gap-2"
            data-testid={`legend-item-${item.type}`}
          >
            <div
              className="w-4 h-4 rounded border border-border"
              style={{ backgroundColor: item.color }}
              data-testid={`legend-color-${item.type}`}
            />
            <span className="text-sm text-foreground">{item.label}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
