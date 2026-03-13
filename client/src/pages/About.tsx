import { Link } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { 
  MapPin, 
  Users, 
  Heart, 
  MessageSquare, 
  Globe2, 
  Handshake,
  ChevronRight,
  Building2,
  BarChart3,
  Shield,
  Target,
  Sparkles,
  ArrowRight,
  Quote,
  CheckCircle2,
  Zap,
  Eye,
  BookOpen
} from "lucide-react";

import lightLogo from "@assets/5_1764205464663.png";
import darkLogo from "@assets/The Churches White on Black (Presentation)_1764205730044.png";

const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.7, ease: [0.25, 0.4, 0.25, 1] } 
  }
};

const fadeInLeft = {
  hidden: { opacity: 0, x: -40 },
  visible: { 
    opacity: 1, 
    x: 0, 
    transition: { duration: 0.7, ease: [0.25, 0.4, 0.25, 1] } 
  }
};

const fadeInRight = {
  hidden: { opacity: 0, x: 40 },
  visible: { 
    opacity: 1, 
    x: 0, 
    transition: { duration: 0.7, ease: [0.25, 0.4, 0.25, 1] } 
  }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { 
      staggerChildren: 0.12,
      delayChildren: 0.1
    }
  }
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { 
    opacity: 1, 
    scale: 1, 
    transition: { duration: 0.5, ease: "easeOut" } 
  }
};

