import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Handshake, PartyPopper, Check, Send, Unlink, BookOpen, ArrowUpFromLine } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface FormationPrayer {
  id: string;
  prayer_request_id: string;
  title?: string;
  body: string;
  is_anonymous: boolean;
  submitter_name?: string;
  church_name?: string;
  church_id?: string;
  created_at: string;
  answered_at?: string;
  challenge_id: string;
  local_prayer_id: string | null;
  is_synced: boolean;
}

interface FormationPrayersResponse {
  prayers: FormationPrayer[];
  partner: string;
  count: number;
  resolved_challenge_id: string;
}

interface FormationChallenge {
  id: string;
  title: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
}

interface FormationChallengesResponse {
  challenges: FormationChallenge[];
  count: number;
}

interface FormationPrayerExchangeProps {
  churchId: string;
  formationChurchId?: string | null;
  hasFormationApiKey?: boolean;
  canEdit: boolean;
}

export function FormationPrayerExchange({ churchId, formationChurchId, hasFormationApiKey, canEdit }: FormationPrayerExchangeProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [formationApiKeyInput, setFormationApiKeyInput] = useState("");
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);

  const isConnected = !!hasFormationApiKey;

  const connectMutation = useMutation({
    mutationFn: async ({ formation_api_key }: { formation_api_key: string }) => {
      return apiRequest("PATCH", `/api/churches/${churchId}`, { formation_api_key });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches", churchId] });
      setFormationApiKeyInput("");
      toast({ title: "Connected", description: "Your church is now linked to the Formation App." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to connect to Formation.", variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/churches/${churchId}`, { formation_api_key: null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches", churchId] });
      toast({ title: "Disconnected", description: "Your church has been unlinked from the Formation App." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to disconnect from Formation.", variant: "destructive" });
    },
  });

  const challengeParam = selectedChallengeId ? `&challenge_id=${selectedChallengeId}` : "";

  const { data: challengesData } = useQuery<FormationChallengesResponse>({
    queryKey: ["/api/formation/prayers", "challenges", churchId],
    queryFn: () => fetch(`/api/formation/prayers?action=challenges&church_id=${churchId}`).then(res => {
      if (!res.ok) throw new Error("Failed to fetch challenges");
      return res.json();
    }),
    retry: false,
    enabled: isConnected,
  });

  const { data, isLoading, error } = useQuery<FormationPrayersResponse>({
    queryKey: ["/api/formation/prayers", churchId, selectedChallengeId],
    queryFn: () => fetch(`/api/formation/prayers?church_id=${churchId}${challengeParam}`).then(res => {
      if (!res.ok) throw new Error("Failed to fetch formation prayers");
      return res.json();
    }),
    retry: false,
    enabled: isConnected,
  });

  const respondMutation = useMutation({
    mutationFn: async ({ prayer_request_id, response_text }: { prayer_request_id: string; response_text: string }) => {
      return apiRequest("POST", "/api/formation/prayers/respond", { prayer_request_id, response_text, church_id: churchId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/formation/prayers", churchId, selectedChallengeId] });
      setRespondingTo(null);
      setResponseText("");
      toast({ title: "Prayer sent", description: "Your prayer response has been shared." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send prayer response.", variant: "destructive" });
    },
  });

  const markAnsweredMutation = useMutation({
    mutationFn: async (formation_prayer_id: string) => {
      return apiRequest("PATCH", "/api/formation/prayers/answered", { formation_prayer_id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/formation/prayers", churchId, selectedChallengeId] });
      toast({ title: "Prayer marked answered", description: "This prayer has been marked as answered." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to mark prayer as answered.", variant: "destructive" });
    },
  });

  const { data: localPrayersData } = useQuery<{ approved: any[]; prayers: any[] }>({
    queryKey: ["/api/churches", churchId, "prayers"],
    queryFn: () => fetch(`/api/churches/${churchId}/prayers`).then(res => {
      if (!res.ok) throw new Error("Failed to fetch local prayers");
      return res.json();
    }),
    enabled: isConnected && canEdit,
  });

  const pushableLocalPrayers = (localPrayersData?.approved || []).filter(
    (p: any) => !p.formation_prayer_id
  );

  const pushMutation = useMutation({
    mutationFn: async (prayer_id: string) => {
      return apiRequest("POST", "/api/formation/prayers/push", { prayer_id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches", churchId, "prayers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/formation/prayers", churchId, selectedChallengeId] });
      toast({ title: "Prayer shared", description: "Prayer submitted to Formation (pending their admin approval)." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to push prayer to Formation.", variant: "destructive" });
    },
  });

  const handleRespondSubmit = (prayerRequestId: string) => {
    if (responseText.trim()) {
      respondMutation.mutate({ prayer_request_id: prayerRequestId, response_text: responseText.trim() });
    }
  };

  if (!isConnected) {
    if (!canEdit) return null;

    return (
      <Card className="border-primary/20" data-testid="card-formation-connect">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Handshake className="w-5 h-5" />
            Formation Prayer Exchange
          </CardTitle>
          <CardDescription>
            Connect your church to The Formation App to exchange prayer requests with other churches. Get your API key from the Formation developer settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Formation API Key</label>
              <Input
                value={formationApiKeyInput}
                onChange={(e) => setFormationApiKeyInput(e.target.value)}
                placeholder="Paste your Formation API key"
                type="password"
                data-testid="input-formation-api-key"
              />
            </div>
            <Button
              onClick={() => {
                if (formationApiKeyInput.trim()) {
                  connectMutation.mutate({
                    formation_api_key: formationApiKeyInput.trim(),
                  });
                }
              }}
              disabled={connectMutation.isPending || !formationApiKeyInput.trim()}
              data-testid="button-connect-formation"
            >
              {connectMutation.isPending ? "Connecting..." : "Connect"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/30" data-testid="card-formation-error">
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Handshake className="w-5 h-5" />
              Prayer Exchange
            </CardTitle>
            <CardDescription className="text-destructive">
              Unable to connect to The Formation App. The API key may be invalid or the service may be temporarily unavailable.
            </CardDescription>
          </div>
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              data-testid="button-disconnect-formation-error"
            >
              <Unlink className="w-3 h-3 mr-1" />
              {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
            </Button>
          )}
        </CardHeader>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="border-primary/20" data-testid="card-formation-prayer-exchange-loading">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Handshake className="w-5 h-5" />
            Prayer Exchange
          </CardTitle>
          <CardDescription>via The Formation App</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3 border rounded-md space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-16 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const prayers = data?.prayers || [];
  const challenges = challengesData?.challenges || [];

  if (prayers.length === 0 && !canEdit) {
    return null;
  }

  return (
    <Card className="border-primary/20" data-testid="card-formation-prayer-exchange">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Handshake className="w-5 h-5" />
            Prayer Exchange
          </CardTitle>
          <CardDescription>
            via The Formation App
            {data?.count ? ` \u00B7 ${data.count} prayer${data.count === 1 ? "" : "s"}` : ""}
          </CardDescription>
        </div>
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => disconnectMutation.mutate()}
            disabled={disconnectMutation.isPending}
            data-testid="button-disconnect-formation"
          >
            <Unlink className="w-3 h-3 mr-1" />
            {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {challenges.length > 1 && (
          <div className="mb-4">
            <Select
              value={selectedChallengeId || "latest"}
              onValueChange={(val) => setSelectedChallengeId(val === "latest" ? null : val)}
            >
              <SelectTrigger className="w-full" data-testid="select-challenge">
                <BookOpen className="w-4 h-4 mr-2 flex-shrink-0" />
                <SelectValue placeholder="Latest Challenge" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest" data-testid="select-challenge-latest">Latest Challenge</SelectItem>
                {challenges.map((c) => (
                  <SelectItem key={c.id} value={c.id} data-testid={`select-challenge-${c.id}`}>
                    {c.title}
                    {c.is_active ? " (Active)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {prayers.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-no-formation-prayers">
            No prayer requests available from your Formation partner yet.
          </p>
        ) : (
          <div className="space-y-3">
            {prayers.map((prayer) => (
              <div
                key={prayer.id}
                className="p-3 border rounded-md space-y-2"
                data-testid={`formation-prayer-${prayer.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {prayer.title && (
                      <h4 className="font-medium text-sm truncate" data-testid={`text-formation-prayer-title-${prayer.id}`}>
                        {prayer.title}
                      </h4>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                    {formatDistanceToNow(new Date(prayer.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2" data-testid={`text-formation-prayer-body-${prayer.id}`}>
                  {prayer.body}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  {prayer.is_anonymous ? (
                    <Badge variant="secondary" className="text-xs" data-testid={`badge-anonymous-${prayer.id}`}>
                      Anonymous
                    </Badge>
                  ) : prayer.submitter_name ? (
                    <span className="text-xs text-muted-foreground" data-testid={`text-submitter-${prayer.id}`}>
                      {prayer.submitter_name}
                    </span>
                  ) : null}
                  {prayer.church_name && (
                    <span className="text-xs text-muted-foreground" data-testid={`text-church-name-${prayer.id}`}>
                      {prayer.church_name}
                    </span>
                  )}
                  {prayer.answered_at && (
                    <Badge className="text-xs bg-amber-500 text-white no-default-hover-elevate" data-testid={`badge-answered-${prayer.id}`}>
                      <PartyPopper className="w-3 h-3 mr-1" />
                      Answered
                    </Badge>
                  )}
                  {prayer.is_synced && (
                    <Badge variant="outline" className="text-xs" data-testid={`badge-synced-${prayer.id}`}>
                      <Check className="w-3 h-3 mr-1" />
                      Synced
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {respondingTo === prayer.id ? (
                    <div className="w-full space-y-2">
                      <Textarea
                        value={responseText}
                        onChange={(e) => setResponseText(e.target.value)}
                        placeholder="Share your prayer..."
                        rows={2}
                        className="text-sm"
                        data-testid={`textarea-prayer-response-${prayer.id}`}
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          size="sm"
                          onClick={() => handleRespondSubmit(prayer.prayer_request_id)}
                          disabled={respondMutation.isPending || !responseText.trim()}
                          data-testid={`button-submit-prayer-response-${prayer.id}`}
                        >
                          <Send className="w-3 h-3 mr-1" />
                          {respondMutation.isPending ? "Sending..." : "Send"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setRespondingTo(null);
                            setResponseText("");
                          }}
                          data-testid={`button-cancel-prayer-response-${prayer.id}`}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {!prayer.answered_at && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setRespondingTo(prayer.id);
                            setResponseText("");
                          }}
                          data-testid={`button-pray-${prayer.id}`}
                        >
                          Pray
                        </Button>
                      )}
                      {user && !prayer.answered_at && (prayer.church_id === formationChurchId) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => markAnsweredMutation.mutate(prayer.prayer_request_id)}
                          disabled={markAnsweredMutation.isPending}
                          data-testid={`button-mark-answered-${prayer.id}`}
                        >
                          <PartyPopper className="w-3 h-3 mr-1" />
                          {markAnsweredMutation.isPending ? "Marking..." : "Mark Answered"}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {canEdit && pushableLocalPrayers.length > 0 && (
          <div className="mt-4 pt-4 border-t" data-testid="section-push-to-formation">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <ArrowUpFromLine className="w-4 h-4" />
              Share to Formation
            </h4>
            <p className="text-xs text-muted-foreground mb-3">
              Push approved prayers from your church to the Formation community for others to pray over.
            </p>
            <div className="space-y-2">
              {pushableLocalPrayers.map((lp: any) => (
                <div
                  key={lp.id}
                  className="flex items-center justify-between gap-2 p-2 border rounded-md"
                  data-testid={`push-prayer-${lp.id}`}
                >
                  <div className="flex-1 min-w-0">
                    {lp.title && (
                      <p className="text-sm font-medium truncate">{lp.title}</p>
                    )}
                    {lp.body && (
                      <p className="text-xs text-muted-foreground truncate">{lp.body}</p>
                    )}
                    {!lp.title && !lp.body && (
                      <p className="text-sm text-muted-foreground truncate">Prayer request</p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => pushMutation.mutate(lp.id)}
                    disabled={pushMutation.isPending}
                    data-testid={`button-push-prayer-${lp.id}`}
                  >
                    <ArrowUpFromLine className="w-3 h-3 mr-1" />
                    {pushMutation.isPending ? "Sharing..." : "Share"}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
