import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Users, Mail, MoreVertical, UserCheck, UserX, Shield, ShieldOff, LogOut } from "lucide-react";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useAuth } from "@/contexts/AuthContext";
import { usePlatformContext } from "@/contexts/PlatformContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { useLocation } from "wouter";

interface TeamMember {
  id: string;
  user_id: string;
  church_id: string;
  role: "church_admin" | "member";
  is_approved: boolean;
  is_claim_holder?: boolean;
  city_platform_id?: string | null;
  created_at: string;
  updated_at: string;
  profile: {
    id: string;
    full_name: string | null;
    first_name: string | null;
    last_initial: string | null;
  };
  email: string | null;
}

interface ChurchTeamProps {
  churchId: string;
}

// Helper function to extract API error message
function getErrorMessage(error: Error): string {
  try {
    // Error format from apiRequest: "400: {\"error\":\"message\"}"
    const match = error.message.match(/^\d+:\s*(.+)$/);
    if (match) {
      const jsonPart = match[1];
      const parsed = JSON.parse(jsonPart);
      if (parsed.error) {
        return parsed.error;
      }
    }
  } catch (e) {
    // If parsing fails, fall back to original message
  }
  return error.message;
}

export function ChurchTeam({ churchId }: ChurchTeamProps) {
  const { toast } = useToast();
  const { session, user } = useAuth();
  const { isSuperAdmin, isPlatformAdmin, churchAdminChurchIds } = useAdminAccess();
  const { platformId } = usePlatformContext();
  const [, navigate] = useLocation();
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [memberToPromote, setMemberToPromote] = useState<TeamMember | null>(null);
  const [memberToDemote, setMemberToDemote] = useState<TeamMember | null>(null);
  const [showReleaseDialog, setShowReleaseDialog] = useState(false);
  
  // Check if user can view team (must be admin of THIS church)
  const canViewTeam = isSuperAdmin || isPlatformAdmin || churchAdminChurchIds.includes(churchId);

  const { data: teamMembers, isLoading, error } = useQuery<TeamMember[]>({
    queryKey: ["/api/churches", churchId, "team"],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      const res = await fetch(`/api/churches/${churchId}/team`, { headers });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error("Not authorized to view team");
        }
        throw new Error("Failed to fetch team");
      }
      return res.json();
    },
    enabled: canViewTeam && !!session?.access_token,
  });

  // Mutation to update team member role
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: "church_admin" | "member" }) => {
      return apiRequest("PATCH", `/api/churches/${churchId}/team/${userId}`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches", churchId, "team"] });
      toast({
        title: "Role updated",
        description: "Team member role has been updated successfully.",
      });
      setMemberToPromote(null);
      setMemberToDemote(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  // Mutation to remove team member
  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/churches/${churchId}/team/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches", churchId, "team"] });
      toast({
        title: "Member removed",
        description: "Team member has been removed successfully.",
      });
      setMemberToRemove(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  // Get platform ID from current user's team member entry as fallback
  const currentUserMemberForPlatform = teamMembers?.find(m => m.user_id === user?.id);
  const effectivePlatformId = platformId || currentUserMemberForPlatform?.city_platform_id;

  // Mutation to release management (unclaim church)
  const releaseManagementMutation = useMutation({
    mutationFn: async () => {
      if (!effectivePlatformId) {
        throw new Error("No platform context available");
      }
      return apiRequest("POST", `/api/churches/${churchId}/claim/release`, { 
        platform_id: effectivePlatformId 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/churches", churchId, "team"] });
      queryClient.invalidateQueries({ queryKey: ["/api/churches", churchId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/access"] });
      toast({
        title: "Management released",
        description: "You have released management of this church. It can now be claimed by someone else.",
      });
      setShowReleaseDialog(false);
      // Navigate back to map or home
      navigate("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  // Check if current user is in the team as a church_admin
  const currentUserMember = teamMembers?.find(m => m.user_id === user?.id);
  const isCurrentUserAdmin = currentUserMember?.role === "church_admin";

  // Don't show component if user can't view team
  if (!canViewTeam) {
    return null;
  }

  // Don't show error for auth issues - just show empty state
  const isAuthError = error instanceof Error && 
    (error.message.includes("Not authorized") || error.message.includes("401") || error.message.includes("403"));

  return (
    <>
      <Card data-testid="card-church-team">
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Church Team
            </CardTitle>
            <CardDescription>Church administrators and members</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3 border rounded-md">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : (error && !isAuthError) ? (
            <div className="text-sm text-destructive text-center py-4">
              Failed to load team members
            </div>
          ) : teamMembers && teamMembers.length > 0 ? (
            <div className="space-y-2">
              {teamMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 border rounded-md hover-elevate"
                  data-testid={`team-member-${member.user_id}`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Users className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-medium truncate">
                          {member.profile?.full_name || member.email?.split('@')[0] || "Unknown User"}
                        </div>
                        <Badge
                          variant={member.role === "church_admin" ? "default" : "secondary"}
                          className="flex-shrink-0"
                          data-testid={`badge-role-${member.role}`}
                        >
                          {member.role === "church_admin" ? "Admin" : "Member"}
                        </Badge>
                        {member.is_claim_holder && (
                          <Badge
                            variant="outline"
                            className="flex-shrink-0 border-primary/50 text-primary"
                            data-testid={`badge-claim-holder-${member.user_id}`}
                          >
                            Claim Holder
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        {member.email && (
                          <>
                            <Mail className="w-3 h-3" />
                            <span className="truncate">{member.email}</span>
                          </>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Joined {formatDistanceToNow(new Date(member.created_at), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                  
                  {/* Action menu */}
                  {canViewTeam && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="flex-shrink-0"
                          data-testid={`button-actions-${member.user_id}`}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {member.role === "member" && (
                          <DropdownMenuItem
                            onClick={() => setMemberToPromote(member)}
                            data-testid={`action-promote-${member.user_id}`}
                          >
                            <Shield className="w-4 h-4 mr-2" />
                            Promote to Admin
                          </DropdownMenuItem>
                        )}
                        {member.role === "church_admin" && (
                          <DropdownMenuItem
                            onClick={() => setMemberToDemote(member)}
                            data-testid={`action-demote-${member.user_id}`}
                          >
                            <ShieldOff className="w-4 h-4 mr-2" />
                            Demote to Member
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => setMemberToRemove(member)}
                          className="text-destructive focus:text-destructive"
                          data-testid={`action-remove-${member.user_id}`}
                        >
                          <UserX className="w-4 h-4 mr-2" />
                          Remove from Team
                        </DropdownMenuItem>
                        {/* Show Release Management option only for current user if they're a church_admin */}
                        {member.user_id === user?.id && member.role === "church_admin" && (platformId || member.city_platform_id) && (
                          <DropdownMenuItem
                            onClick={() => setShowReleaseDialog(true)}
                            className="text-destructive focus:text-destructive"
                            data-testid="action-release-management"
                          >
                            <LogOut className="w-4 h-4 mr-2" />
                            Release Management
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-md">
              No team members yet
            </div>
          )}
        </CardContent>
      </Card>

      {/* Promote to Admin Dialog */}
      <AlertDialog open={!!memberToPromote} onOpenChange={() => setMemberToPromote(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Promote to Church Admin</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to promote {memberToPromote?.profile?.full_name || "this user"} to church admin? 
              They will be able to manage church information, team members, and ministry areas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-promote">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (memberToPromote) {
                  updateRoleMutation.mutate({
                    userId: memberToPromote.user_id,
                    role: "church_admin",
                  });
                }
              }}
              data-testid="button-confirm-promote"
            >
              Promote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Demote to Member Dialog */}
      <AlertDialog open={!!memberToDemote} onOpenChange={() => setMemberToDemote(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Demote to Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to demote {memberToDemote?.profile?.full_name || "this user"} to member? 
              They will lose access to church management features.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-demote">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (memberToDemote) {
                  updateRoleMutation.mutate({
                    userId: memberToDemote.user_id,
                    role: "member",
                  });
                }
              }}
              data-testid="button-confirm-demote"
            >
              Demote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Member Dialog */}
      <AlertDialog open={!!memberToRemove} onOpenChange={() => setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {memberToRemove?.profile?.full_name || "this user"} from the team? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-remove">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (memberToRemove) {
                  removeMemberMutation.mutate(memberToRemove.user_id);
                }
              }}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-remove"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Release Management Dialog */}
      <AlertDialog open={showReleaseDialog} onOpenChange={setShowReleaseDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release Church Management</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to release management of this church? This will:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Remove you as an administrator</li>
                <li>Allow someone else to claim this church</li>
                <li>Keep all church information intact</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-release">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => releaseManagementMutation.mutate()}
              className="bg-destructive text-destructive-foreground"
              disabled={releaseManagementMutation.isPending}
              data-testid="button-confirm-release"
            >
              {releaseManagementMutation.isPending ? "Releasing..." : "Release Management"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
