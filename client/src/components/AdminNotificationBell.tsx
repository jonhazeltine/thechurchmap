import { Bell } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";

interface PendingCounts {
  pendingChurchClaims: number;
  pendingMemberApprovals: number;
  pendingPrayers: number;
  pendingPlatformApplications: number;
  pendingComments: number;
}

export function AdminNotificationBell() {
  const { buildPlatformUrl } = usePlatformNavigation();
  
  const { data: counts, isLoading } = useQuery<PendingCounts>({
    queryKey: ["/api/admin/pending-counts"],
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const totalPending = counts
    ? counts.pendingChurchClaims +
      counts.pendingMemberApprovals +
      counts.pendingPrayers +
      counts.pendingPlatformApplications +
      counts.pendingComments
    : 0;

  const pendingItems = [
    {
      label: "Church Claims",
      count: counts?.pendingChurchClaims ?? 0,
      href: buildPlatformUrl("/admin/church-claims"),
    },
    {
      label: "Member Approvals",
      count: counts?.pendingMemberApprovals ?? 0,
      href: buildPlatformUrl("/admin/my-platforms"),
    },
    {
      label: "Platform Applications",
      count: counts?.pendingPlatformApplications ?? 0,
      href: buildPlatformUrl("/admin/platform-applications"),
    },
    {
      label: "Prayers to Review",
      count: counts?.pendingPrayers ?? 0,
      href: buildPlatformUrl("/admin/prayer?status=pending"),
    },
    {
      label: "Comments to Review",
      count: counts?.pendingComments ?? 0,
      href: buildPlatformUrl("/admin/moderation"),
    },
  ].filter((item) => item.count > 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-testid="button-admin-notifications"
        >
          <Bell className="h-5 w-5" />
          {totalPending > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1 flex items-center justify-center text-xs"
              data-testid="badge-pending-count"
            >
              {totalPending > 99 ? "99+" : totalPending}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Pending Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isLoading ? (
          <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
        ) : pendingItems.length === 0 ? (
          <DropdownMenuItem disabled className="text-muted-foreground">
            No pending items
          </DropdownMenuItem>
        ) : (
          pendingItems.map((item) => (
            <Link key={item.label} href={item.href}>
              <DropdownMenuItem
                className="flex justify-between cursor-pointer"
                data-testid={`link-pending-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <span>{item.label}</span>
                <Badge variant="secondary" className="ml-2">
                  {item.count}
                </Badge>
              </DropdownMenuItem>
            </Link>
          ))
        )}
        <DropdownMenuSeparator />
        <Link href="/admin/dashboard">
          <DropdownMenuItem
            className="cursor-pointer"
            data-testid="link-admin-dashboard"
          >
            View Dashboard
          </DropdownMenuItem>
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
