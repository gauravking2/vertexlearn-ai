import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/common/Badge';
import { getApiErrorMessage } from '@/components/common/apiError';
import { Search, Users } from 'lucide-react';

export const UserManagement = () => {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error: queryError, refetch } = useQuery({
    queryKey: ['admin-users', search],
    queryFn: () => adminService.listUsers({ q: search || undefined, pageSize: 50 }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });

  const roleMutation = useMutation({
    mutationFn: ({ id, role, action }: { id: string; role: 'student' | 'instructor' | 'admin'; action: 'assign' | 'revoke' }) =>
      adminService.setRole(id, role, action),
    onSuccess: () => {
      setNotice('Role updated.');
      setError(null);
      refresh();
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Role update failed'),
  });

  const suspendMutation = useMutation({
    mutationFn: ({ id, suspended }: { id: string; suspended: boolean }) => adminService.setSuspended(id, suspended),
    onSuccess: () => {
      setNotice('Suspension status updated.');
      setError(null);
      refresh();
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Suspend failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminService.deleteUser(id),
    onSuccess: () => {
      setNotice('User deleted.');
      setError(null);
      refresh();
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Delete failed'),
  });

  if (isLoading) return <LoadingSpinner text="Loading users..." />;
  if (isError) {
    return (
      <Card>
        <p className="text-center text-red-600 dark:text-red-400 py-8">Failed to load users ({getApiErrorMessage(queryError)}).</p>
        <div className="text-center pb-6"><Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button></div>
      </Card>
    );
  }

  const users = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2]">
          User <span className="italic text-[#C4612F] dark:text-[#e8a06f]">Management</span>
        </h1>
        <p className="text-[#5C635D] dark:text-[#b9beb4] mt-1">Roles, suspension, and account administration</p>
      </div>

      <Card>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(q);
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5C635D] dark:text-[#b9beb4]" size={16} aria-hidden="true" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by email or name"
              aria-label="Search users"
              className="w-full pl-10 pr-4 py-2 bg-[#FBF9F5] dark:bg-[#23261f] border border-[#E7E1D7] dark:border-[#2c2f2a] rounded-full text-sm text-[#1F2421] dark:text-[#ece9e2] placeholder:text-[#5C635D] dark:placeholder:text-[#8a9184] focus:outline-none focus:bg-[#FFFFFF] dark:focus:bg-[#1a1d17] focus:ring-2 focus:ring-[#C4612F] focus:border-transparent transition-all"
            />
          </div>
          <Button type="submit" size="sm">Search</Button>
        </form>
      </Card>

      {error && <Card><p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p></Card>}
      {notice && <Card><p className="text-sm text-green-700 dark:text-green-400" role="status">{notice}</p></Card>}

      {users.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title="No users found" description="Try a different search term." />
        </Card>
      ) : (
        <div className="space-y-2 vl-stagger">
          {users.map((u: any) => (
            <Card key={u.id} variant="elevated">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-9 h-9 rounded-full bg-gradient-to-br from-[#F2E3D6] to-[#EAD3BE] dark:from-[#2c241c] dark:to-[#23261f] ring-1 ring-[#E7E1D7] dark:ring-[#2c2f2a] flex items-center justify-center text-sm font-semibold text-[#8A3E1C] dark:text-[#e8a06f] shrink-0"
                    aria-hidden="true"
                  >
                    {(u.name ?? u.email ?? '?').charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-[#1F2421] dark:text-[#ece9e2] truncate">
                      {u.name} <span className="text-xs font-normal text-[#5C635D] dark:text-[#b9beb4]">{u.email}</span>
                    </p>
                    <p className="text-xs text-[#5C635D] dark:text-[#b9beb4] flex items-center gap-1.5 flex-wrap mt-0.5">
                      {(u.roles ?? []).map((r: string) => (
                        <Badge key={r} variant={r === 'admin' ? 'primary' : 'neutral'} className="capitalize">{r}</Badge>
                      ))}
                      {(u.roles ?? []).length === 0 && <span>Roles: none</span>}
                      {u.is_suspended && <Badge variant="error">Suspended</Badge>}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => roleMutation.mutate({ id: u.id, role: 'instructor', action: 'assign' })}>Make instructor</Button>
                  <Button size="sm" variant="outline" onClick={() => roleMutation.mutate({ id: u.id, role: 'instructor', action: 'revoke' })}>Remove instructor</Button>
                  <Button size="sm" variant="outline" onClick={() => roleMutation.mutate({ id: u.id, role: 'admin', action: 'assign' })}>Make admin</Button>
                  {u.is_suspended ? (
                    <Button size="sm" variant="outline" onClick={() => suspendMutation.mutate({ id: u.id, suspended: false })}>Restore</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => suspendMutation.mutate({ id: u.id, suspended: true })}>Suspend</Button>
                  )}
                  <Button size="sm" variant="danger" onClick={() => { if (window.confirm(`Delete ${u.email}?`)) deleteMutation.mutate(u.id); }}>Delete</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
