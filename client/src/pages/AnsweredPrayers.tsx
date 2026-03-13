import { useQuery } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, PartyPopper, Church as ChurchIcon, Calendar, Sparkles } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { usePlatformContext } from "@/contexts/PlatformContext";

interface AnsweredPrayer {
  id: string;
  title: string;
  body: string;
  is_anonymous: boolean;
  display_first_name: string | null;
  display_last_initial: string | null;
  created_at: string;
  answered_at: string;
  answered_note: string | null;
  is_church_request: boolean;
  church_id: string;
  churches: {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    profile_photo_url: string | null;
  } | null;
}

interface AnsweredPrayersResponse {
  prayers: AnsweredPrayer[];
  total: number;
  limit: number;
  offset: number;
}

export default function AnsweredPrayers() {
  // Match both national route and platform-scoped route
  const [matchNational, paramsNational] = useRoute("/church/:id/answered-prayers");
  const [matchPlatform, paramsPlatform] = useRoute("/:platform/church/:id/answered-prayers");
  const [, setLocation] = useLocation();
  const { platformId } = usePlatformContext();
  
  const matchChurch = matchNational || matchPlatform;
  const churchId = matchChurch ? (paramsNational?.id || paramsPlatform?.id) : undefined;

  const buildQueryUrl = () => {
    const params = new URLSearchParams();
    if (churchId) params.set("church_id", churchId);
    if (platformId) params.set("city_platform_id", platformId);
    return `/api/prayers/answered?${params.toString()}`;
  };

  const { data, isLoading, error } = useQuery<AnsweredPrayersResponse>({
    queryKey: ["/api/prayers/answered", churchId, platformId],
    queryFn: () => fetch(buildQueryUrl()).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }),
  });

  const handleBack = () => {
    if (churchId) {
      setLocation(`/church/${churchId}`);
    } else {
      setLocation("/");
    }
  };

  const prayers = data?.prayers || [];
  const total = data?.total || 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" onClick={handleBack} data-testid="button-back">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>

        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <PartyPopper className="w-8 h-8 text-amber-500" />
            <h1 className="text-3xl font-bold" data-testid="text-page-title">
              Answered Prayers
            </h1>
            <PartyPopper className="w-8 h-8 text-amber-500" />
          </div>
          <p className="text-muted-foreground">
            Celebrating testimonies of God's faithfulness
          </p>
          {total > 0 && (
            <Badge variant="secondary" className="mt-3 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              <Sparkles className="w-3 h-3 mr-1" />
              {total} answered prayer{total !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive text-center">
                Failed to load answered prayers. Please try again later.
              </p>
            </CardContent>
          </Card>
        ) : prayers.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="pt-12 pb-12 text-center">
              <Sparkles className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-medium mb-2">No answered prayers yet</h3>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                When prayers are marked as answered, they'll appear here as a testimony 
                to God's faithfulness. Keep praying!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {prayers.map((prayer) => (
              <Card 
                key={prayer.id} 
                className="overflow-hidden border-amber-200 dark:border-amber-800/30 hover-elevate"
                data-testid={`card-answered-prayer-${prayer.id}`}
              >
                <div className="h-1 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-400" />
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg flex items-center gap-2">
                        {prayer.is_church_request && (
                          <ChurchIcon className="w-4 h-4 text-primary flex-shrink-0" />
                        )}
                        <span className="truncate">{prayer.title}</span>
                      </CardTitle>
                      {prayer.churches && (
                        <CardDescription className="mt-1">
                          <Link 
                            href={`/church/${prayer.churches.id}`}
                            className="hover:underline"
                          >
                            {prayer.churches.name}
                            {prayer.churches.city && ` • ${prayer.churches.city}`}
                            {prayer.churches.state && `, ${prayer.churches.state}`}
                          </Link>
                        </CardDescription>
                      )}
                    </div>
                    <Badge 
                      className="bg-amber-500 hover:bg-amber-600 text-white flex-shrink-0"
                      data-testid={`badge-answered-${prayer.id}`}
                    >
                      <PartyPopper className="w-3 h-3 mr-1" />
                      Answered
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1 font-medium">
                      Original Prayer Request
                    </p>
                    <p className="text-sm">{prayer.body}</p>
                  </div>
                  
                  {prayer.answered_note && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-md p-4 border border-amber-200 dark:border-amber-800/30">
                      <p className="text-sm text-muted-foreground mb-1 font-medium flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-500" />
                        How God Answered
                      </p>
                      <p className="text-sm">{prayer.answered_note}</p>
                    </div>
                  )}
                  
                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>
                        Requested {formatDistanceToNow(new Date(prayer.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <PartyPopper className="w-3 h-3 text-amber-500" />
                      <span>
                        Answered {format(new Date(prayer.answered_at), "MMM d, yyyy")}
                      </span>
                    </div>
                    {!prayer.is_anonymous && prayer.display_first_name && (
                      <span>
                        By {prayer.display_first_name}
                        {prayer.display_last_initial && ` ${prayer.display_last_initial}.`}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
