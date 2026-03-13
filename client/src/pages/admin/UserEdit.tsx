import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, ShieldCheck, Key, Trash2, Plus, Building2, Mail, Calendar, Clock, User, Check, ChevronsUpDown } from "lucide-react";
import { z } from "zod";
import { cn } from "@/lib/utils";

interface UserProfile {
  id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
}

interface ChurchRole {
  id: string;
  user_id: string;
  church_id: string;
  role: 'member' | 'church_admin';
  is_approved: boolean;
  created_at: string;
  updated_at: string;
  church: {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    denomination: string | null;
  };
}

interface UserWithRoles {
  id: string;
  email?: string;
  created_at: string;
  last_sign_in_at?: string;
  is_super_admin: boolean;
  profile: UserProfile | null;
  platform_roles: any[];
  church_roles: ChurchRole[];
}

interface ChurchSummary {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  denomination: string | null;
}

const passwordSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export default function UserEdit() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [selectedChurchId, setSelectedChurchId] = useState<string>("");
  const [selectedChurchName, setSelectedChurchName] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<'member' | 'church_admin'>('member');
  const [churchSearchOpen, setChurchSearchOpen] = useState(false);
  const [churchSearchQuery, setChurchSearchQuery] = useState("");
  
  // Editable user info state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  // Fetch user details
  const { data: user, isLoading, error } = useQuery<UserWithRoles>({
    queryKey: ["/api/admin/users", id],
    queryFn: async () => {
      return await apiRequest("GET", `/api/admin/users/${id}`);
    },
    enabled: !!id,
  });

  // Initialize editable fields when user data loads
  useEffect(() => {
    if (user) {
      setFirstName(user.profile?.first_name || "");
      setLastName(user.profile?.last_name || "");
      setEmail(user.email || "");
    }
  }, [user]);

  // Search churches with debounced query
  const { data: searchResults = [] } = useQuery<ChurchSummary[]>({
    queryKey: ["/api/churches/search", churchSearchQuery],
    queryFn: async () => {
      if (churchSearchQuery.length < 2) return [];
      const res = await fetch(`/api/churches/search?q=${encodeURIComponent(churchSearchQuery)}`);
      if (!res.ok) throw new Error('Failed to search churches');
      return res.json();
    },
    enabled: churchSearchQuery.length >= 2,
  });

  // Update user info mutation
  const updateUserInfoMutation = useMutation({
    mutationFn: async (data: { first_name?: string; last_name?: string; email?: string }) => {
      return await apiRequest("PATCH", `/api/admin/users/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Success",
        description: "User information updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user information",
        variant: "destructive",
      });
    },
  });

  // Toggle super admin mutation
  const toggleSuperAdminMutation = useMutation({
    mutationFn: async (isSuperAdmin: boolean) => {
      return await apiRequest("PATCH", `/api/admin/users/${id}/role`, {
        super_admin: isSuperAdmin,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", id] });
      toast({
        title: "Success",
        description: "Super admin status updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update super admin status",
        variant: "destructive",
      });
    },
  });

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: async (newPassword: string) => {
      return await apiRequest("PATCH", `/api/admin/users/${id}/password`, {
        password: newPassword,
      });
    },
    onSuccess: () => {
      setIsPasswordDialogOpen(false);
      setPassword("");
      toast({
        title: "Success",
        description: "Password changed successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to change password",
        variant: "destructive",
      });
    },
  });

  // Assign to church mutation
  const assignChurchMutation = useMutation({
    mutationFn: async ({ churchId, role }: { churchId: string; role: 'member' | 'church_admin' }) => {
      return await apiRequest("POST", `/api/admin/users/${id}/churches`, {
        church_id: churchId,
        role,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", id] });
      setSelectedChurchId("");
      setSelectedRole('member');
      toast({
        title: "Success",
        description: "User assigned to church successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to assign user to church",
        variant: "destructive",
      });
    },
  });

  // Remove from church mutation
  const removeChurchMutation = useMutation({
    mutationFn: async (churchId: string) => {
      return await apiRequest("DELETE", `/api/admin/users/${id}/churches/${churchId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", id] });
      toast({
        title: "Success",
        description: "User removed from church successfully",
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

  const handlePasswordChange = () => {
    const validation = passwordSchema.safeParse({ password });
    if (!validation.success) {
      toast({
        title: "Validation Error",
        description: validation.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }
    changePasswordMutation.mutate(password);
  };

  const handleAssignChurch = () => {
    if (!selectedChurchId) {
      toast({
        title: "Validation Error",
        description: "Please select a church",
        variant: "destructive",
      });
      return;
    }
    assignChurchMutation.mutate({ churchId: selectedChurchId, role: selectedRole });
    
    // Reset form after assignment
    setSelectedChurchId("");
    setSelectedChurchName("");
    setSelectedRole('member');
  };

  const handleSaveUserInfo = () => {
    // Validate email format
    if (email && !email.includes('@')) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    const updates: { first_name?: string; last_name?: string; email?: string } = {};
    
    if (firstName !== (user?.profile?.first_name || "")) {
      updates.first_name = firstName;
    }
    if (lastName !== (user?.profile?.last_name || "")) {
      updates.last_name = lastName;
    }
    if (email !== (user?.email || "")) {
      updates.email = email;
    }

    if (Object.keys(updates).length === 0) {
      toast({
        title: "No Changes",
        description: "No changes to save",
      });
      return;
    }

    updateUserInfoMutation.mutate(updates);
  };

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

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (!user) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle>User Not Found</CardTitle>
              <CardDescription>
                The requested user could not be found.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/admin/users")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-user-edit">
              Edit User
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage user permissions and church assignments
            </p>
          </div>
        </div>

        {/* User Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              User Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="first-name" className="text-sm font-medium flex items-center gap-2">
                  <User className="h-4 w-4" />
                  First Name
                </Label>
                <Input
                  id="first-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Enter first name"
                  data-testid="input-first-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="last-name" className="text-sm font-medium flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Last Name
                </Label>
                <Input
                  id="last-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Enter last name"
                  data-testid="input-last-name"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="email" className="text-sm font-medium flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter email address"
                  data-testid="input-email"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Created
                </Label>
                <div className="text-sm text-muted-foreground" data-testid="text-user-created">
                  {user.created_at && !isNaN(new Date(user.created_at).getTime())
                    ? formatDistanceToNow(new Date(user.created_at), { addSuffix: true })
                    : "Unknown"}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Last Sign In
                </Label>
                <div className="text-sm text-muted-foreground" data-testid="text-user-last-signin">
                  {user.last_sign_in_at && !isNaN(new Date(user.last_sign_in_at).getTime())
                    ? formatDistanceToNow(new Date(user.last_sign_in_at), { addSuffix: true })
                    : "Never"}
                </div>
              </div>
            </div>
            
            <div className="flex justify-end pt-4 border-t">
              <Button
                onClick={handleSaveUserInfo}
                disabled={updateUserInfoMutation.isPending}
                data-testid="button-save-user-info"
              >
                {updateUserInfoMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Super Admin Toggle */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Super Admin Access
            </CardTitle>
            <CardDescription>
              Grant or revoke super admin privileges for this user
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="super-admin-toggle">Super Admin Status</Label>
                <div className="text-sm text-muted-foreground">
                  Super admins have full system access
                </div>
              </div>
              <Switch
                id="super-admin-toggle"
                checked={user.is_super_admin}
                onCheckedChange={(checked) => toggleSuperAdminMutation.mutate(checked)}
                disabled={toggleSuperAdminMutation.isPending}
                data-testid="switch-super-admin"
              />
            </div>
          </CardContent>
        </Card>

        {/* Password Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Password Management
            </CardTitle>
            <CardDescription>
              Reset the user's password
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="button-change-password">
                  <Key className="h-4 w-4 mr-2" />
                  Change Password
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Change User Password</DialogTitle>
                  <DialogDescription>
                    Enter a new password for {user.profile?.full_name || user.email}. Minimum 6 characters.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="Enter new password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      data-testid="input-new-password"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsPasswordDialogOpen(false);
                      setPassword("");
                    }}
                    data-testid="button-cancel-password"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handlePasswordChange}
                    disabled={changePasswordMutation.isPending || !password}
                    data-testid="button-save-password"
                  >
                    {changePasswordMutation.isPending ? "Saving..." : "Save Password"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* Church Assignments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Church Assignments
            </CardTitle>
            <CardDescription>
              Manage which churches this user is assigned to
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Add Church Assignment */}
            <div className="space-y-4">
              <Label>Add Church Assignment</Label>
              <div className="flex gap-2">
                {/* Searchable Church Selector */}
                <Popover open={churchSearchOpen} onOpenChange={setChurchSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={churchSearchOpen}
                      className="flex-1 justify-between"
                      data-testid="select-church"
                    >
                      {selectedChurchName || "Search and select a church..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[500px] p-0">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Type to search churches..."
                        value={churchSearchQuery}
                        onValueChange={setChurchSearchQuery}
                        data-testid="input-search-churches"
                      />
                      <CommandList>
                        {churchSearchQuery.length < 2 ? (
                          <CommandEmpty>Type at least 2 characters to search...</CommandEmpty>
                        ) : searchResults && searchResults.length > 0 ? (
                          <CommandGroup>
                            {searchResults
                              .filter((church) => !user?.church_roles.some((role) => role.church_id === church.id))
                              .map((church) => (
                                <CommandItem
                                  key={church.id}
                                  value={church.id}
                                  onSelect={() => {
                                    setSelectedChurchId(church.id);
                                    setSelectedChurchName(church.name);
                                    setChurchSearchOpen(false);
                                    setChurchSearchQuery("");
                                  }}
                                  data-testid={`option-church-${church.id}`}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      selectedChurchId === church.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <Building2 className="w-4 h-4 mr-2" />
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">{church.name}</div>
                                    {church.address && (
                                      <div className="text-sm text-muted-foreground truncate">
                                        {church.address}
                                      </div>
                                    )}
                                    {(church.city || church.state || church.denomination) && (
                                      <div className="text-xs text-muted-foreground truncate">
                                        {[church.city, church.state, church.zip, church.denomination]
                                          .filter(Boolean)
                                          .join(" • ")}
                                      </div>
                                    )}
                                  </div>
                                </CommandItem>
                              ))}
                          </CommandGroup>
                        ) : (
                          <CommandEmpty>No churches found</CommandEmpty>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {/* Role Selector */}
                <Select value={selectedRole} onValueChange={(value: 'member' | 'church_admin') => setSelectedRole(value)}>
                  <SelectTrigger className="w-40" data-testid="select-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="church_admin">Church Admin</SelectItem>
                  </SelectContent>
                </Select>

                {/* Assign Button */}
                <Button
                  onClick={handleAssignChurch}
                  disabled={!selectedChurchId || assignChurchMutation.isPending}
                  data-testid="button-assign-church"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Assign
                </Button>
              </div>
            </div>

            {/* Current Church Assignments */}
            <div className="space-y-2">
              <Label>Current Assignments ({user.church_roles?.length || 0})</Label>
              {(user.church_roles?.length || 0) > 0 ? (
                <div className="space-y-2">
                  {user.church_roles?.map((churchRole) => (
                    <div
                      key={churchRole.id}
                      className="flex items-center justify-between p-3 border rounded-md"
                      data-testid={`church-role-${churchRole.church_id}`}
                    >
                      <div className="flex-1">
                        <div className="font-medium">{churchRole.church.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {churchRole.church.city && churchRole.church.state && 
                            `${churchRole.church.city}, ${churchRole.church.state}`}
                          {churchRole.church.denomination && ` • ${churchRole.church.denomination}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={churchRole.role === 'church_admin' ? 'default' : 'secondary'}>
                          {churchRole.role === 'church_admin' ? 'Church Admin' : 'Member'}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeChurchMutation.mutate(churchRole.church_id)}
                          disabled={removeChurchMutation.isPending}
                          data-testid={`button-remove-church-${churchRole.church_id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Building2 className="mx-auto h-12 w-12 mb-2" />
                  <p>No church assignments yet</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
