import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { motion, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { 
  ChevronLeft, 
  ChevronDown,
  DollarSign, 
  Heart, 
  Users, 
  TrendingUp,
  Home,
  Handshake,
  ArrowRight,
  CheckCircle2,
  Info,
  Building,
  Sparkles,
  Target,
  Gift,
  ExternalLink,
  Calculator,
  Shield
} from "lucide-react";
import { useState, useEffect } from "react";
import type { FundMissionPageData, CallingType } from "@shared/schema";
import { CALLING_COLORS, callingOptions } from "@shared/schema";
import { PartnershipApplicationModal } from "@/components/PartnershipApplicationModal";
import { AareConversionModal } from "@/components/AareConversionModal";
import { ClaimChurchButton } from "@/components/ClaimChurchButton";
import mountainHeroImage from "@assets/generated_images/mountain_cross_on_right_side.png";

const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.6, ease: [0.25, 0.4, 0.25, 1] } 
  }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { 
      staggerChildren: 0.1,
      delayChildren: 0.1
    }
  }
};

function getCallingLabel(value: string): string {
  const option = callingOptions.find(opt => opt.value === value);
  return option?.label || value;
}

function getCallingTypeColor(type: CallingType): string {
  return CALLING_COLORS[type] || "#94a3b8";
}

function AnimatedCounter({ value }: { value: number }) {
  const spring = useSpring(0, { stiffness: 100, damping: 30 });
  const display = useTransform(spring, (v) => 
    new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD', 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 0 
    }).format(Math.round(v))
  );
  
  useEffect(() => {
    spring.set(value);
  }, [spring, value]);
  
  return <motion.span>{display}</motion.span>;
}

