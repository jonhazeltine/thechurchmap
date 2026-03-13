import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, ShieldCheck, Shield, Users as UsersIcon, Edit, Trash2, MoreHorizontal, UserMinus, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";

interface UserProfile {
  id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
}

interface UserWithRoles {
  id: string;
  email?: string;
  created_at: string;
  last_sign_in_at?: string;
  is_super_admin: boolean;
  profile: UserProfile | null;
  platform_roles: any[];
  church_roles: any[];
}

interface UsersResponse {
  users: UserWithRoles[];
}

export default function SuperAdminUsers() {
  const [searchTerm, setSearchTerm] = useState("");
  const [userToDelete, setUserToDelete] = useState<UserWithRoles | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<UsersResponse>({
    queryKey: ["/api/admin/users"],
  });
  
  const users = data?.users;

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest('DELETE', `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "User deleted",
        description: "The user has been permanently deleted.",
      });
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete user",
        variant: "destructive",
      });
    },
  });

  const removeFromChurchMutation = useMutation({
    mutationFn: async ({ userId, churchId }: { userId: string; churchId: string }) => {
      return await apiRequest('DELETE', `/api/admin/users/${userId}/churches/${churchId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Removed from church",
        description: "The user has been removed from the church.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove user from church",
        variant: "destructive",
      });
    },
  });

  const handleDeleteUser = (user: UserWithRoles) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (userToDelete) {
      deleteUserMutation.mutate(userToDelete.id);
    }
  };

  // Show error if user doesn't have super admin access
  if (error) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle>Access Denied</CardTitle>
              <CardDescription>
                You need super admin privileges to access user management.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  const filteredUsers = users?.filter((user) =>
    user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.profile?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.profile?.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.profile?.last_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    total: users?.length || 0,
    superAdmins: users?.filter(u => u.is_super_admin).length || 0,
    platformAdmins: users?.filter(u => u.platform_roles?.length > 0).length || 0,
    churchAdmins: users?.filter(u => u.church_roles?.length > 0).length || 0,
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-super-admin-users">
              User Management
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage user roles and super admin access
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <UsersIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-users">{stats.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Super Admins</CardTitle>
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-super-admins">{stats.superAdmins}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Platform Admins</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-platform-admins">{stats.platformAdmins}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Church Admins</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-church-admins">{stats.churchAdmins}</div>
            </CardContent>
          </Card>
        </div>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>All Users</CardTitle>
                <CardDescription>
                  View and manage user roles and permissions
                </CardDescription>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-users"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredUsers && filteredUsers.length > 0 ? (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Roles</TableHead>
                      <TableHead>Last Sign In</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                        <TableCell>
                          <div className="font-medium">
                            {user.profile?.full_name || user.profile?.first_name || "Unknown User"}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {user.created_at ? `Joined ${formatDistanceToNow(new Date(user.created_at), { addSuffix: true })}` : ""}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm" data-testid={`text-email-${user.id}`}>
                            {user.email || "No email"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {user.is_super_admin && (
                              <Badge variant="default" className="gap-1">
                                <ShieldCheck className="w-3 h-3" />
                                Super Admin
                              </Badge>
                            )}
                            {user.platform_roles && user.platform_roles.length > 0 && (
                              <Badge variant="secondary" className="gap-1">
                                <Shield className="w-3 h-3" />
                                Platform Admin
                              </Badge>
                            )}
                            {user.church_roles && user.church_roles.length > 0 && (
                              <Badge variant="outline" className="gap-1">
                                Church Admin ({user.church_roles.length})
                              </Badge>
                            )}
                            {!user.is_super_admin && (!user.platform_roles || user.platform_roles.length === 0) && (!user.church_roles || user.church_roles.length === 0) && (
                              <Badge variant="outline">User</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {user.last_sign_in_at
                              ? formatDistanceToNow(new Date(user.last_sign_in_at), { addSuffix: true })
                              : "Never"}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                data-testid={`button-user-actions-${user.id}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => navigate(`/admin/users/${user.id}/edit`)}
                                data-testid={`button-edit-user-${user.id}`}
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                Edit User
                              </DropdownMenuItem>
                              {user.church_roles && user.church_roles.length > 0 && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                                    Remove from Church
                                  </DropdownMenuLabel>
                                  {user.church_roles.map((role: any) => (
                                    <DropdownMenuItem
                                      key={role.id}
                                      onClick={() => removeFromChurchMutation.mutate({
                                        userId: user.id,
                                        churchId: role.church_id,
                                      })}
                                      data-testid={`button-remove-from-church-${role.church_id}`}
                                    >
                                      <UserMinus className="h-4 w-4 mr-2" />
                                      {role.church?.name || 'Unknown Church'}
                                    </DropdownMenuItem>
                                  ))}
                                </>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleDeleteUser(user)}
                                className="text-destructive focus:text-destructive"
                                data-testid={`button-delete-user-${user.id}`}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete User
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12">
                <UsersIcon className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">No users found</h3>
                <p className="text-muted-foreground mt-2">
                  {searchTerm ? "Try a different search term" : "No users in the system"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delete User Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent data-testid="dialog-delete-user">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete User</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>
                  Are you sure you want to permanently delete{" "}
                  <strong>{userToDelete?.profile?.full_name || userToDelete?.profile?.first_name || userToDelete?.email || "this user"}</strong>?
                </p>
                <p className="text-destructive font-medium">
                  This action cannot be undone. All of this user's data will be permanently removed including:
                </p>
                <ul className="list-disc list-inside text-sm space-y-1 ml-2">
                  <li>Profile information</li>
                  <li>Church memberships and roles</li>
                  <li>Platform memberships and roles</li>
                  <li>Prayer requests they created</li>
                  <li>Community posts they authored</li>
                </ul>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteUserMutation.isPending}
                data-testid="button-confirm-delete"
              >
                {deleteUserMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete User
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
}
