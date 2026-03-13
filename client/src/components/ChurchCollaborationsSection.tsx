import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import { Link } from "wouter";
import { 
  Handshake, MapPin, Users, Target, ArrowRight, 
  Check, X, Clock, Pause, Play, ExternalLink, 
  Sparkles, Map, ChevronRight, AlertCircle, Layers
} from "lucide-react";
import { useState } from "react";

interface CollaborationOpportunity {
  partner_id: string;
  partner_name: string;
  partner_city: string | null;
  partner_profile_photo_url: string | null;
  area_overlap_pct: number;
  shared_callings_count: number;
  collab_matches_count: number;
  distance_miles: number | null;
  total_score: number;
  score_breakdown: {
    area_overlap: number;
    callings: number;
    have_need: number;
    distance: number;
  };
}

interface ActiveCollaboration {
  id: string;
  partner_id: string;
  partner_name: string;
  partner_city: string | null;
  partner_profile_photo_url: string | null;
  status: 'pending' | 'active' | 'paused' | 'ended';
  description: string | null;
  created_at: string;
  started_at: string | null;
  initiated_by_me: boolean;
}

interface CollaborationsData {
  opportunities: CollaborationOpportunity[];
  activeCollaborations: ActiveCollaboration[];
  pendingCollaborations: ActiveCollaboration[];
  metadata: {
    totalOpportunities: number;
    totalActive: number;
    totalPending: number;
  };
}

