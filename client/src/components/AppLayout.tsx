import { Header } from "@/components/Header";

interface AppLayoutProps {
  children: React.ReactNode;
  showHeader?: boolean;
}

export function AppLayout({ children, showHeader = true }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {showHeader && (
        <div className="hidden md:block sticky top-0 z-50">
          <Header />
        </div>
      )}
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}
