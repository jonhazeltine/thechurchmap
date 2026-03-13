import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Map, Users, Heart, MessageCircle, Sparkles, ChevronRight, ChevronLeft, X } from "lucide-react";

const TOUR_STORAGE_KEY = 'church_map_tour_completed';

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  tip: string;
}

const tourSteps: TourStep[] = [
  {
    id: 'map',
    title: 'Explore the Map',
    description: 'Discover churches in your area and across the country. Use the filters to find churches by their ministry focus, or search by location.',
    icon: <Map className="w-8 h-8" />,
    tip: 'Click on any church pin to see details, or zoom into a city network to explore local churches.',
  },
  {
    id: 'prayer',
    title: 'Prayer Mode',
    description: 'See community needs based on local health and demographic data. Prayer Mode shows you specific prayer focuses for different neighborhoods.',
    icon: <Heart className="w-8 h-8" />,
    tip: 'Toggle Prayer Mode from the map controls to see prayer prompts appear as you explore different areas.',
  },
  {
    id: 'community',
    title: 'Community Feed',
    description: 'Connect with other churches through posts, prayer requests, and celebrations. Share updates about what God is doing in your ministry.',
    icon: <MessageCircle className="w-8 h-8" />,
    tip: 'Visit the Community section to see posts from churches in your network and join the conversation.',
  },
  {
    id: 'collaboration',
    title: 'Find Partners',
    description: 'Discover churches with complementary ministries for collaboration. Our matching system helps you find partners based on shared callings and geographic overlap.',
    icon: <Users className="w-8 h-8" />,
    tip: 'Check your church profile to see collaboration opportunities with nearby churches.',
  },
];

interface WelcomeTourProps {
  onComplete?: () => void;
  forceShow?: boolean;
}

export function WelcomeTour({ onComplete, forceShow = false }: WelcomeTourProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [hasCheckedStorage, setHasCheckedStorage] = useState(false);

  useEffect(() => {
    if (forceShow) {
      setCurrentStep(0);
      setIsOpen(true);
      setHasCheckedStorage(true);
      return;
    }

    const hasCompletedTour = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!hasCompletedTour) {
      const timer = setTimeout(() => {
        setCurrentStep(0);
        setIsOpen(true);
      }, 1000);
      setHasCheckedStorage(true);
      return () => clearTimeout(timer);
    }
    setHasCheckedStorage(true);
  }, [forceShow]);

  const handleClose = () => {
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    setIsOpen(false);
    setCurrentStep(0);
    onComplete?.();
  };

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      handleClose();
    }
  };

  if (!hasCheckedStorage) {
    return null;
  }

  const step = tourSteps[currentStep];

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-welcome-tour">
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          data-testid="button-close-tour"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
        
        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <DialogHeader className="text-center space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                {step.icon}
              </div>
              <DialogTitle className="text-xl" data-testid={`text-tour-title-${step.id}`}>
                {step.title}
              </DialogTitle>
              <DialogDescription className="text-base leading-relaxed">
                {step.description}
              </DialogDescription>
            </DialogHeader>
            
            <div className="mt-4 rounded-lg bg-muted p-4">
              <div className="flex items-start gap-2">
                <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Tip: </span>
                  {step.tip}
                </p>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-center gap-1 mt-4">
          {tourSteps.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentStep(index)}
              className={`h-2 rounded-full transition-all ${
                index === currentStep 
                  ? 'w-6 bg-primary' 
                  : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
              }`}
              data-testid={`button-tour-dot-${index}`}
            />
          ))}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2 mt-4">
          <Button
            variant="ghost"
            onClick={handlePrev}
            disabled={currentStep === 0}
            className="gap-1"
            data-testid="button-tour-prev"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
          
          <div className="flex gap-2">
            {currentStep < tourSteps.length - 1 && (
              <Button
                variant="ghost"
                onClick={handleClose}
                data-testid="button-tour-skip"
              >
                Skip Tour
              </Button>
            )}
            <Button
              onClick={handleNext}
              className="gap-1"
              data-testid="button-tour-next"
            >
              {currentStep === tourSteps.length - 1 ? (
                "Get Started"
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useShouldShowTour(): boolean {
  const [shouldShow, setShouldShow] = useState(false);
  
  useEffect(() => {
    const hasCompletedTour = localStorage.getItem(TOUR_STORAGE_KEY);
    setShouldShow(!hasCompletedTour);
  }, []);
  
  return shouldShow;
}

export function resetTour() {
  localStorage.removeItem(TOUR_STORAGE_KEY);
}