export default function About() {
  const shouldReduceMotion = useReducedMotion();
  const { user } = useAuth();
  
  const animationProps = shouldReduceMotion 
    ? { initial: "visible", animate: "visible", whileInView: "visible" }
    : { initial: "hidden", whileInView: "visible", viewport: { once: true, margin: "-80px" } };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/about">
            <motion.div 
              className="flex items-center gap-2 cursor-pointer" 
              data-testid="link-logo-home"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <img src={lightLogo} alt="The Churches" className="h-8 dark:hidden" />
              <img src={darkLogo} alt="The Churches" className="h-8 hidden dark:block" />
            </motion.div>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="button-view-map">
                <MapPin className="w-4 h-4 mr-2" />
                View Map
              </Button>
            </Link>
            {user ? (
              <Link href="/profile">
                <Avatar className="h-8 w-8 cursor-pointer ring-2 ring-primary/20 hover:ring-primary/40 transition-all" data-testid="avatar-user">
                  <AvatarImage src={user.user_metadata?.avatar_url} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {user.email?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </Link>
            ) : (
              <Link href="/login">
                <Button size="sm" data-testid="button-sign-in">Sign In</Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-24 md:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-background to-accent/8" />
        <motion.div 
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent"
          animate={{ opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        
        <div className="container mx-auto px-4 relative">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="max-w-4xl mx-auto text-center"
          >
            <motion.div variants={fadeInUp}>
              <Badge className="mb-6 px-4 py-1.5" data-testid="badge-hero">
                <Sparkles className="w-3 h-3 mr-2" />
                The Churches
              </Badge>
            </motion.div>
            
            <motion.h1 
              variants={fadeInUp}
              className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 tracking-tight"
              data-testid="text-hero-title"
            >
              You Are <span className="text-primary">One Body</span>
            </motion.h1>
            
            <motion.p 
              variants={fadeInUp}
              className="text-xl md:text-2xl text-muted-foreground mb-4 max-w-3xl mx-auto"
              data-testid="text-hero-subtitle"
            >
              One Spirit. One Hope for the World.
            </motion.p>
            
            <motion.p 
              variants={fadeInUp}
              className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto"
              data-testid="text-hero-description"
            >
              This is who you've always been. Now you can see it, live it, and move together.
            </motion.p>
            
            <motion.div 
              variants={fadeInUp}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <Link href="/">
                <Button size="lg" className="group" data-testid="button-hero-map">
                  See the Body in Your City
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link href="/churches/add">
                <Button size="lg" variant="outline" data-testid="button-hero-add">
                  <Building2 className="w-4 h-4 mr-2" />
                  Add Your Church
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Identity Statement */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <motion.div
            {...animationProps}
            variants={staggerContainer}
            className="max-w-4xl mx-auto"
          >
            <motion.div variants={fadeInUp} className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-6" data-testid="text-identity-title">
                You Carry Something Your City Needs
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto" data-testid="text-identity-description">
                Every church has a unique calling—a piece of Christ's heart for your community. 
                But scattered across the city, working alone, how much of that calling actually reaches the streets?
              </p>
            </motion.div>

            <motion.div 
              variants={staggerContainer}
              className="grid md:grid-cols-2 gap-8"
            >
              <motion.div variants={fadeInLeft}>
                <Card className="h-full border-destructive/20 bg-destructive/5" data-testid="card-scattered">
                  <CardContent className="p-8">
                    <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
                      <Eye className="w-6 h-6 text-destructive" />
                    </div>
                    <h3 className="text-xl font-semibold mb-4">What the City Sees</h3>
                    <ul className="space-y-3 text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <span className="text-destructive mt-1">—</span>
                        <span>Hundreds of buildings with different signs</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-destructive mt-1">—</span>
                        <span>Competing programs, duplicated efforts</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-destructive mt-1">—</span>
                        <span>Silent when it matters most</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-destructive mt-1">—</span>
                        <span>Invisible to those who need hope</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div variants={fadeInRight}>
                <Card className="h-full border-primary/20 bg-primary/5" data-testid="card-united">
                  <CardContent className="p-8">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                      <Heart className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold mb-4">What You Actually Are</h3>
                    <ul className="space-y-3 text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary mt-1 shrink-0" />
                        <span>One Body covering every neighborhood</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary mt-1 shrink-0" />
                        <span>Diverse callings, unified mission</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary mt-1 shrink-0" />
                        <span>A prayer covering that never sleeps</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary mt-1 shrink-0" />
                        <span>The hope your city is waiting for</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Vision Scripture */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <motion.div
            {...animationProps}
            variants={fadeInUp}
            className="max-w-3xl mx-auto text-center"
          >
            <Quote className="w-12 h-12 text-primary/30 mx-auto mb-6" />
            <blockquote className="text-2xl md:text-3xl font-medium italic mb-6" data-testid="text-vision-quote">
              "For the creation waits in eager expectation for the children of God to be revealed."
            </blockquote>
            <p className="text-lg text-muted-foreground mb-2" data-testid="text-vision-reference">
              Romans 8:19
            </p>
            <p className="text-muted-foreground max-w-xl mx-auto" data-testid="text-vision-explanation">
              Your city is waiting. Not for more programs, but for the Church to show up—
              together—as who you really are.
            </p>
          </motion.div>
        </div>
      </section>

      {/* How We Move Together */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <motion.div
            {...animationProps}
            variants={staggerContainer}
          >
            <motion.div variants={fadeInUp} className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-move-title">
                How We Move Together
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto" data-testid="text-move-description">
                These aren't features. They're expressions of who the Church has always been.
              </p>
            </motion.div>

            <motion.div 
              variants={staggerContainer}
              className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto"
            >
              {[
                {
                  icon: MapPin,
                  title: "See the Body",
                  description: "Every church in your city, visible on one map. Your ministry area. Your neighbors' callings. The gaps. The overlaps. The opportunities.",
                  color: "text-blue-500",
                  bg: "bg-blue-500/10"
                },
                {
                  icon: Heart,
                  title: "Cover Your City in Prayer",
                  description: "Drop prayers anywhere on the map. See where others are interceding. Join the watch that never ends.",
                  color: "text-rose-500",
                  bg: "bg-rose-500/10"
                },
                {
                  icon: MessageSquare,
                  title: "Share the Story",
                  description: "One feed. Every church. Celebrate wins, share needs, build the narrative of what God is doing citywide.",
                  color: "text-purple-500",
                  bg: "bg-purple-500/10"
                },
                {
                  icon: Users,
                  title: "Find Your Partners",
                  description: "Who else carries your calling? Who has what you need? Who needs what you have? Collaboration matching reveals the connections waiting to happen.",
                  color: "text-emerald-500",
                  bg: "bg-emerald-500/10"
                },
                {
                  icon: Globe2,
                  title: "Lead Your City Platform",
                  description: "Convene your region. Define your boundaries. Invite the churches. Steward the movement in your corner of the map.",
                  color: "text-amber-500",
                  bg: "bg-amber-500/10"
                },
                {
                  icon: BarChart3,
                  title: "Know Your Territory",
                  description: "Crime patterns. Health needs. Demographics. See where your calling intersects with your city's deepest pain—and greatest potential.",
                  color: "text-cyan-500",
                  bg: "bg-cyan-500/10"
                }
              ].map((item, index) => (
                <motion.div key={index} variants={scaleIn}>
                  <Card className="h-full hover-elevate" data-testid={`card-feature-${index}`}>
                    <CardContent className="p-6">
                      <div className={`w-12 h-12 rounded-xl ${item.bg} flex items-center justify-center mb-4`}>
                        <item.icon className={`w-6 h-6 ${item.color}`} />
                      </div>
                      <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Collaboration Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <motion.div
            {...animationProps}
            variants={staggerContainer}
          >
            <motion.div variants={fadeInUp} className="text-center mb-16">
              <Badge className="mb-4" data-testid="badge-collab">
                <Handshake className="w-3 h-3 mr-1" />
                Collaboration
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-collab-title">
                When You Find Each Other, Cities Change
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto" data-testid="text-collab-description">
                Every partnership expands what's possible. Two churches covering the same neighborhood 
                can reach further together than either could alone.
              </p>
            </motion.div>

            <div className="grid lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
              {/* Ministry Area Partnerships */}
              <motion.div variants={fadeInLeft}>
                <Card className="h-full border-primary" data-testid="card-ministry-partnerships">
                  <CardContent className="p-8">
                    <Badge className="mb-4" data-testid="badge-primary-model">Primary Model</Badge>
                    <h3 className="text-2xl font-bold mb-4">Ministry Area Partnerships</h3>
                    <p className="text-muted-foreground mb-6">
                      Your ministry area is where God has placed you. When it overlaps with another 
                      church's territory, that's not competition—it's opportunity.
                    </p>
                    <div className="space-y-4 mb-6">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Target className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <h4 className="font-medium mb-1">Shared Territory</h4>
                          <p className="text-sm text-muted-foreground">
                            See where your ministry areas overlap and discover who's already 
                            working in your neighborhood
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Zap className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <h4 className="font-medium mb-1">Complementary Callings</h4>
                          <p className="text-sm text-muted-foreground">
                            You focus on youth, they run a food pantry. Together, you serve 
                            whole families.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Shield className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <h4 className="font-medium mb-1">Unified Presence</h4>
                          <p className="text-sm text-muted-foreground">
                            When the neighborhood sees churches working together, they see 
                            Christ's love in action
                          </p>
                        </div>
                      </div>
                    </div>
                    <Link href="/">
                      <Button className="w-full group" data-testid="button-find-partners">
                        Find Partners in Your Area
                        <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Facility Sharing Teaser */}
              <motion.div variants={fadeInRight}>
                <Card className="h-full hover-elevate" data-testid="card-facility-teaser">
                  <CardContent className="p-8">
                    <Badge variant="outline" className="mb-4" data-testid="badge-facility-model">
                      <Building2 className="w-3 h-3 mr-1" />
                      Facility Collaboration
                    </Badge>
                    <h3 className="text-2xl font-bold mb-4">One Body, Many Spaces</h3>
                    <p className="text-muted-foreground mb-6">
                      Most church buildings sit empty 80% of the week. What if your space could 
                      multiply the ministry impact across your city?
                    </p>
                    <div className="bg-muted/50 rounded-lg p-6 mb-6">
                      <p className="text-sm italic text-muted-foreground">
                        "A suburban megachurch opened their fellowship hall to a small inner-city 
                        recovery ministry three nights a week. Within a year, their own members 
                        started volunteering, and two people from their congregation entered recovery 
                        themselves. The partnership transformed both churches."
                      </p>
                    </div>
                    <Link href="/facility-sharing">
                      <Button variant="outline" className="w-full group" data-testid="button-facility-playbook">
                        <BookOpen className="w-4 h-4 mr-2" />
                        Read the Facility Collaboration Playbook
                        <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Data Intelligence */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <motion.div
            {...animationProps}
            variants={staggerContainer}
          >
            <motion.div variants={fadeInUp} className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-data-title">
                See Where Your Calling Meets Real Need
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto" data-testid="text-data-description">
                Your city's pain isn't hidden. We surface the data so you can respond with precision.
              </p>
            </motion.div>

            <motion.div 
              variants={staggerContainer}
              className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto"
            >
              {[
                {
                  title: "Crime Patterns",
                  description: "Where is violence concentrated? Where do property crimes cluster? Lead your prayers and presence to the hotspots.",
                  icon: Shield,
                  stat: "44 cities",
                  statLabel: "20M+ incidents mapped"
                },
                {
                  title: "Health Needs",
                  description: "Mental health. Substance abuse. Chronic disease. See where your wellness ministry or recovery program is most needed.",
                  icon: Heart,
                  stat: "45+ metrics",
                  statLabel: "Census tract level"
                },
                {
                  title: "Demographics",
                  description: "Who lives in your ministry area? Age, income, language—know your neighbors so you can serve them better.",
                  icon: Users,
                  stat: "71K+ tracts",
                  statLabel: "Nationwide coverage"
                }
              ].map((item, index) => (
                <motion.div key={index} variants={fadeInUp}>
                  <Card className="h-full text-center hover-elevate" data-testid={`card-data-${index}`}>
                    <CardContent className="p-6">
                      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                        <item.icon className="w-7 h-7 text-primary" />
                      </div>
                      <h3 className="font-semibold mb-2">{item.title}</h3>
                      <p className="text-sm text-muted-foreground mb-4">{item.description}</p>
                      <div className="pt-4 border-t">
                        <p className="text-2xl font-bold text-primary">{item.stat}</p>
                        <p className="text-xs text-muted-foreground">{item.statLabel}</p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <motion.div
            {...animationProps}
            variants={staggerContainer}
          >
            <motion.div variants={fadeInUp} className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-testimonial-title">
                Leaders Who Get It
              </h2>
              <p className="text-lg text-muted-foreground" data-testid="text-testimonial-subtitle">
                Pastors stepping into kingdom collaboration
              </p>
            </motion.div>

            <motion.div 
              variants={staggerContainer}
              className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto"
            >
              {[
                {
                  quote: "We've been praying for revival in our city for 15 years. Turns out, God was waiting for us to find each other first.",
                  name: "Mike Simmons",
                  role: "Lead Pastor",
                  church: "Covenant Church, Kansas City"
                },
                {
                  quote: "When I saw the map—really saw it—I realized we'd been thinking about our church in isolation. That had to change.",
                  name: "Jon Hazeltine",
                  role: "Senior Pastor",
                  church: "New Life Fellowship, Denver"
                },
                {
                  quote: "The platform didn't just show us who was nearby. It showed us who was already doing what we'd been trying to start alone.",
                  name: "JR Pittman",
                  role: "Executive Pastor",
                  church: "CrossPoint, Dallas"
                }
              ].map((testimonial, index) => (
                <motion.div 
                  key={index} 
                  variants={index % 2 === 0 ? fadeInLeft : fadeInRight}
                >
                  <Card className="h-full hover-elevate" data-testid={`card-testimonial-${index}`}>
                    <CardContent className="p-6">
                      <Quote className="w-8 h-8 text-primary/20 mb-4" />
                      <p className="text-muted-foreground italic mb-6">
                        "{testimonial.quote}"
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-bold text-primary">
                            {testimonial.name.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-sm">{testimonial.name}</p>
                          <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                          <p className="text-xs text-muted-foreground">{testimonial.church}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* What You Can Do */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <motion.div
            {...animationProps}
            variants={staggerContainer}
          >
            <motion.div variants={fadeInUp} className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-action-title">
                Step Into Your Calling
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto" data-testid="text-action-description">
                How will you move with the Body?
              </p>
            </motion.div>

            <motion.div 
              variants={staggerContainer}
              className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto"
            >
              {[
                {
                  title: "Add Your Church",
                  description: "Plant your flag on the map. Define your ministry area. Let others find you.",
                  icon: Building2,
                  link: "/churches/add",
                  buttonText: "Get Started"
                },
                {
                  title: "Lead a City Platform",
                  description: "Convene your region. Invite churches. Steward the movement.",
                  icon: Globe2,
                  link: "/apply-for-platform",
                  buttonText: "Apply to Lead"
                },
                {
                  title: "Join the Prayer Watch",
                  description: "Cover your city in intercession. Join the prayers already rising.",
                  icon: Heart,
                  link: "/",
                  buttonText: "Start Praying"
                }
              ].map((item, index) => (
                <motion.div key={index} variants={fadeInUp}>
                  <Card className="h-full hover-elevate" data-testid={`card-action-${index}`}>
                    <CardContent className="p-6 flex flex-col h-full">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                        <item.icon className="w-6 h-6 text-primary" />
                      </div>
                      <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                      <p className="text-sm text-muted-foreground mb-6 flex-grow">{item.description}</p>
                      <Link href={item.link}>
                        <Button variant="outline" className="w-full">
                          {item.buttonText}
                          <ChevronRight className="w-4 h-4 ml-2" />
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 bg-primary text-primary-foreground relative overflow-hidden">
        <motion.div 
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/5 via-transparent to-transparent"
          animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        
        <div className="container mx-auto px-4 relative">
          <motion.div
            {...animationProps}
            variants={staggerContainer}
            className="max-w-3xl mx-auto text-center"
          >
            <motion.div variants={fadeInUp}>
              <Quote className="w-10 h-10 mx-auto mb-6 opacity-50" />
            </motion.div>
            <motion.blockquote 
              variants={fadeInUp}
              className="text-2xl md:text-3xl font-medium italic mb-6"
              data-testid="text-final-quote"
            >
              "That they may all be one... so that the world may believe."
            </motion.blockquote>
            <motion.p 
              variants={fadeInUp}
              className="text-lg opacity-80 mb-2"
              data-testid="text-final-reference"
            >
              John 17:21
            </motion.p>
            <motion.p 
              variants={fadeInUp}
              className="text-xl opacity-90 mb-10 max-w-xl mx-auto"
              data-testid="text-final-message"
            >
              The world is watching. Your city is waiting. It's time to show them who you really are.
            </motion.p>
            <motion.div variants={fadeInUp}>
              <Link href="/">
                <Button size="lg" variant="secondary" className="group" data-testid="button-final-cta">
                  <MapPin className="w-4 h-4 mr-2" />
                  See the Body in Your City
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="md:col-span-2">
              <Link href="/about">
                <div className="flex items-center gap-2 cursor-pointer mb-4">
                  <img src={lightLogo} alt="The Churches" className="h-8 dark:hidden" />
                  <img src={darkLogo} alt="The Churches" className="h-8 hidden dark:block" />
                </div>
              </Link>
              <p className="text-sm text-muted-foreground max-w-sm" data-testid="text-footer-description">
                Uniting the Church to transform the city. One Body. One Spirit. One Hope for the World.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Platform</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/">
                    <span className="hover:text-foreground cursor-pointer" data-testid="link-footer-map">View Map</span>
                  </Link>
                </li>
                <li>
                  <Link href="/community">
                    <span className="hover:text-foreground cursor-pointer" data-testid="link-footer-community">Community</span>
                  </Link>
                </li>
                <li>
                  <Link href="/platforms">
                    <span className="hover:text-foreground cursor-pointer" data-testid="link-footer-platforms">City Platforms</span>
                  </Link>
                </li>
                <li>
                  <Link href="/facility-sharing">
                    <span className="hover:text-foreground cursor-pointer" data-testid="link-footer-facility">Facility Sharing</span>
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Get Involved</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/churches/add">
                    <span className="hover:text-foreground cursor-pointer" data-testid="link-footer-add">Add Your Church</span>
                  </Link>
                </li>
                <li>
                  <Link href="/apply-for-platform">
                    <span className="hover:text-foreground cursor-pointer" data-testid="link-footer-apply">Lead a Platform</span>
                  </Link>
                </li>
                <li>
                  <Link href="/login">
                    <span className="hover:text-foreground cursor-pointer" data-testid="link-footer-login">Sign In</span>
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
            <p data-testid="text-footer-copyright">
              The Churches Platform — Connecting the Body of Christ
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
