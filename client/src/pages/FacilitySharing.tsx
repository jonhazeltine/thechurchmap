import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Building2, 
  Calendar, 
  Users, 
  Shield, 
  ArrowLeft,
  CheckCircle2,
  Heart,
  Handshake,
  Clock,
  DollarSign,
  FileText,
  MessageSquare,
  MapPin,
  Lightbulb,
  AlertTriangle,
  BookOpen,
  ChevronRight
} from "lucide-react";

import lightLogo from "@assets/5_1764205464663.png";
import darkLogo from "@assets/The Churches White on Black (Presentation)_1764205730044.png";

const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

export default function FacilitySharing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/about">
            <div className="flex items-center gap-2 cursor-pointer" data-testid="link-logo-home">
              <img src={lightLogo} alt="The Churches" className="h-8 dark:hidden" />
              <img src={darkLogo} alt="The Churches" className="h-8 hidden dark:block" />
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/about">
              <Button variant="ghost" size="sm" data-testid="button-back-about">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to About
              </Button>
            </Link>
            <Link href="/">
              <Button size="sm" data-testid="button-view-map">
                View Map
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />
        <div className="container mx-auto px-4 relative">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="max-w-4xl mx-auto text-center"
          >
            <motion.div variants={fadeInUp}>
              <Badge className="mb-6" data-testid="badge-facility-hero">
                <Building2 className="w-3 h-3 mr-1" />
                Facility Collaboration Playbook
              </Badge>
            </motion.div>
            <motion.h1 
              variants={fadeInUp}
              className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6"
              data-testid="text-facility-hero-title"
            >
              One Body, Many Spaces
            </motion.h1>
            <motion.p 
              variants={fadeInUp}
              className="text-xl md:text-2xl text-muted-foreground mb-8"
              data-testid="text-facility-hero-subtitle"
            >
              When churches share their spaces, the whole city gains access to sacred ground.
            </motion.p>
            <motion.p 
              variants={fadeInUp}
              className="text-lg text-muted-foreground max-w-2xl mx-auto"
              data-testid="text-facility-hero-description"
            >
              This isn't about filling empty rooms. It's about stewarding what God has given 
              for the good of the whole Body and the transformation of your city.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Vision Section */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="max-w-4xl mx-auto"
          >
            <motion.h2 
              variants={fadeInUp}
              className="text-3xl font-bold text-center mb-12"
              data-testid="text-vision-title"
            >
              The Vision Behind Shared Spaces
            </motion.h2>
            
            <motion.div variants={fadeInUp} className="prose prose-lg dark:prose-invert mx-auto">
              <p className="text-lg text-muted-foreground leading-relaxed">
                Every church building represents years of sacrifice, prayer, and investment. 
                Yet most sit empty 80% of the week. Meanwhile, new ministries struggle to find 
                affordable space, recovery groups meet in basements, and community programs 
                compete for the same limited venues.
              </p>
              <p className="text-lg text-muted-foreground leading-relaxed">
                What if we saw our facilities not as "ours" but as entrusted to us for the 
                city's good? What if the building God provided for your congregation could 
                multiply its impact by hosting others who carry different callings but share 
                the same mission?
              </p>
              <p className="text-lg font-medium">
                This is facility collaboration: churches choosing abundance over scarcity, 
                generosity over protection, and kingdom over tribe.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Guiding Principles */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
          >
            <motion.h2 
              variants={fadeInUp}
              className="text-3xl font-bold text-center mb-4"
              data-testid="text-principles-title"
            >
              Guiding Principles
            </motion.h2>
            <motion.p 
              variants={fadeInUp}
              className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto"
            >
              These convictions shape how we approach facility sharing
            </motion.p>

            <motion.div 
              variants={staggerContainer}
              className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto"
            >
              {[
                {
                  icon: Heart,
                  title: "Generosity First",
                  description: "We lead with open hands, trusting that what we give multiplies beyond what we could hold alone."
                },
                {
                  icon: Shield,
                  title: "Honor & Protection",
                  description: "Clear agreements protect relationships. Good boundaries make good neighbors—and great partners."
                },
                {
                  icon: Handshake,
                  title: "Mutual Blessing",
                  description: "Both host and guest should flourish. If only one benefits, something's broken."
                },
                {
                  icon: Users,
                  title: "Relational Foundation",
                  description: "Contracts follow connection. We share space with people we know and trust, not strangers."
                },
                {
                  icon: Lightbulb,
                  title: "Kingdom Imagination",
                  description: "What could God do through your space that you never dreamed? Stay open to holy surprises."
                },
                {
                  icon: MapPin,
                  title: "City Perspective",
                  description: "Your building serves your neighborhood. Every guest ministry extends your impact without adding to your load."
                }
              ].map((principle, index) => (
                <motion.div key={index} variants={fadeInUp}>
                  <Card className="h-full hover-elevate" data-testid={`card-principle-${index}`}>
                    <CardContent className="p-6">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                        <principle.icon className="w-5 h-5 text-primary" />
                      </div>
                      <h3 className="font-semibold mb-2">{principle.title}</h3>
                      <p className="text-sm text-muted-foreground">{principle.description}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
          >
            <motion.h2 
              variants={fadeInUp}
              className="text-3xl font-bold text-center mb-4"
              data-testid="text-howit-works-title"
            >
              How It Works
            </motion.h2>
            <motion.p 
              variants={fadeInUp}
              className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto"
            >
              A practical framework for making facility sharing work
            </motion.p>

            <motion.div 
              variants={staggerContainer}
              className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto"
            >
              {/* Scheduling */}
              <motion.div variants={fadeInUp}>
                <Card data-testid="card-scheduling">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-blue-500" />
                      </div>
                      <h3 className="text-xl font-semibold">Scheduling</h3>
                    </div>
                    <ul className="space-y-3 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span>Define available times clearly (weeknights, Saturday mornings, etc.)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span>Use shared calendars with request/approval workflows</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span>Build in buffer time for setup and teardown</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span>Reserve priority for host church's core events</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Financial Models */}
              <motion.div variants={fadeInUp}>
                <Card data-testid="card-financial">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                        <DollarSign className="w-5 h-5 text-green-500" />
                      </div>
                      <h3 className="text-xl font-semibold">Financial Models</h3>
                    </div>
                    <ul className="space-y-3 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span><strong>Free:</strong> Kingdom generosity, especially for new plants or nonprofits</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span><strong>Cost Recovery:</strong> Cover utilities, cleaning, and wear—nothing more</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span><strong>Sliding Scale:</strong> Adjust based on guest ministry's capacity</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span><strong>Mutual Service:</strong> Trade space for volunteer hours or expertise</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Governance */}
              <motion.div variants={fadeInUp}>
                <Card data-testid="card-governance">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-purple-500" />
                      </div>
                      <h3 className="text-xl font-semibold">Governance</h3>
                    </div>
                    <ul className="space-y-3 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span>Simple facility use agreements (we have templates)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span>Clear expectations for cleanup, storage, and access</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span>Insurance requirements and liability coverage</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span>Designated contact person on each side</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Communication */}
              <motion.div variants={fadeInUp}>
                <Card data-testid="card-communication">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                        <MessageSquare className="w-5 h-5 text-amber-500" />
                      </div>
                      <h3 className="text-xl font-semibold">Communication</h3>
                    </div>
                    <ul className="space-y-3 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span>Regular check-ins (monthly or quarterly)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span>Quick feedback loops for issues</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span>Celebrate wins together—shared stories build trust</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span>Address tensions early before they become conflicts</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Getting Started Checklist */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="max-w-3xl mx-auto"
          >
            <motion.h2 
              variants={fadeInUp}
              className="text-3xl font-bold text-center mb-4"
              data-testid="text-checklist-title"
            >
              Getting Started Checklist
            </motion.h2>
            <motion.p 
              variants={fadeInUp}
              className="text-center text-muted-foreground mb-12"
            >
              Ready to open your doors? Here's your roadmap.
            </motion.p>

            <motion.div variants={staggerContainer} className="space-y-4">
              {[
                "Pray as a leadership team about the vision for shared space",
                "Inventory your available spaces and realistic time windows",
                "Identify 1-2 trusted church partners to start with",
                "Have a coffee conversation about mutual needs and expectations",
                "Draft a simple facility use agreement together",
                "Do a trial period (3-6 months) before committing long-term",
                "Create feedback rhythms and celebrate early wins",
                "Expand gradually as trust and systems mature"
              ].map((item, index) => (
                <motion.div 
                  key={index}
                  variants={fadeInUp}
                  className="flex items-start gap-4 p-4 rounded-lg bg-muted/50 hover-elevate"
                  data-testid={`checklist-item-${index}`}
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-primary">{index + 1}</span>
                  </div>
                  <p className="text-sm pt-1">{item}</p>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Common Concerns */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
          >
            <motion.h2 
              variants={fadeInUp}
              className="text-3xl font-bold text-center mb-4"
              data-testid="text-concerns-title"
            >
              Common Concerns (And How to Address Them)
            </motion.h2>
            <motion.p 
              variants={fadeInUp}
              className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto"
            >
              We've heard these questions. Here's what we've learned.
            </motion.p>

            <motion.div 
              variants={staggerContainer}
              className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto"
            >
              {[
                {
                  concern: "What if they damage our space?",
                  response: "Clear agreements, security deposits, and designated contacts prevent most issues. Start with trusted partners and expand from there."
                },
                {
                  concern: "Our congregation might feel displaced.",
                  response: "Communication is key. Share the vision, involve members in welcoming guests, and protect your core gathering times."
                },
                {
                  concern: "It's too much administrative work.",
                  response: "Start small. One partner, one space, one night a week. Systems develop as relationships mature."
                },
                {
                  concern: "What about theological differences?",
                  response: "You're sharing space, not doctrine. Focus on shared mission and establish clear boundaries about what happens in your building."
                },
                {
                  concern: "Insurance and liability scare us.",
                  response: "Most church insurance policies cover facility use with proper agreements. We can connect you with resources for this."
                },
                {
                  concern: "We barely have enough space for ourselves.",
                  response: "That's real. But consider: could your youth room host a weekday ESL class? Could your kitchen serve a community meal one morning? Start where you can."
                }
              ].map((item, index) => (
                <motion.div key={index} variants={fadeInUp}>
                  <Card className="h-full" data-testid={`card-concern-${index}`}>
                    <CardContent className="p-6">
                      <div className="flex items-start gap-3 mb-3">
                        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                        <h3 className="font-semibold text-sm">{item.concern}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground pl-8">{item.response}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Stories */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
          >
            <motion.h2 
              variants={fadeInUp}
              className="text-3xl font-bold text-center mb-4"
              data-testid="text-stories-title"
            >
              Stories From the Field
            </motion.h2>
            <motion.p 
              variants={fadeInUp}
              className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto"
            >
              Real churches doing this real work
            </motion.p>

            <motion.div 
              variants={staggerContainer}
              className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto"
            >
              {[
                {
                  title: "The Recovery Partnership",
                  story: "A suburban megachurch opened their fellowship hall to a small inner-city recovery ministry three nights a week. Within a year, their own members started volunteering, and two people from their congregation entered recovery themselves. The partnership transformed both churches."
                },
                {
                  title: "The Church Plant Launch",
                  story: "A 100-year-old downtown church with declining attendance invited a young church plant to share their Sunday mornings. The plant brought energy and new families; the established church offered wisdom and a spiritual home. Together, they're writing a new chapter."
                },
                {
                  title: "The Community Kitchen",
                  story: "Three churches within a mile of each other now share one commercial kitchen. They rotate hosting community meals, reducing costs and tripling their impact. What started as resource sharing became genuine friendship."
                }
              ].map((item, index) => (
                <motion.div key={index} variants={fadeInUp}>
                  <Card className="h-full hover-elevate" data-testid={`card-story-${index}`}>
                    <CardContent className="p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <BookOpen className="w-5 h-5 text-primary" />
                        <h3 className="font-semibold">{item.title}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">{item.story}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="max-w-3xl mx-auto text-center"
          >
            <motion.h2 
              variants={fadeInUp}
              className="text-3xl md:text-4xl font-bold mb-6"
              data-testid="text-cta-title"
            >
              Your Building Is Part of God's Plan for Your City
            </motion.h2>
            <motion.p 
              variants={fadeInUp}
              className="text-xl mb-8 opacity-90"
              data-testid="text-cta-description"
            >
              What kingdom work is waiting for the space you steward?
            </motion.p>
            <motion.div 
              variants={fadeInUp}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <Link href="/">
                <Button size="lg" variant="secondary" data-testid="button-cta-map">
                  <MapPin className="w-4 h-4 mr-2" />
                  Find Partner Churches
                </Button>
              </Link>
              <Link href="/churches/add">
                <Button size="lg" variant="outline" className="bg-transparent border-primary-foreground text-primary-foreground hover:bg-primary-foreground/10" data-testid="button-cta-add-church">
                  <Building2 className="w-4 h-4 mr-2" />
                  Add Your Church
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <Link href="/about">
              <div className="flex items-center gap-2 cursor-pointer">
                <img src={lightLogo} alt="The Churches" className="h-6 dark:hidden" />
                <img src={darkLogo} alt="The Churches" className="h-6 hidden dark:block" />
              </div>
            </Link>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/about">
                <span className="hover:text-foreground cursor-pointer">About</span>
              </Link>
              <Link href="/">
                <span className="hover:text-foreground cursor-pointer">Map</span>
              </Link>
              <Link href="/community">
                <span className="hover:text-foreground cursor-pointer">Community</span>
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">
              Part of The Churches platform
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