interface ChurchCollaborationsSectionProps {
  churchId: string;
  churchName: string;
  hasMinistryArea: boolean;
  collaborationHave: string[];
  collaborationNeed: string[];
  onNavigateToMinistryAreas?: () => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getMatchStrength(score: number): { label: string; color: string } {
  if (score >= 60) return { label: "Strong Match", color: "text-emerald-600" };
  if (score >= 40) return { label: "Good Match", color: "text-blue-600" };
  if (score >= 20) return { label: "Moderate Match", color: "text-amber-600" };
  return { label: "Potential Match", color: "text-muted-foreground" };
}

function ScoreBreakdown({ breakdown, total }: { breakdown: CollaborationOpportunity['score_breakdown']; total: number }) {
  const factors = [
    { key: 'area_overlap', label: 'Area Overlap', value: breakdown.area_overlap, icon: Layers, color: 'bg-blue-500' },
    { key: 'callings', label: 'Shared Callings', value: breakdown.callings, icon: Target, color: 'bg-purple-500' },
    { key: 'have_need', label: 'Have/Need Match', value: breakdown.have_need, icon: Handshake, color: 'bg-emerald-500' },
    { key: 'distance', label: 'Proximity', value: breakdown.distance, icon: MapPin, color: 'bg-amber-500' },
  ];

  return (
    <div className="space-y-2 mt-3 pt-3 border-t">
      <p className="text-xs font-medium text-muted-foreground">Match Breakdown</p>
      {factors.map((factor) => (
        <div key={factor.key} className="flex items-center gap-2">
          <factor.icon className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground flex-1">{factor.label}</span>
          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
            <div 
              className={`h-full ${factor.color} rounded-full`} 
              style={{ width: `${Math.min(factor.value * 2.5, 100)}%` }} 
            />
          </div>
          <span className="text-xs font-medium w-6 text-right">{factor.value.toFixed(0)}</span>
        </div>
      ))}
    </div>
  );
}

function OpportunityCard({ 
  opportunity, 
  churchId, 
  onStartCollaboration 
}: { 
  opportunity: CollaborationOpportunity; 
  churchId: string;
  onStartCollaboration: (partnerId: string, partnerName: string) => void;
}) {
  const { getChurchUrl } = usePlatformNavigation();
  const [showBreakdown, setShowBreakdown] = useState(false);
  const matchStrength = getMatchStrength(opportunity.total_score);

  return (
    <Card className="hover-elevate" data-testid={`card-opportunity-${opportunity.partner_id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarImage src={opportunity.partner_profile_photo_url || undefined} />
            <AvatarFallback className="text-xs bg-muted">
              {getInitials(opportunity.partner_name)}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link 
                  href={getChurchUrl(opportunity.partner_id)}
                  className="font-medium text-sm hover:underline truncate block"
                  data-testid={`link-opportunity-church-${opportunity.partner_id}`}
                >
                  {opportunity.partner_name}
                </Link>
                {opportunity.partner_city && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {opportunity.partner_city}
                    {opportunity.distance_miles !== null && (
                      <span className="ml-1">({opportunity.distance_miles.toFixed(1)} mi)</span>
                    )}
                  </p>
                )}
              </div>
              
              <div className="text-right flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-medium ${matchStrength.color}`}>
                    {opportunity.total_score.toFixed(0)}%
                  </span>
                  <Badge variant="outline" className="text-xs px-1.5 py-0">
                    {matchStrength.label}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 mt-2">
              {opportunity.area_overlap_pct > 0 && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <Layers className="w-3 h-3" />
                  {opportunity.area_overlap_pct.toFixed(0)}% overlap
                </Badge>
              )}
              {opportunity.shared_callings_count > 0 && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <Target className="w-3 h-3" />
                  {opportunity.shared_callings_count} shared calling{opportunity.shared_callings_count > 1 ? 's' : ''}
                </Badge>
              )}
              {opportunity.collab_matches_count > 0 && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <Handshake className="w-3 h-3" />
                  {opportunity.collab_matches_count} have/need match{opportunity.collab_matches_count > 1 ? 'es' : ''}
                </Badge>
              )}
            </div>

            {showBreakdown && (
              <ScoreBreakdown breakdown={opportunity.score_breakdown} total={opportunity.total_score} />
            )}

            <div className="flex items-center gap-2 mt-3">
              <Button
                size="sm"
                onClick={() => onStartCollaboration(opportunity.partner_id, opportunity.partner_name)}
                data-testid={`button-start-collab-${opportunity.partner_id}`}
              >
                <Handshake className="w-3 h-3 mr-1" />
                Connect
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowBreakdown(!showBreakdown)}
                data-testid={`button-toggle-breakdown-${opportunity.partner_id}`}
              >
                {showBreakdown ? 'Hide Details' : 'Show Details'}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActiveCollaborationCard({ 
  collaboration,
  isOwnChurch,
  onUpdateStatus
}: { 
  collaboration: ActiveCollaboration;
  isOwnChurch: boolean;
  onUpdateStatus: (id: string, status: string) => void;
}) {
  const { getChurchUrl } = usePlatformNavigation();

  const statusColors = {
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    paused: "bg-muted text-muted-foreground",
    ended: "bg-muted text-muted-foreground"
  };

  const statusIcons = {
    pending: Clock,
    active: Check,
    paused: Pause,
    ended: X
  };

  const StatusIcon = statusIcons[collaboration.status];

  return (
    <Card data-testid={`card-collaboration-${collaboration.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarImage src={collaboration.partner_profile_photo_url || undefined} />
            <AvatarFallback className="text-xs bg-muted">
              {getInitials(collaboration.partner_name)}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link 
                  href={getChurchUrl(collaboration.partner_id)}
                  className="font-medium text-sm hover:underline truncate block"
                >
                  {collaboration.partner_name}
                </Link>
                {collaboration.partner_city && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {collaboration.partner_city}
                  </p>
                )}
              </div>
              
              <Badge className={`text-xs gap-1 ${statusColors[collaboration.status]}`}>
                <StatusIcon className="w-3 h-3" />
                {collaboration.status.charAt(0).toUpperCase() + collaboration.status.slice(1)}
              </Badge>
            </div>

            {collaboration.description && (
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                {collaboration.description}
              </p>
            )}

            {collaboration.status === 'pending' && !collaboration.initiated_by_me && isOwnChurch && (
              <div className="flex items-center gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={() => onUpdateStatus(collaboration.id, 'active')}
                  data-testid={`button-accept-collab-${collaboration.id}`}
                >
                  <Check className="w-3 h-3 mr-1" />
                  Accept
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onUpdateStatus(collaboration.id, 'ended')}
                  data-testid={`button-decline-collab-${collaboration.id}`}
                >
                  <X className="w-3 h-3 mr-1" />
                  Decline
                </Button>
              </div>
            )}

            {collaboration.status === 'pending' && collaboration.initiated_by_me && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Waiting for response...
              </p>
            )}

            {collaboration.status === 'active' && isOwnChurch && (
              <div className="flex items-center gap-2 mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onUpdateStatus(collaboration.id, 'paused')}
                  data-testid={`button-pause-collab-${collaboration.id}`}
                >
                  <Pause className="w-3 h-3 mr-1" />
                  Pause
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onUpdateStatus(collaboration.id, 'ended')}
                  data-testid={`button-end-collab-${collaboration.id}`}
                >
                  <X className="w-3 h-3 mr-1" />
                  End
                </Button>
              </div>
            )}

            {collaboration.status === 'paused' && isOwnChurch && (
              <Button
                size="sm"
                onClick={() => onUpdateStatus(collaboration.id, 'active')}
                className="mt-3"
                data-testid={`button-resume-collab-${collaboration.id}`}
              >
                <Play className="w-3 h-3 mr-1" />
                Resume
              </Button>
            )}

            <p className="text-xs text-muted-foreground mt-2">
              {collaboration.started_at 
                ? `Active since ${new Date(collaboration.started_at).toLocaleDateString()}`
                : `Requested ${new Date(collaboration.created_at).toLocaleDateString()}`
              }
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ChurchCollaborationsSection({
  churchId,
  churchName,
  hasMinistryArea,
  collaborationHave,
  collaborationNeed,
  onNavigateToMinistryAreas
}: ChurchCollaborationsSectionProps) {
  const { toast } = useToast();
  const [startCollabDialog, setStartCollabDialog] = useState<{ partnerId: string; partnerName: string } | null>(null);
  const [collabDescription, setCollabDescription] = useState("");

  const { data, isLoading, error } = useQuery<CollaborationsData>({
    queryKey: ['/api/churches/collaboration-opportunities', churchId],
    queryFn: () => fetch(`/api/churches/collaboration-opportunities?churchId=${churchId}`).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }),
    enabled: !!churchId,
    staleTime: 2 * 60 * 1000,
  });

  const startCollaborationMutation = useMutation({
    mutationFn: async ({ partnerId, description }: { partnerId: string; description: string }) => {
      return apiRequest("POST", "/api/churches/collaboration-opportunities", {
        churchId,
        partnerId,
        description: description || null
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/churches/collaboration-opportunities', churchId] });
      setStartCollabDialog(null);
      setCollabDescription("");
      toast({
        title: "Collaboration request sent",
        description: "The church will be notified of your interest in collaborating.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send collaboration request",
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ collaborationId, status }: { collaborationId: string; status: string }) => {
      return apiRequest("PATCH", "/api/churches/collaboration-opportunities", {
        collaborationId,
        status
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/churches/collaboration-opportunities', churchId] });
      toast({
        title: "Collaboration updated",
        description: "The collaboration status has been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update collaboration",
        variant: "destructive",
      });
    },
  });

  const handleStartCollaboration = (partnerId: string, partnerName: string) => {
    setStartCollabDialog({ partnerId, partnerName });
  };

  const handleConfirmCollaboration = () => {
    if (!startCollabDialog) return;
    startCollaborationMutation.mutate({
      partnerId: startCollabDialog.partnerId,
      description: collabDescription
    });
  };

  const handleUpdateStatus = (collaborationId: string, status: string) => {
    updateStatusMutation.mutate({ collaborationId, status });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const opportunities = data?.opportunities || [];
  const activeCollaborations = data?.activeCollaborations || [];
  const pendingCollaborations = data?.pendingCollaborations || [];

  const hasCollabTags = collaborationHave.length > 0 || collaborationNeed.length > 0;

  return (
    <div className="space-y-6">
      {/* What We Have / Need Section */}
      {hasCollabTags && (
        <div className="space-y-4">
          {collaborationHave.length > 0 && (
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                What We Offer
              </h4>
              <div className="flex flex-wrap gap-2">
                {collaborationHave.map((item, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {collaborationNeed.length > 0 && (
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                What We Need
              </h4>
              <div className="flex flex-wrap gap-2">
                {collaborationNeed.map((item, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          <Separator />
        </div>
      )}

      {/* Active Collaborations */}
      {(activeCollaborations.length > 0 || pendingCollaborations.length > 0) && (
        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <Handshake className="w-4 h-4 text-primary" />
            Active Collaborations
            <Badge variant="secondary" className="ml-auto">
              {activeCollaborations.length + pendingCollaborations.length}
            </Badge>
          </h4>
          
          {pendingCollaborations.map((collab) => (
            <ActiveCollaborationCard 
              key={collab.id} 
              collaboration={collab}
              isOwnChurch={true}
              onUpdateStatus={handleUpdateStatus}
            />
          ))}
          
          {activeCollaborations.map((collab) => (
            <ActiveCollaborationCard 
              key={collab.id} 
              collaboration={collab}
              isOwnChurch={true}
              onUpdateStatus={handleUpdateStatus}
            />
          ))}
        </div>
      )}

      {/* Collaboration Opportunities */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Collaboration Opportunities
          </h4>
          {onNavigateToMinistryAreas && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onNavigateToMinistryAreas}
              className="text-xs gap-1"
              data-testid="button-view-on-map"
            >
              <Map className="w-3 h-3" />
              View on Map
              <ChevronRight className="w-3 h-3" />
            </Button>
          )}
        </div>

        {!hasMinistryArea && (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
              <p className="text-sm font-medium">No Ministry Area Defined</p>
              <p className="text-xs text-muted-foreground mt-1 mb-3">
                Draw a ministry area to unlock location-based collaboration matching
              </p>
              {onNavigateToMinistryAreas && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={onNavigateToMinistryAreas}
                  data-testid="button-draw-ministry-area"
                >
                  <Map className="w-3 h-3 mr-1" />
                  Go to Ministry Areas
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {opportunities.length === 0 && hasMinistryArea && (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center">
              <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
              <p className="text-sm font-medium">No Opportunities Found</p>
              <p className="text-xs text-muted-foreground mt-1">
                We'll show potential partners when other churches in your area define their ministry areas and collaboration preferences.
              </p>
            </CardContent>
          </Card>
        )}

        {opportunities.map((opp) => (
          <OpportunityCard 
            key={opp.partner_id} 
            opportunity={opp}
            churchId={churchId}
            onStartCollaboration={handleStartCollaboration}
          />
        ))}
      </div>

      {/* Start Collaboration Dialog */}
      <Dialog open={!!startCollabDialog} onOpenChange={(open) => !open && setStartCollabDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Collaboration</DialogTitle>
            <DialogDescription>
              Send a collaboration request to {startCollabDialog?.partnerName}. 
              They'll be notified and can accept or decline.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Message (optional)</label>
              <Textarea
                placeholder="Introduce yourself and share what you'd like to collaborate on..."
                value={collabDescription}
                onChange={(e) => setCollabDescription(e.target.value)}
                className="mt-1.5"
                rows={3}
                data-testid="input-collab-description"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStartCollabDialog(null)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmCollaboration}
              disabled={startCollaborationMutation.isPending}
              data-testid="button-confirm-collaboration"
            >
              {startCollaborationMutation.isPending ? (
                <>Sending...</>
              ) : (
                <>
                  <Handshake className="w-4 h-4 mr-2" />
                  Send Request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
