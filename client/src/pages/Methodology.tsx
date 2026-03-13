import { Link } from "wouter";
import { ArrowLeft, Database, BarChart3, MapPin, ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function Methodology() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold">Data Methodology</h1>
            <p className="text-sm text-muted-foreground">How we gather and present community data</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Info className="h-5 w-5" />
            <p className="text-sm">
              This page explains the data sources, thresholds, and methodology used to identify 
              community needs in prayer mode.
            </p>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              Data Sources
            </CardTitle>
            <CardDescription>
              We aggregate data from trusted government and public health sources
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 border rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">CDC PLACES</Badge>
                </div>
                <h3 className="font-medium">Health Metrics</h3>
                <p className="text-sm text-muted-foreground">
                  Census tract-level health data including chronic disease prevalence, 
                  mental health indicators, healthcare access, and social determinants of health.
                </p>
                <a 
                  href="https://www.cdc.gov/places/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  data-testid="link-cdc-places"
                >
                  Learn more <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="p-4 border rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Census ACS</Badge>
                </div>
                <h3 className="font-medium">Economic & Demographic Data</h3>
                <p className="text-sm text-muted-foreground">
                  American Community Survey data including poverty rates, unemployment, 
                  housing costs, education levels, and family structure.
                </p>
                <a 
                  href="https://www.census.gov/programs-surveys/acs" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  data-testid="link-census-acs"
                >
                  Learn more <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="p-4 border rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Local Police</Badge>
                </div>
                <h3 className="font-medium">Public Safety</h3>
                <p className="text-sm text-muted-foreground">
                  Crime statistics from local police departments, aggregated by census tract 
                  and normalized per 100,000 population for accurate comparison.
                </p>
              </div>

              <div className="p-4 border rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">TIGERweb</Badge>
                </div>
                <h3 className="font-medium">Geographic Boundaries</h3>
                <p className="text-sm text-muted-foreground">
                  Census tract boundaries and geographic data from the US Census Bureau's 
                  TIGERweb service for accurate spatial analysis.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Understanding Severity Thresholds
            </CardTitle>
            <CardDescription>
              How we determine when a metric indicates a concerning community need
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Rather than using arbitrary cutoffs, our thresholds are calibrated against 
              national averages. A metric is flagged as "concerning" when it significantly 
              exceeds what's typical for the United States as a whole.
            </p>

            <div className="space-y-4">
              <h4 className="font-medium">Severity Levels</h4>
              <div className="grid gap-2">
                <div className="flex items-center gap-3 p-2 rounded bg-green-500/10">
                  <div className="w-4 h-4 rounded-full bg-green-500" />
                  <div>
                    <span className="font-medium text-green-700 dark:text-green-400">Low</span>
                    <span className="text-sm text-muted-foreground ml-2">
                      Below or at national average
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-2 rounded bg-yellow-500/10">
                  <div className="w-4 h-4 rounded-full bg-yellow-400" />
                  <div>
                    <span className="font-medium text-yellow-700 dark:text-yellow-400">Moderate</span>
                    <span className="text-sm text-muted-foreground ml-2">
                      Slightly above national average
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-2 rounded bg-orange-500/10">
                  <div className="w-4 h-4 rounded-full bg-orange-500" />
                  <div>
                    <span className="font-medium text-orange-700 dark:text-orange-400">Concerning</span>
                    <span className="text-sm text-muted-foreground ml-2">
                      Notably above national average; prayer focus
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-2 rounded bg-red-500/10">
                  <div className="w-4 h-4 rounded-full bg-red-500" />
                  <div>
                    <span className="font-medium text-red-700 dark:text-red-400">Critical</span>
                    <span className="text-sm text-muted-foreground ml-2">
                      Significantly elevated; urgent need
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="economic">
                <AccordionTrigger>Economic & Family Thresholds</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="font-medium">Poverty Rate</p>
                        <p className="text-muted-foreground">National avg: ~12%</p>
                        <p className="text-muted-foreground">Concerning: 16%+</p>
                        <p className="text-muted-foreground">Critical: 22%+</p>
                      </div>
                      <div>
                        <p className="font-medium">Unemployment</p>
                        <p className="text-muted-foreground">National avg: ~4%</p>
                        <p className="text-muted-foreground">Concerning: 6%+</p>
                        <p className="text-muted-foreground">Critical: 8%+</p>
                      </div>
                      <div>
                        <p className="font-medium">Housing Cost Burden</p>
                        <p className="text-muted-foreground">National avg: ~30%</p>
                        <p className="text-muted-foreground">Concerning: 35%+</p>
                        <p className="text-muted-foreground">Critical: 42%+</p>
                      </div>
                      <div>
                        <p className="font-medium">Single-Parent Households</p>
                        <p className="text-muted-foreground">National avg: ~35%</p>
                        <p className="text-muted-foreground">Concerning: 38%+</p>
                        <p className="text-muted-foreground">Critical: 45%+</p>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="health">
                <AccordionTrigger>Health Metric Thresholds</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="font-medium">Depression</p>
                        <p className="text-muted-foreground">National avg: ~20%</p>
                        <p className="text-muted-foreground">Concerning: 23%+</p>
                        <p className="text-muted-foreground">Critical: 27%+</p>
                      </div>
                      <div>
                        <p className="font-medium">Diabetes</p>
                        <p className="text-muted-foreground">National avg: ~11%</p>
                        <p className="text-muted-foreground">Concerning: 13%+</p>
                        <p className="text-muted-foreground">Critical: 15%+</p>
                      </div>
                      <div>
                        <p className="font-medium">Obesity</p>
                        <p className="text-muted-foreground">National avg: ~33%</p>
                        <p className="text-muted-foreground">Concerning: 36%+</p>
                        <p className="text-muted-foreground">Critical: 40%+</p>
                      </div>
                      <div>
                        <p className="font-medium">Food Insecurity</p>
                        <p className="text-muted-foreground">National avg: ~12%</p>
                        <p className="text-muted-foreground">Concerning: 15%+</p>
                        <p className="text-muted-foreground">Critical: 20%+</p>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="safety">
                <AccordionTrigger>Public Safety Thresholds</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 text-sm">
                    <p className="text-muted-foreground mb-3">
                      Crime rates are measured per 100,000 population for fair comparison across areas.
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="font-medium">Assault Rate</p>
                        <p className="text-muted-foreground">National avg: ~250/100K</p>
                        <p className="text-muted-foreground">Concerning: 300+</p>
                        <p className="text-muted-foreground">Critical: 500+</p>
                      </div>
                      <div>
                        <p className="font-medium">Theft Rate</p>
                        <p className="text-muted-foreground">National avg: ~1,500/100K</p>
                        <p className="text-muted-foreground">Concerning: 1,800+</p>
                        <p className="text-muted-foreground">Critical: 2,500+</p>
                      </div>
                      <div>
                        <p className="font-medium">Burglary Rate</p>
                        <p className="text-muted-foreground">National avg: ~300/100K</p>
                        <p className="text-muted-foreground">Concerning: 380+</p>
                        <p className="text-muted-foreground">Critical: 550+</p>
                      </div>
                      <div>
                        <p className="font-medium">Drug Offense Rate</p>
                        <p className="text-muted-foreground">National avg: ~350/100K</p>
                        <p className="text-muted-foreground">Concerning: 420+</p>
                        <p className="text-muted-foreground">Critical: 650+</p>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              How Community Needs Are Selected
            </CardTitle>
            <CardDescription>
              Our approach to presenting diverse, meaningful prayer needs
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <Badge variant="outline" className="mt-0.5">1</Badge>
                <div>
                  <p className="font-medium text-foreground">Data Aggregation</p>
                  <p>
                    For each map view, we identify all census tracts visible on screen and 
                    calculate average values for each health, economic, and safety metric.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Badge variant="outline" className="mt-0.5">2</Badge>
                <div>
                  <p className="font-medium text-foreground">Threshold Filtering</p>
                  <p>
                    Only metrics that cross the "concerning" threshold are considered for 
                    display. This ensures we highlight genuine needs, not just any data point.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Badge variant="outline" className="mt-0.5">3</Badge>
                <div>
                  <p className="font-medium text-foreground">Category Balancing</p>
                  <p>
                    We ensure diversity by selecting one need from each category (Family, 
                    Economic, Safety, Health, Mental Health, Access) before filling remaining 
                    slots by severity. This prevents any single category from dominating.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Badge variant="outline" className="mt-0.5">4</Badge>
                <div>
                  <p className="font-medium text-foreground">Daily Rotation</p>
                  <p>
                    Prayer prompts rotate daily using a hash-based system, ensuring that 
                    returning visitors see fresh content while maintaining consistency 
                    during a single prayer session.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="text-center text-sm text-muted-foreground py-4">
          <p>
            Questions about our methodology?{" "}
            <a 
              href="mailto:support@thechurchmap.com" 
              className="text-primary hover:underline"
              data-testid="link-contact-email"
            >
              Contact us
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