export default function FundTheMission() {
  // Match both national route and platform-scoped route
  const [, paramsNational] = useRoute("/church/:id/fund-the-mission");
  const [, paramsPlatform] = useRoute("/:platform/church/:id/fund-the-mission");
  const churchId = paramsNational?.id || paramsPlatform?.id;
  const shouldReduceMotion = useReducedMotion();
  
  const [partnershipModalOpen, setPartnershipModalOpen] = useState(false);
  const [partnershipPath, setPartnershipPath] = useState<'explore' | 'authorize'>('explore');
  const [aareModalOpen, setAareModalOpen] = useState(false);
  const [claimRequiredDialogOpen, setClaimRequiredDialogOpen] = useState(false);
  const [transactions, setTransactions] = useState([10]);
  const [editableHomePrice, setEditableHomePrice] = useState<number | null>(null);

  const animationProps = shouldReduceMotion 
    ? { initial: "visible", animate: "visible", whileInView: "visible" }
    : { initial: "hidden", whileInView: "visible", viewport: { once: true, margin: "-50px" } };

  const { data, isLoading, error } = useQuery<FundMissionPageData>({
    queryKey: ["/api/churches", churchId, "fund-mission"],
    queryFn: () => fetch(`/api/churches/${churchId}/fund-mission`).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }),
    enabled: !!churchId,
  });

  // Initialize editable home price when data loads (must be before conditional returns)
  useEffect(() => {
    if (data?.medianHomePrice && editableHomePrice === null) {
      setEditableHomePrice(data.medianHomePrice);
    }
  }, [data?.medianHomePrice, editableHomePrice]);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const openPartnershipModal = (path: 'explore' | 'authorize') => {
    // Check if church is unclaimed - if so, show claim required dialog instead
    const churchIsUnclaimed = data && !data.isClaimed && !data.hasExistingClaim;
    if (churchIsUnclaimed) {
      setClaimRequiredDialogOpen(true);
      return;
    }
    setPartnershipPath(path);
    setPartnershipModalOpen(true);
  };

  const openAareModal = () => {
    // Check if church is unclaimed - if so, show claim required dialog instead
    const churchIsUnclaimed = data && !data.isClaimed && !data.hasExistingClaim;
    if (churchIsUnclaimed) {
      setClaimRequiredDialogOpen(true);
      return;
    }
    setAareModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container max-w-5xl mx-auto py-8 px-4">
          <Skeleton className="h-8 w-32 mb-6" />
          <Skeleton className="h-64 w-full mb-8" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
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
    );
  }

  const { church, callings, collaborationHave, collaborationNeed, sponsors, isPartnershipActive, isClaimed, hasExistingClaim, medianHomePrice } = data;
  // Church is effectively unclaimed if no one has claimed_by set and there's no approved claim
  // Note: partnership_status can be 'interest' or 'pending' from applications, but church isn't truly claimed yet
  const isUnclaimed = !isClaimed && !hasExistingClaim;
  
  // Use editable price or fallback
  const displayHomePrice = editableHomePrice ?? medianHomePrice ?? 400000;

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Church Branding Header */}
      <div className="bg-card border-b">
        <div className="container max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <Link href={`/church/${churchId}`}>
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back to Church
              </Button>
            </Link>
            
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 border-2 border-border">
                <AvatarImage src={church.profile_photo_url || undefined} alt={church.name} />
                <AvatarFallback className="text-sm font-bold bg-primary text-primary-foreground">
                  {church.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:block">
                <p className="font-semibold text-sm" data-testid="text-church-name">{church.name}</p>
                <p className="text-xs text-muted-foreground" data-testid="text-church-location">
                  {[church.city, church.state].filter(Boolean).join(', ')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 1: Hero with Background Image */}
      <section 
        className="relative py-10 md:py-16 overflow-hidden bg-background"
        data-testid="section-hero"
      >
        {/* Background image at 15% opacity */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ 
            backgroundImage: `url(${mountainHeroImage})`,
            opacity: 0.15
          }}
        />
        
        <div className="container max-w-4xl mx-auto px-4 relative z-10">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="text-center space-y-6"
          >
            <motion.div variants={fadeInUp}>
              <Badge className="mb-4" data-testid="badge-partnership">
                <Sparkles className="w-3 h-3 mr-1" />
                Mission Funding Partnership
              </Badge>
            </motion.div>
            
            <motion.h1 
              variants={fadeInUp}
              className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight text-foreground" 
              data-testid="text-hero-headline"
            >
              Unlock Mission Funding.<br />A church and business partnership.
            </motion.h1>
            
            <motion.p 
              variants={fadeInUp}
              className="text-lg md:text-xl text-foreground/80 max-w-2xl mx-auto leading-relaxed"
            >
              When you buy or sell a home through our JV partnership with AARE, a portion of the 
              commission funds {church.name}'s mission—at no added cost to you.
            </motion.p>
            
            <motion.div variants={fadeInUp} className="flex flex-wrap justify-center gap-3 pt-4">
              <Badge variant="secondary" className="px-4 py-2 text-sm backdrop-blur-sm">
                <DollarSign className="w-4 h-4 mr-1" />
                No Added Cost
              </Badge>
              <Badge variant="secondary" className="px-4 py-2 text-sm backdrop-blur-sm">
                <Shield className="w-4 h-4 mr-1" />
                No Obligation
              </Badge>
              <Badge variant="secondary" className="px-4 py-2 text-sm backdrop-blur-sm">
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Transparent Process
              </Badge>
            </motion.div>
            
            <motion.div 
              variants={fadeInUp}
              className="flex flex-col sm:flex-row gap-3 justify-center pt-6"
            >
              {!isUnclaimed && (
                <Button 
                  size="lg" 
                  className="group"
                  onClick={() => openPartnershipModal('authorize')}
                  data-testid="button-start-partnership"
                >
                  Start Partnership
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              )}
              {isUnclaimed ? (
                <Button 
                  size="lg" 
                  className="group"
                  onClick={() => openPartnershipModal('explore')}
                  data-testid="button-explore-partnership"
                >
                  Explore Partnership
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              ) : (
                <Button 
                  size="lg" 
                  variant="outline" 
                  onClick={() => scrollToSection('why-partnership')}
                  data-testid="button-learn-more"
                >
                  Learn More
                  <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              )}
            </motion.div>
            
            <motion.p 
              variants={fadeInUp}
              className="text-sm text-muted-foreground pt-2"
            >
              Powered by a JV partnership with AARE
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Section 2: Orientation Banner (Conditional) */}
      {isUnclaimed && (
        <motion.section 
          {...animationProps}
          variants={fadeInUp}
          className="bg-blue-50 dark:bg-blue-950/30 border-y border-blue-200 dark:border-blue-800"
          data-testid="section-unclaimed-banner"
        >
          <div className="container max-w-5xl mx-auto px-4 py-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                  <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <div className="flex-1">
                <p className="text-blue-900 dark:text-blue-100 font-medium" data-testid="text-unclaimed-message">
                  This church hasn't activated their partnership yet. Are you affiliated with {church.name}?
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  Claim this church profile to unlock partnership benefits and manage your mission funding.
                </p>
              </div>
              <Button 
                variant="outline" 
                className="border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900"
                asChild
                data-testid="button-claim-church"
              >
                <Link href={`/church/${churchId}`}>
                  <Building className="w-4 h-4 mr-2" />
                  Claim This Church
                </Link>
              </Button>
            </div>
          </div>
        </motion.section>
      )}

      {/* Section 3: Why Partnership Exists */}
      <section id="why-partnership" className="py-16 md:py-20" data-testid="section-why-partnership">
        <div className="container max-w-5xl mx-auto px-4">
          <motion.div {...animationProps} variants={staggerContainer}>
            <motion.div variants={fadeInUp} className="text-center mb-12">
              <Badge className="mb-4" data-testid="badge-partnership-section">
                <Heart className="w-3 h-3 mr-1" />
                Partnership Benefits
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-why-title">
                Why Churches Partner With AARE
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto" data-testid="text-why-description">
                Turn everyday real estate transactions in your community into sustainable mission funding.
              </p>
            </motion.div>

            <motion.div 
              variants={staggerContainer}
              className="grid md:grid-cols-2 gap-6"
            >
              {[
                {
                  icon: DollarSign,
                  title: "Fund Your Mission",
                  description: "Real estate activity in your community generates ongoing funding for your ministry programs and outreach.",
                  color: "text-emerald-500",
                  bg: "bg-emerald-500/10"
                },
                {
                  icon: Gift,
                  title: "No Cost to You",
                  description: "Partnership is completely free to join. There's no membership fee, no hidden costs, and no obligation.",
                  color: "text-purple-500",
                  bg: "bg-purple-500/10"
                },
                {
                  icon: Users,
                  title: "Community Impact",
                  description: "Connect with supporters through their most significant financial decision—buying or selling a home.",
                  color: "text-blue-500",
                  bg: "bg-blue-500/10"
                },
                {
                  icon: TrendingUp,
                  title: "Sustainable Revenue",
                  description: "Unlike one-time donations, partnership creates ongoing funding as community members buy and sell homes.",
                  color: "text-amber-500",
                  bg: "bg-amber-500/10"
                }
              ].map((benefit, index) => (
                <motion.div key={index} variants={fadeInUp}>
                  <Card className="h-full hover-elevate" data-testid={`card-benefit-${index}`}>
                    <CardContent className="p-6">
                      <div className={`w-12 h-12 rounded-xl ${benefit.bg} flex items-center justify-center mb-4`}>
                        <benefit.icon className={`w-6 h-6 ${benefit.color}`} />
                      </div>
                      <h3 className="text-lg font-semibold mb-2">{benefit.title}</h3>
                      <p className="text-muted-foreground">{benefit.description}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Section 4: What Partnership Unlocks (Conditional) */}
      {isPartnershipActive && (
        <section className="py-16 md:py-20 bg-muted/30" data-testid="section-partnership-unlocks">
          <div className="container max-w-5xl mx-auto px-4">
            <motion.div {...animationProps} variants={staggerContainer}>
              <motion.div variants={fadeInUp} className="text-center mb-12">
                <Badge className="mb-4" data-testid="badge-active-partnership">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Active Partnership
                </Badge>
                <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-unlocks-title">
                  What {church.name} Has Access To
                </h2>
              </motion.div>

              <motion.div variants={fadeInUp}>
                <Card>
                  <CardContent className="p-8">
                    <div className="grid md:grid-cols-2 gap-6">
                      {[
                        "Priority agent matching in your area",
                        "Custom branded partnership materials",
                        "Real-time transaction tracking dashboard",
                        "Dedicated partnership support team",
                        "Community promotional resources",
                        "Annual partnership impact report"
                      ].map((feature, index) => (
                        <div key={index} className="flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
          </div>
        </section>
      )}

      {/* Section 5: How Mission Funding Works */}
      <section className={`py-16 md:py-20 ${isPartnershipActive ? '' : 'bg-muted/30'}`} data-testid="section-how-it-works">
        <div className="container max-w-5xl mx-auto px-4">
          <motion.div {...animationProps} variants={staggerContainer}>
            <motion.div variants={fadeInUp} className="text-center mb-12">
              <Badge className="mb-4" data-testid="badge-how-works">
                <Target className="w-3 h-3 mr-1" />
                The Process
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-how-title">
                How Mission Funding Works
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto" data-testid="text-how-description">
                A simple, transparent process that turns home transactions into ministry impact.
              </p>
            </motion.div>

            <motion.div 
              variants={staggerContainer}
              className="grid md:grid-cols-3 gap-6 mb-12"
            >
              {[
                {
                  step: "1",
                  icon: Home,
                  title: "Community Member Buys or Sells",
                  description: "Someone in your congregation or community decides to buy or sell a home."
                },
                {
                  step: "2",
                  icon: Handshake,
                  title: "Uses AARE Professional",
                  subtitle: "(or resident agent at your church)",
                  description: "They connect with an AARE-affiliated real estate professional who shares your mission."
                },
                {
                  step: "3",
                  icon: Heart,
                  title: "Funding Directed to Church",
                  description: "A meaningful portion of the agent's commission is directed to support your ministry."
                }
              ].map((item, index) => (
                <motion.div key={index} variants={fadeInUp}>
                  <Card className="h-full text-center" data-testid={`card-step-${index}`}>
                    <CardContent className="p-6">
                      <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                        {item.step}
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
                        <item.icon className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-semibold mb-1">{item.title}</h3>
                      {item.subtitle && (
                        <p className="text-xs text-muted-foreground mb-2">{item.subtitle}</p>
                      )}
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>

            {!isUnclaimed && (
              <motion.div variants={fadeInUp} className="text-center">
                <Button 
                  size="lg" 
                  onClick={openAareModal}
                  data-testid="button-get-connected"
                >
                  Get Connected to an Agent
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </motion.div>
            )}
          </motion.div>
        </div>
      </section>

      {/* Section 5.5: Mission Impact Calculator */}
      <section className="py-16 md:py-20" data-testid="section-calculator">
        <div className="container max-w-5xl mx-auto px-4">
          <motion.div {...animationProps} variants={staggerContainer}>
            <motion.div variants={fadeInUp}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="w-5 h-5" />
                    Mission Impact Calculator
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    See how real estate activity in your community can support the mission
                  </p>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-sm font-medium">Number of Transactions</label>
                    <Slider
                      value={transactions}
                      onValueChange={setTransactions}
                      min={1}
                      max={100}
                      step={1}
                      data-testid="slider-transactions"
                    />
                    <div className="text-right text-sm text-muted-foreground" data-testid="text-transactions-value">
                      {transactions[0]} transaction{transactions[0] !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t">
                    <div className="space-y-2">
                      <label htmlFor="home-price" className="text-sm text-muted-foreground">Average Home Price</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                        <Input
                          id="home-price"
                          type="number"
                          value={editableHomePrice ?? ''}
                          onChange={(e) => setEditableHomePrice(e.target.value === '' ? null : Number(e.target.value))}
                          placeholder={(medianHomePrice ?? 400000).toString()}
                          className="pl-7"
                          data-testid="input-home-price"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <span className="text-sm text-muted-foreground">Mission Dollars Generated</span>
                      <p className="text-3xl font-bold text-primary" data-testid="text-mission-dollars">
                        <AnimatedCounter value={transactions[0] * displayHomePrice * 0.00375} />
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground pt-4 border-t" data-testid="text-calculator-disclaimer">
                    *Donations are estimated. Referral fees and commission rates are negotiable and will impact actual donation amounts.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Section 6: Where Giving Is Directed */}
      <section className="py-16 md:py-20" data-testid="section-mission-content">
        <div className="container max-w-5xl mx-auto px-4">
          <motion.div {...animationProps} variants={staggerContainer}>
            <motion.div variants={fadeInUp} className="text-center mb-12">
              <Badge className="mb-4" data-testid="badge-mission">
                <Heart className="w-3 h-3 mr-1" />
                Ministry Focus
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-mission-title">
                Where Giving Is Directed
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto" data-testid="text-mission-description">
                Explore the ministry areas and callings that {church.name} is focused on.
              </p>
            </motion.div>

            {callings.length > 0 ? (
              <motion.div 
                variants={staggerContainer}
                className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8"
              >
                {callings.map((calling, index) => (
                  <motion.div key={calling.id} variants={fadeInUp}>
                    <Card 
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
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <motion.div variants={fadeInUp}>
                <Card className="text-center py-12">
                  <CardContent>
                    <Heart className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                    <p className="text-muted-foreground" data-testid="text-no-callings">
                      This church hasn't shared their ministry focus yet.
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {(collaborationHave.length > 0 || collaborationNeed.length > 0) && (
              <motion.div variants={fadeInUp} className="mt-8">
                <div className="grid md:grid-cols-2 gap-6">
                  {collaborationHave.length > 0 && (
                    <Card>
                      <CardContent className="p-6">
                        <h3 className="font-semibold mb-3 flex items-center gap-2">
                          <Gift className="w-4 h-4 text-emerald-500" />
                          What We Offer
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {collaborationHave.map((item, index) => (
                            <Badge key={index} variant="secondary" data-testid={`badge-have-${index}`}>
                              {getCallingLabel(item)}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  {collaborationNeed.length > 0 && (
                    <Card>
                      <CardContent className="p-6">
                        <h3 className="font-semibold mb-3 flex items-center gap-2">
                          <Heart className="w-4 h-4 text-rose-500" />
                          What We Need
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {collaborationNeed.map((item, index) => (
                            <Badge key={index} variant="outline" data-testid={`badge-need-${index}`}>
                              {getCallingLabel(item)}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      </section>

      {/* Section 7: Participation Paths */}
      <section className="py-16 md:py-20 bg-muted/30" data-testid="section-participation-paths">
        <div className="container max-w-5xl mx-auto px-4">
          <motion.div {...animationProps} variants={staggerContainer}>
            <motion.div variants={fadeInUp} className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-paths-title">
                Ready to Get Started?
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto" data-testid="text-paths-description">
                Choose the path that's right for you.
              </p>
            </motion.div>

            <motion.div 
              variants={staggerContainer}
              className={`grid ${isUnclaimed ? 'md:grid-cols-1 max-w-md' : 'md:grid-cols-2 max-w-4xl'} gap-6 mx-auto`}
            >
              <motion.div variants={fadeInUp}>
                <Card className="h-full hover-elevate" data-testid="card-explore-path">
                  <CardContent className="p-8 text-center">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
                      <Info className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-xl font-semibold mb-3">I Want to Learn More</h3>
                    <p className="text-muted-foreground mb-6">
                      Get more information about how partnership works and what it means for your church. No commitment required.
                    </p>
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => openPartnershipModal('explore')}
                      data-testid="button-explore-path"
                    >
                      Explore Partnership
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>

              {!isUnclaimed && (
                <motion.div variants={fadeInUp}>
                  <Card className="h-full border-primary hover-elevate" data-testid="card-authorize-path">
                    <CardContent className="p-8 text-center">
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                        <CheckCircle2 className="w-8 h-8 text-primary" />
                      </div>
                      <Badge className="mb-3" data-testid="badge-recommended">Recommended</Badge>
                      <h3 className="text-xl font-semibold mb-3">I'm Ready to Activate</h3>
                      <p className="text-muted-foreground mb-6">
                        If you have authority to act on behalf of your church, you can start the partnership activation process now.
                      </p>
                      <Button 
                        className="w-full"
                        onClick={() => openPartnershipModal('authorize')}
                        data-testid="button-authorize-path"
                      >
                        Activate Partnership
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Section 8: Sponsors Grid (Conditional) */}
      {isPartnershipActive && sponsors.length > 0 && (
        <section className="py-16 md:py-20" data-testid="section-sponsors">
          <div className="container max-w-5xl mx-auto px-4">
            <motion.div {...animationProps} variants={staggerContainer}>
              <motion.div variants={fadeInUp} className="text-center mb-12">
                <h2 className="text-2xl md:text-3xl font-bold mb-4" data-testid="text-sponsors-title">
                  Our Partners
                </h2>
                <p className="text-muted-foreground" data-testid="text-sponsors-description">
                  Organizations supporting {church.name}'s mission.
                </p>
              </motion.div>

              <motion.div 
                variants={staggerContainer}
                className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"
              >
                {sponsors.map((sponsor, index) => (
                  <motion.div key={sponsor.id} variants={fadeInUp}>
                    <Card className="hover-elevate" data-testid={`card-sponsor-${index}`}>
                      <CardContent className="p-6 flex flex-col items-center justify-center min-h-[120px]">
                        {sponsor.logo_url ? (
                          <img 
                            src={sponsor.logo_url} 
                            alt={sponsor.name}
                            className="max-h-12 max-w-full object-contain mb-2"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mb-2">
                            <Building className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                        <p className="text-sm font-medium text-center">{sponsor.name}</p>
                        {sponsor.website_url && (
                          <a 
                            href={sponsor.website_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mt-1"
                          >
                            Visit <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </section>
      )}

      {/* Modals */}
      <PartnershipApplicationModal
        open={partnershipModalOpen}
        onOpenChange={setPartnershipModalOpen}
        churchId={churchId || ''}
        churchName={church.name}
        initialPath={partnershipPath}
      />

      <AareConversionModal
        open={aareModalOpen}
        onOpenChange={setAareModalOpen}
        churchId={churchId || ''}
        churchName={church.name}
      />

      {/* Claim Required Dialog - shown when unclaimed church tries to access partnership features */}
      <AlertDialog open={claimRequiredDialogOpen} onOpenChange={setClaimRequiredDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Building className="w-5 h-5" />
              Church Not Yet Claimed
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              This church has not been claimed yet. Claim this church to unlock mission funding and partnership benefits.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-claim-dialog-cancel">Maybe Later</AlertDialogCancel>
            <ClaimChurchButton 
              churchId={churchId || ''} 
              churchName={church.name}
              data-testid="button-claim-dialog-claim"
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
