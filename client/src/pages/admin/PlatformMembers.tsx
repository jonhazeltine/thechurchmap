import { useState, useRef, useEffect } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { usePlatformAccess } from "@/hooks/useAdminAccess";
import { usePlatformNavigation } from "@/hooks/usePlatformNavigation";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CityPlatform, CityPlatformRole, CityPlatformUserWithProfile } from "@shared/schema";
import { ArrowLeft, Users, UserPlus, Trash2, Loader2, Shield, Building, Search, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface PlatformUsersResponse {
  platform: Pick<CityPlatform, 'id' | 'name'>;
  users: CityPlatformUserWithProfile[];
}

interface AllUsersResponse {
  users: Array<{
    id: string;
    email: string;
    full_name?: string;
  }>;
}

const ROLE_LABELS: Record<CityPlatformRole, { label: string; description: string }> = {
  super_admin: { label: "Super Admin", description: "Full system access" },
  platform_owner: { label: "Platform Owner", description: "Full platform control" },
  platform_admin: { label: "Platform Admin", description: "Can manage churches and members" },
  church_admin: { label: "Church Admin", description: "Manages a specific church" },
  member: { label: "Member", description: "Basic platform access" },
};

const ROLE_COLORS: Record<CityPlatformRole, string> = {
  super_admin: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  platform_owner: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  platform_admin: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  church_admin: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  member: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
};

function getInitials(name: string | null | undefined, email?: string): string {
  if (name) {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }
  if (email) {
    return email.substring(0, 2).toUpperCase();
  }
  return "??";
}

function getDisplayName(profile?: CityPlatformUserWithProfile['profile']): string {
  if (!profile) return "Unknown User";
  if (profile.full_name) return profile.full_name;
  if (profile.first_name || profile.last_name) {
    return [profile.first_name, profile.last_name].filter(Boolean).join(' ');
  }
  return profile.email || "Unknown User";
}

export default function PlatformMembers() {
  const { id: platformId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { loading: authLoading } = useAuth();
  const { hasAccess, role: currentUserRole, isSuperAdmin, isLoading: accessLoading } = usePlatformAccess(platformId);
  const { buildPlatformUrl } = usePlatformNavigation();

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<CityPlatformRole>("member");
  const [selectedChurchId, setSelectedChurchId] = useState<string>("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const dialogRef = useRef<HTMLDivElement>(null);
  const [dialogMounted, setDialogMounted] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<PlatformUsersResponse>({
    queryKey: [`/api/admin/city-platforms/${platformId}/users`],
    enabled: !!platformId && (hasAccess || isSuperAdmin) && !accessLoading,
  });

  const { data: allUsersData, isLoading: loadingAllUsers, refetch: refetchUsers } = useQuery<AllUsersResponse>({
    queryKey: ['/api/admin/users'],
    enabled: addDialogOpen,
    staleTime: 0, // Always refetch when dialog opens
  });

  const { data: churchesData } = useQuery<{ churches: Array<{ church: { id: string; name: string } }> }>({
    queryKey: [`/api/admin/city-platforms/${platformId}/churches`],
    enabled: !!platformId && selectedRole === 'church_admin',
  });

  const addUserMutation = useMutation({
    mutationFn: async (data: { user_id: string; role: CityPlatformRole; church_id?: string | null }) => {
      return apiRequest("POST", `/api/admin/city-platforms/${platformId}/users`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/users`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/dashboard`] });
      toast({
        title: "User Added",
        description: "The user has been added to the platform.",
      });
      setAddDialogOpen(false);
      setSelectedUserId("");
      setSelectedRole("member");
      setSelectedChurchId("");
    },
    onError: (error: Error) => {
      const message = error.message || "Failed to add user";
      toast({
        title: "Error",
        description: message.includes("409") ? "User is already a member of this platform" : message,
        variant: "destructive",
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: { role?: CityPlatformRole; is_active?: boolean; church_id?: string | null; can_manage_boundaries?: boolean } }) => {
      return apiRequest("PATCH", `/api/admin/city-platforms/${platformId}/users/${userId}`, data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/users`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/dashboard`] });
      // Invalidate admin access cache if boundary permission was changed
      // so the affected user's access is immediately updated
      if (variables.data.can_manage_boundaries !== undefined) {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/access'] });
      }
      toast({
        title: "User Updated",
        description: variables.data.can_manage_boundaries !== undefined 
          ? "Boundary management permission updated."
          : "The user's role has been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user",
        variant: "destructive",
      });
    },
  });

  const removeUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/admin/city-platforms/${platformId}/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/users`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/city-platforms/${platformId}/dashboard`] });
      toast({
        title: "User Removed",
        description: "The user has been removed from the platform.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove user",
        variant: "destructive",
      });
    },
  });

  const handleAddUser = () => {
    if (!selectedUserId) {
      toast({
        title: "Select a user",
        description: "Please select a user to add to the platform.",
        variant: "destructive",
      });
      return;
    }

    if (selectedRole === 'church_admin' && !selectedChurchId) {
      toast({
        title: "Select a church",
        description: "Church admin role requires selecting a church.",
        variant: "destructive",
      });
      return;
    }

    addUserMutation.mutate({
      user_id: selectedUserId,
      role: selectedRole,
      church_id: selectedRole === 'church_admin' ? selectedChurchId : null,
    });
  };

  const handleRoleChange = (userId: string, newRole: CityPlatformRole) => {
    updateUserMutation.mutate({ userId, data: { role: newRole } });
  };

  const canManageUser = (targetRole: CityPlatformRole): boolean => {
    if (isSuperAdmin) return true;
    
    const roleHierarchy: Record<CityPlatformRole, number> = {
      super_admin: 5,
      platform_owner: 4,
      platform_admin: 3,
      church_admin: 2,
      member: 1,
    };

    const currentLevel = roleHierarchy[currentUserRole as CityPlatformRole] || 0;
    const targetLevel = roleHierarchy[targetRole] || 0;

    return currentLevel > targetLevel;
  };

  const getAssignableRoles = (): CityPlatformRole[] => {
    if (isSuperAdmin) {
      return ['platform_owner', 'platform_admin', 'church_admin', 'member'];
    }
    if (currentUserRole === 'platform_owner') {
      return ['platform_admin', 'church_admin', 'member'];
    }
    if (currentUserRole === 'platform_admin') {
      return ['church_admin', 'member'];
    }
    return [];
  };

  const existingUserIds = new Set(data?.users?.map(u => u.user_id) || []);
  const availableUsers = allUsersData?.users?.filter(u => 
    !existingUserIds.has(u.id) && 
    (u.email?.toLowerCase().includes(searchTerm.toLowerCase()) || 
     u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];

  const filteredUsers = data?.users?.filter(u => 
    filterRole === 'all' || u.role === filterRole
  ) || [];

  if (authLoading || accessLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  if (!hasAccess && !isSuperAdmin) {
    return (
      <AdminLayout>
        <div className="p-8">
          <div className="text-center py-16">
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-4">
              You don't have permission to manage members for this platform.
            </p>
            <Button asChild variant="outline">
              <Link href={buildPlatformUrl("/admin/my-platforms")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to My Platforms
              </Link>
            </Button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <div className="p-8">
          <div className="text-center py-16">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-xl font-semibold mb-2">Error Loading Members</h2>
            <p className="text-muted-foreground mb-4">
              {(error as Error).message || "Failed to load platform members"}
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => refetch()}>
                Try Again
              </Button>
              <Button variant="ghost" asChild>
                <Link href={`/admin/platform/${platformId}`}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-6">
          <Button variant="ghost" size="sm" asChild className="mb-4">
            <Link href={`/admin/platform/${platformId}`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
        </div>

        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
              Platform Members
            </h1>
            <p className="text-muted-foreground">
              {data?.platform?.name || "Loading..."} - Manage platform users and roles
            </p>
          </div>
          
          <Dialog open={addDialogOpen} onOpenChange={(open) => {
            setAddDialogOpen(open);
            if (open) {
              // Force refetch when dialog opens
              queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
            } else {
              setDialogMounted(false);
            }
          }}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-member">
                <UserPlus className="h-4 w-4 mr-2" />
                Add Member
              </Button>
            </DialogTrigger>
            <DialogContent 
              className="sm:max-w-[500px] overflow-visible" 
              ref={dialogRef}
              onAnimationEnd={() => setDialogMounted(true)}
            >
              <DialogHeader>
                <DialogTitle>Add Platform Member</DialogTitle>
                <DialogDescription>
                  Add an existing user to this platform with a specific role.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="user-search">Search Users</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="user-search"
                      placeholder="Search by email or name..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                      data-testid="input-user-search"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Select User</Label>
                  {loadingAllUsers ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : availableUsers.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-4">
                      {searchTerm ? "No users found matching your search" : "No users available to add"}
                    </div>
                  ) : (
                    <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                      <SelectTrigger data-testid="select-user">
                        <SelectValue placeholder="Select a user..." />
                      </SelectTrigger>
                      <SelectContent container={dialogMounted ? dialogRef.current : undefined}>
                        {availableUsers.slice(0, 50).map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            <div className="flex flex-col">
                              <span>{user.full_name || user.email}</span>
                              {user.full_name && (
                                <span className="text-xs text-muted-foreground">{user.email}</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as CityPlatformRole)}>
                    <SelectTrigger data-testid="select-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent container={dialogMounted ? dialogRef.current : undefined}>
                      {getAssignableRoles().map((role) => (
                        <SelectItem key={role} value={role}>
                          <div className="flex flex-col">
                            <span>{ROLE_LABELS[role].label}</span>
                            <span className="text-xs text-muted-foreground">{ROLE_LABELS[role].description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedRole === 'church_admin' && (
                  <div className="space-y-2">
                    <Label>Assign to Church</Label>
                    <Select value={selectedChurchId} onValueChange={setSelectedChurchId}>
                      <SelectTrigger data-testid="select-church">
                        <SelectValue placeholder="Select a church..." />
                      </SelectTrigger>
                      <SelectContent container={dialogMounted ? dialogRef.current : undefined}>
                        {churchesData?.churches?.map((item) => (
                          <SelectItem key={item.church.id} value={item.church.id}>
                            {item.church.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => setAddDialogOpen(false)}
                  data-testid="button-cancel-add"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleAddUser}
                  disabled={!selectedUserId || addUserMutation.isPending}
                  data-testid="button-confirm-add"
                >
                  {addUserMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add Member
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Members
                </CardTitle>
                <CardDescription>
                  {filteredUsers.length} member{filteredUsers.length !== 1 ? 's' : ''} in this platform
                </CardDescription>
              </div>
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger className="w-[180px]" data-testid="select-filter-role">
                  <SelectValue placeholder="Filter by role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="platform_owner">Platform Owners</SelectItem>
                  <SelectItem value="platform_admin">Platform Admins</SelectItem>
                  <SelectItem value="church_admin">Church Admins</SelectItem>
                  <SelectItem value="member">Members</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="h-8 w-24" />
                  </div>
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12 border rounded-lg border-dashed">
                <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground">No members found</p>
                <p className="text-sm text-muted-foreground mb-4">
                  {filterRole !== 'all' ? "Try changing the filter" : "Add members to get started"}
                </p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Church</TableHead>
                      {isSuperAdmin && <TableHead>Boundaries</TableHead>}
                      <TableHead>Added</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((platformUser) => {
                      const displayName = getDisplayName(platformUser.profile);
                      const canManage = canManageUser(platformUser.role);
                      
                      return (
                        <TableRow key={platformUser.id} data-testid={`row-member-${platformUser.user_id}`}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9">
                                <AvatarImage src={platformUser.profile?.avatar_url || undefined} />
                                <AvatarFallback>
                                  {getInitials(platformUser.profile?.full_name, platformUser.profile?.email)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <div className="font-medium truncate">{displayName}</div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {platformUser.profile?.email || "No email"}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {canManage ? (
                              <Select
                                value={platformUser.role}
                                onValueChange={(value) => handleRoleChange(platformUser.user_id, value as CityPlatformRole)}
                                disabled={updateUserMutation.isPending}
                              >
                                <SelectTrigger 
                                  className="w-[160px]" 
                                  data-testid={`select-role-${platformUser.user_id}`}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {getAssignableRoles().map((role) => (
                                    <SelectItem key={role} value={role}>
                                      <div className="flex items-center gap-2">
                                        <Shield className="h-3 w-3" />
                                        {ROLE_LABELS[role].label}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge className={ROLE_COLORS[platformUser.role]}>
                                {ROLE_LABELS[platformUser.role].label}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {platformUser.church ? (
                              <div className="flex items-center gap-1 text-sm">
                                <Building className="h-3 w-3 text-muted-foreground" />
                                <span className="truncate max-w-[120px]">{platformUser.church.name}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          {isSuperAdmin && (
                            <TableCell>
                              {['platform_owner', 'platform_admin'].includes(platformUser.role) ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div>
                                      <Switch
                                        checked={platformUser.can_manage_boundaries ?? false}
                                        onCheckedChange={(checked) => {
                                          updateUserMutation.mutate({
                                            userId: platformUser.user_id,
                                            data: { can_manage_boundaries: checked }
                                          });
                                        }}
                                        disabled={updateUserMutation.isPending}
                                        data-testid={`switch-boundaries-${platformUser.user_id}`}
                                      />
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {platformUser.can_manage_boundaries 
                                      ? "Revoke boundary management access" 
                                      : "Grant boundary management access"}
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-muted-foreground text-xs">N/A</span>
                              )}
                            </TableCell>
                          )}
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {platformUser.created_at 
                                ? format(new Date(platformUser.created_at), 'MMM d, yyyy')
                                : '-'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={platformUser.is_active ? "default" : "secondary"}>
                              {platformUser.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {canManage && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled={removeUserMutation.isPending}
                                    data-testid={`button-remove-${platformUser.user_id}`}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remove Member</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to remove "{displayName}" from this platform?
                                      They will lose all access to this platform.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel data-testid="button-cancel-remove">Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => removeUserMutation.mutate(platformUser.user_id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      data-testid="button-confirm-remove"
                                    >
                                      Remove
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
