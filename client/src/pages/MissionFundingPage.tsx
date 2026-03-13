import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { MinistryFocusSection } from "@/components/MinistryFocusSection";
import { 
  ChevronLeft, 
  CheckCircle2, 
  Home,
  Handshake,
  Heart,
  Shield,
  Clock,
  DollarSign,
  ExternalLink
} from "lucide-react";
import type { FundMissionPageData, Sponsor, BuyerSellerType, TimelineOption } from "@shared/schema";
import { buyerSellerTypes, timelineOptions } from "@shared/schema";

const formSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(1, "Phone is required"),
  buyer_seller_type: z.enum(buyerSellerTypes),
  timeline: z.enum(timelineOptions).optional().nullable(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

const buyerSellerLabels: Record<BuyerSellerType, string> = {
  buyer: "Buyer",
  seller: "Seller",
  both: "Both",
};

const timelineLabels: Record<TimelineOption, string> = {
  '0_3_months': '0-3 months',
  '3_6_months': '3-6 months',
  '6_plus_months': '6+ months',
};

export default function MissionFundingPage() {
  // Match both national route and platform-scoped route
  const [, paramsNational] = useRoute("/churches/:id/mission-funding");
  const [, paramsPlatform] = useRoute("/:platform/churches/:id/mission-funding");
  const churchId = paramsNational?.id || paramsPlatform?.id;
  const { toast } = useToast();
  const { user } = useAuth();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [wantPartnerContact, setWantPartnerContact] = useState(false);
  const [selectedSponsorIds, setSelectedSponsorIds] = useState<string[]>([]);

  const { data, isLoading, error } = useQuery<FundMissionPageData>({
    queryKey: ["/api/churches", churchId, "fund-mission"],
    queryFn: () => fetch(`/api/churches/${churchId}/fund-mission`).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }),
    enabled: !!churchId,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      buyer_seller_type: "buyer",
      timeline: null,
      notes: "",
    },
  });

  useEffect(() => {
    if (user?.email) {
      form.setValue("email", user.email);
    }
  }, [user, form]);

  const submitMutation = useMutation({
    mutationFn: (data: FormData) =>
      apiRequest("POST", "/api/mission-funding-submissions", {
        ...data,
        church_id: churchId,
        selected_sponsor_ids: wantPartnerContact ? selectedSponsorIds : [],
      }),
    onSuccess: () => {
      setIsSubmitted(true);
      toast({
        title: "Submission received",
        description: "Thank you! Someone will be in touch soon.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Submission failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    submitMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container max-w-4xl mx-auto py-8 px-4">
          <Skeleton className="h-8 w-32 mb-6" />
          <Skeleton className="h-64 w-full mb-8" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (error || !data) {
    return (
      <AppLayout>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-semibold mb-2">Church not found</h1>
            <p className="text-muted-foreground mb-6">
              The church you're looking for doesn't exist or has been removed.
            </p>
            <Button asChild>
              <Link href="/">Return Home</Link>
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const { church, sponsors, callings } = data;

  if (isSubmitted) {
    return (
      <AppLayout>
        <div className="container max-w-3xl mx-auto py-16 px-4">
          <Card className="text-center py-12">
            <CardContent className="space-y-6">
              <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold" data-testid="text-confirmation-title">
                Thank You!
              </h1>
              <p className="text-lg text-muted-foreground max-w-md mx-auto" data-testid="text-confirmation-message">
                Someone will be in touch soon.
              </p>
              <p className="text-sm text-muted-foreground">
                Your interest in supporting {church.name}'s mission has been received.
              </p>
              <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
                <Button asChild variant="outline" data-testid="button-back-to-church">
                  <Link href={`/church/${churchId}`}>
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Back to Church Profile
                  </Link>
                </Button>
                <Button asChild data-testid="button-explore-map">
                  <Link href="/">Explore the Map</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {/* Church Banner */}
      <section 
        className="relative h-[250px] md:h-[350px]"
        data-testid="section-banner"
      >
        {church.banner_image_url ? (
          <div 
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${church.banner_image_url})` }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-primary/10 to-accent/20 flex items-center justify-center">
            <h2 className="text-4xl md:text-6xl font-bold text-foreground/20 text-center px-4">
              {church.name}
            </h2>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        
        <div className="absolute top-4 left-4 z-10">
          <Link href={`/church/${churchId}`}>
            <Button variant="secondary" size="sm" className="backdrop-blur-sm" data-testid="button-back">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to {church.name}
            </Button>
          </Link>
        </div>
      </section>

      {/* Hero Text Section */}
      <section 
        className="py-12 md:py-16 bg-card border-b"
        data-testid="section-hero"
      >
        <div className="container max-w-4xl mx-auto px-4">
          <div className="text-center space-y-6">
            <h1 
              className="text-3xl md:text-4xl font-bold leading-tight tracking-wide" 
              data-testid="text-hero-headline"
            >
              Buy or Sell a Home. Support the Mission.
            </h1>
            
            <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              When you buy or sell a home through our JV partnership with AARE, a portion of the 
              commission funds {church.name}'s mission—at no added cost to you.
            </p>
            
            {/* Trust Indicators */}
            <div className="flex flex-wrap justify-center gap-3 pt-4">
              <Badge variant="outline" className="px-4 py-2 text-sm">
                <DollarSign className="w-4 h-4 mr-1" />
                No Added Cost
              </Badge>
              <Badge variant="outline" className="px-4 py-2 text-sm">
                <Shield className="w-4 h-4 mr-1" />
                No Obligation
              </Badge>
              <Badge variant="outline" className="px-4 py-2 text-sm">
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Transparent Process
              </Badge>
            </div>
            
            <p className="text-sm text-muted-foreground">
              Powered by a JV partnership with AARE
            </p>
          </div>
        </div>
      </section>

      {/* Ministry Focus Section */}
      <MinistryFocusSection churchName={church.name} callings={callings} />

      {/* Section 2: How It Works */}
      <section className="py-12 bg-card border-y" data-testid="section-how-it-works">
        <div className="container max-w-4xl mx-auto px-4">
          <h2 className="text-xl font-semibold text-center mb-8">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Home className="w-6 h-6 text-primary" />
              </div>
              <div className="text-2xl font-bold text-primary">1</div>
              <h3 className="font-medium">You Buy or Sell a Home</h3>
              <p className="text-sm text-muted-foreground">
                Connect with a qualified agent through our partnership
              </p>
            </div>
            <div className="text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Handshake className="w-6 h-6 text-primary" />
              </div>
              <div className="text-2xl font-bold text-primary">2</div>
              <h3 className="font-medium">The JV Partnership is Activated</h3>
              <p className="text-sm text-muted-foreground">
                AARE coordinates with a licensed agent in your area
              </p>
            </div>
            <div className="text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Heart className="w-6 h-6 text-primary" />
              </div>
              <div className="text-2xl font-bold text-primary">3</div>
              <h3 className="font-medium">The Mission is Supported</h3>
              <p className="text-sm text-muted-foreground">
                A portion of the commission funds the church's mission
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Buyer/Seller Form */}
      <section className="py-12" data-testid="section-form">
        <div className="container max-w-2xl mx-auto px-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Home className="w-5 h-5" />
                Get Started
              </CardTitle>
              <p className="text-sm text-muted-foreground pt-1">
                Share a few details and an AARE representative will follow up to help you explore your options. No obligation. No cost to you.
              </p>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="first_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="John" 
                              {...field} 
                              data-testid="input-first-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="last_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Smith" 
                              {...field} 
                              data-testid="input-last-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email *</FormLabel>
                        <FormControl>
                          <Input 
                            type="email" 
                            placeholder="john@example.com" 
                            {...field} 
                            data-testid="input-email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone *</FormLabel>
                        <FormControl>
                          <Input 
                            type="tel" 
                            placeholder="(555) 123-4567" 
                            {...field} 
                            data-testid="input-phone"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="buyer_seller_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>I am a: *</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            className="flex gap-6"
                          >
                            {buyerSellerTypes.map((type) => (
                              <div key={type} className="flex items-center space-x-2">
                                <RadioGroupItem 
                                  value={type} 
                                  id={`type-${type}`}
                                  data-testid={`radio-${type}`}
                                />
                                <label htmlFor={`type-${type}`} className="cursor-pointer">
                                  {buyerSellerLabels[type]}
                                </label>
                              </div>
                            ))}
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="timeline"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          Timeline (Optional)
                        </FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value || undefined}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-timeline">
                              <SelectValue placeholder="When are you looking to buy/sell?" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {timelineOptions.map((option) => (
                              <SelectItem key={option} value={option}>
                                {timelineLabels[option]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes (Optional)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Anything we should know (area, price range, questions, etc.)"
                            className="resize-none"
                            rows={3}
                            {...field} 
                            data-testid="textarea-notes"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Sponsor Opt-in Section */}
                  {sponsors && sponsors.length > 0 && (
                    <div className="space-y-4 pt-4 border-t">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id="partner-optin"
                          checked={wantPartnerContact}
                          onCheckedChange={(checked) => {
                            setWantPartnerContact(checked === true);
                            if (checked) {
                              setSelectedSponsorIds(sponsors.map((s: Sponsor) => s.id));
                            } else {
                              setSelectedSponsorIds([]);
                            }
                          }}
                          className="h-5 w-5"
                          data-testid="checkbox-partner-optin"
                        />
                        <label 
                          htmlFor="partner-optin" 
                          className="cursor-pointer flex-1"
                        >
                          <span className="text-sm font-medium">
                            Hear from additional partners who support this mission
                          </span>
                          <Badge className="ml-2 bg-green-600 hover:bg-green-700 text-white">
                            Yes — Recommended
                          </Badge>
                        </label>
                      </div>
                      
                      {wantPartnerContact && (
                        <div className="ml-6 space-y-2 border-l-2 border-muted pl-4">
                          <p className="text-xs text-muted-foreground mb-2">Select which partners can contact you:</p>
                          {sponsors.map((sponsor: Sponsor) => (
                            <div key={sponsor.id} className="flex items-center gap-3">
                              <Checkbox
                                id={`sponsor-${sponsor.id}`}
                                checked={selectedSponsorIds.includes(sponsor.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedSponsorIds(prev => [...prev, sponsor.id]);
                                  } else {
                                    setSelectedSponsorIds(prev => prev.filter(id => id !== sponsor.id));
                                  }
                                }}
                                data-testid={`checkbox-sponsor-${sponsor.id}`}
                              />
                              <label 
                                htmlFor={`sponsor-${sponsor.id}`}
                                className="text-sm cursor-pointer flex items-center gap-2"
                              >
                                {sponsor.logo_url && (
                                  <img 
                                    src={sponsor.logo_url} 
                                    alt="" 
                                    className="h-5 w-5 object-contain"
                                  />
                                )}
                                {sponsor.name}
                              </label>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={submitMutation.isPending}
                    data-testid="button-submit"
                  >
                    {submitMutation.isPending ? "Submitting..." : "Submit"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Section 4: Sponsors Display */}
      <section className="py-16 bg-muted/30" data-testid="section-sponsors">
        <div className="container max-w-4xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-10">Partners Supporting This Mission</h2>
          
          {sponsors && sponsors.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-6">
              {sponsors.map((sponsor: Sponsor & { assignment?: any }) => (
                <Card 
                  key={sponsor.id} 
                  className="hover-elevate overflow-hidden"
                  data-testid={`card-sponsor-${sponsor.id}`}
                >
                  <CardContent className="p-0">
                    <div className="flex flex-col items-center text-center">
                      {/* Hero Logo Section */}
                      <div className="w-full bg-gradient-to-b from-background to-muted/50 py-8 px-6 flex items-center justify-center">
                        {sponsor.logo_url ? (
                          <img 
                            src={sponsor.logo_url} 
                            alt={sponsor.name} 
                            className="h-24 max-w-[200px] object-contain"
                          />
                        ) : (
                          <div className="h-24 w-24 bg-primary/10 rounded-xl flex items-center justify-center">
                            <Handshake className="w-12 h-12 text-primary" />
                          </div>
                        )}
                      </div>
                      
                      {/* Info Section */}
                      <div className="p-6 w-full space-y-3">
                        <h3 className="text-lg font-semibold">{sponsor.name}</h3>
                        {sponsor.description && (
                          <p className="text-sm text-muted-foreground line-clamp-3">
                            {sponsor.description}
                          </p>
                        )}
                        {sponsor.website_url && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="mt-2"
                            asChild
                          >
                            <a 
                              href={sponsor.website_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                            >
                              Visit Website
                              <ExternalLink className="w-3 h-3 ml-2" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="text-center py-12">
              <CardContent>
                <div className="mx-auto w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                  <Handshake className="w-10 h-10 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">AARE</h3>
                <p className="text-muted-foreground">
                  Licensed brokerage and operating partner in the JV
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* Section 5: Realtor CTA */}
      <section className="py-12" data-testid="section-realtor-cta">
        <div className="container max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-xl font-semibold mb-4">Real Estate Agents and Brokers - Is this your church?</h2>
          <p className="text-muted-foreground mb-6">
            We want to help you support the mission of your church by expanding your business!
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild data-testid="button-learn-more-aare">
              <Link href="/agent-program" onClick={() => window.scrollTo(0, 0)}>
                Learn More
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Section 6: AARE Presence */}
      <section className="py-8 bg-card border-t" data-testid="section-aare">
        <div className="container max-w-4xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/5 rounded-full">
            <Handshake className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">AARE</span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Licensed brokerage and operating partner in the JV partnership
          </p>
        </div>
      </section>

      {/* Section 7: Compliance */}
      <section className="py-8 border-t" data-testid="section-compliance">
        <div className="container max-w-2xl mx-auto px-4">
          <div className="text-xs text-muted-foreground space-y-2 text-center">
            <p>This is not a donation page.</p>
            <p>Buyers and sellers are not paying extra.</p>
            <p>The church is not selling endorsements.</p>
            <p>Any referral relationships are handled at the brokerage level and disclosed.</p>
          </div>
        </div>
      </section>
    </AppLayout>
  );
}
