import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Shield, 
  Users, 
  TrendingUp, 
  CheckCircle2, 
  ExternalLink,
  Handshake,
  Star
} from "lucide-react";
import { IconBuildingChurch } from "@tabler/icons-react";

export default function AgentLandingPage() {
  return (
    <AppLayout>
      <div className="min-h-screen">
        {/* Hero Section */}
        <section className="py-16 bg-gradient-to-b from-primary/5 to-background relative overflow-hidden" data-testid="section-hero">
          {/* Background zig-zag growth arrow */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <svg 
              viewBox="0 0 400 300" 
              className="w-[600px] h-[450px] opacity-[0.1]"
              fill="none"
              stroke="currentColor"
              strokeWidth="18"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* Zig-zag growth line */}
              <path 
                d="M 40 240 L 120 180 L 180 220 L 280 80 L 360 80" 
                className="text-primary"
              />
              {/* Arrow head */}
              <path 
                d="M 335 55 L 360 80 L 335 105" 
                className="text-primary"
              />
            </svg>
          </div>
          <div className="container max-w-4xl mx-auto px-4 text-center relative z-10">
            <Badge variant="outline" className="mb-6">
              <IconBuildingChurch className="w-3 h-3 mr-1" />
              For Church-Attending Real Estate Agents
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold mb-6" data-testid="text-headline">
              This program is designed to grow your church relationships—not compete with them.
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">Keep your church connection. Gain a mission-powered lead engine. </p>
          </div>
        </section>

        {/* Body Copy Section */}
        <section className="py-12" data-testid="section-body">
          <div className="container max-w-3xl mx-auto px-4">
            <div className="prose prose-lg dark:prose-invert mx-auto">
              <p className="text-lg leading-relaxed mb-6">
                If you're thinking, "Great… another program stepping into my church," you're not wrong to be cautious.
              </p>
              <p className="text-lg leading-relaxed mb-6">This isn't about taking business out of your hands. It's about turning what's already happening in the church—relationships, trust, life events—into a partnership the church can celebrate publicly and promote confidently because it directly fuels the church's mission. </p>
              <p className="text-lg leading-relaxed mb-6">
                All of the relationships you have been nurturing will continue to work with you outside of this program. This is about capturing the opportunities beyond your current relationships and helping you to expand your business and advance the mission!
              </p>
              <p className="text-lg leading-relaxed font-medium text-primary mb-6">
                And if you attend this church, we want to protect what you've built.
              </p>
              <p className="text-lg leading-relaxed mb-6">
                Church networking is real. But the AARE Generous Giving model goes beyond networking: it creates a clear, trackable way for real estate transactions to fund mission, which gives church leaders a reason to talk about it, share it, and champion it. When leaders promote, the number of transactions doesn't just "trickle in"—it scales.
              </p>
            </div>
          </div>
        </section>

        {/* Church Member Agent Protection Section */}
        <section className="py-12 bg-card border-y" data-testid="section-protection">
          <div className="container max-w-4xl mx-auto px-4">
            <div className="text-center mb-10">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Shield className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-3xl font-bold mb-4">Church Member Agent Protection</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                If you're an agent who attends your church, you can be the primary agent for your church's program.
              </p>
            </div>

            <Card className="max-w-2xl mx-auto">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="w-5 h-5 text-yellow-500" />
                  Church-Approved Sponsor = Priority Access
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  We've created a way for church-attending agents to benefit from the program while helping the mission:
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>When you become a Church-Approved Platform Sponsor, you can become the sole recipient of platform referrals generated through your church's page.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>You'll be featured as the church's primary agent option—so the relationship stays local and trusted.</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Pricing Section */}
        <section className="py-12" data-testid="section-pricing">
          <div className="container max-w-4xl mx-auto px-4">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold mb-4">Church-Approved Sponsor Pricing</h2>
            </div>

            <Card className="max-w-2xl mx-auto">
              <CardContent className="pt-6">
                <div className="text-center mb-6">
                  <div className="text-4xl font-bold mb-2">Contact Us</div>
                  <p className="text-muted-foreground">for personalized pricing</p>
                </div>

                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
                  <h3 className="font-semibold text-green-800 dark:text-green-200 mb-2 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Referral Guarantee
                  </h3>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    If, after 12 months, you have not received a referral that closes, your platform listing becomes free until your first referral closes.
                  </p>
                </div>

                <div className="bg-muted/50 rounded-lg p-4 mb-6">
                  <p className="text-sm text-muted-foreground">
                    When your first referral closes, the program applies a standard <strong>25% referral fee</strong> on that closed transaction.
                  </p>
                </div>

                <div className="text-center text-sm text-muted-foreground italic">
                  You keep building your business. The church funds mission. The platform stays sustainable. Everyone wins without weirdness.
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-12 bg-card border-y" data-testid="section-benefits">
          <div className="container max-w-4xl mx-auto px-4">
            <div className="grid md:grid-cols-3 gap-6">
              <Card>
                <CardContent className="pt-6 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">Keep Your Relationships</h3>
                  <p className="text-sm text-muted-foreground">
                    Stay connected to the church community you've built trust with over the years.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <TrendingUp className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">Grow Your Business</h3>
                  <p className="text-sm text-muted-foreground">
                    Gain access to a mission-powered lead engine that scales with church promotion.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <Handshake className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">Support the Mission</h3>
                  <p className="text-sm text-muted-foreground">
                    Every transaction helps fund the church's mission in a trackable, meaningful way.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16" data-testid="section-cta">
          <div className="container max-w-2xl mx-auto px-4 text-center">
            <h2 className="text-2xl font-bold mb-4">Ready to Learn More?</h2>
            <p className="text-lg text-muted-foreground mb-6">
              AARE agents receive an 80% discount on platform fees!
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild data-testid="button-learn-generous-giving">
                <a href="https://aare.com/generous-giving" target="_blank" rel="noopener noreferrer">
                  Learn more about AARE
                  <ExternalLink className="w-4 h-4 ml-2" />
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild data-testid="button-learn-sponsorship">
                <a href="https://aare.com/sponsorship" target="_blank" rel="noopener noreferrer">
                  Learn About Platform Sponsorship
                  <ExternalLink className="w-4 h-4 ml-2" />
                </a>
              </Button>
            </div>
          </div>
        </section>

        {/* Fine Print Section */}
        <section className="py-8 border-t" data-testid="section-fine-print">
          <div className="container max-w-2xl mx-auto px-4">
            <p className="text-xs text-muted-foreground text-center">
              This sponsorship provides priority placement and referral routing through the platform. It does not restrict any client's choice of agent, and clients may always choose a different agent if they prefer.
            </p>
          </div>
        </section>

        {/* AARE Footer */}
        <section className="py-8 bg-card border-t" data-testid="section-aare-footer">
          <div className="container max-w-4xl mx-auto px-4 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/5 rounded-full">
              <Handshake className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">AARE</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Licensed brokerage and operating partner
            </p>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
