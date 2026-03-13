import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart } from "lucide-react";
import type { CallingType } from "@shared/schema";
import { CALLING_COLORS } from "@shared/schema";

interface Calling {
  id: string;
  name: string;
  type: string;
  description: string | null;
}

interface MinistryFocusSectionProps {
  churchName: string;
  callings: Calling[];
}

function getCallingTypeColor(type: string): string {
  return CALLING_COLORS[type as CallingType] || "#94a3b8";
}

export function MinistryFocusSection({ churchName, callings }: MinistryFocusSectionProps) {
  return (
    <section className="py-12 bg-muted/30" data-testid="section-ministry-focus">
      <div className="container max-w-4xl mx-auto px-4">
        <div className="text-center mb-8">
          <Badge className="mb-4" data-testid="badge-ministry-focus">
            <Heart className="w-3 h-3 mr-1" />
            Ministry Focus
          </Badge>
          <h2 className="text-2xl font-bold mb-2" data-testid="text-ministry-focus-title">
            {churchName}'s Missional Focus
          </h2>
          <p className="text-muted-foreground" data-testid="text-ministry-focus-description">
            Explore the ministry areas and callings that {churchName} is currently engaged in.
          </p>
        </div>

        {callings.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {callings.map((calling, index) => (
              <Card 
                key={calling.id}
                className="h-full"
                style={{ borderLeftWidth: '4px', borderLeftColor: getCallingTypeColor(calling.type) }}
                data-testid={`card-calling-${index}`}
              >
                <CardContent className="p-4">
                  <Badge 
                    variant="outline" 
                    className="mb-2"
                    style={{ 
                      borderColor: getCallingTypeColor(calling.type),
                      color: getCallingTypeColor(calling.type)
                    }}
                  >
                    {calling.type.charAt(0).toUpperCase() + calling.type.slice(1)}
                  </Badge>
                  <h3 className="font-semibold mb-1">{calling.name}</h3>
                  {calling.description && (
                    <p className="text-sm text-muted-foreground">{calling.description}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="text-center py-12">
            <CardContent>
              <Heart className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-muted-foreground" data-testid="text-no-callings">
                This church hasn't shared their ministry focus yet.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}
