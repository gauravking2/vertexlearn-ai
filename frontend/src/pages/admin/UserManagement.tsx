import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export const UserManagement = () => {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
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
        <p className="text-center text-red-600 py-8">Failed to load users. Admin access required.</p>
      </Card>
    );
  }

  const users = data?.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-serif text-[#1F2421]">User <span className="italic text-[#C4612F]">Management</span></h1>
      <Card>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(q);
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by email or name"
            aria-label="Search users"
            className="flex-1 border border-[#E7E1D7] rounded-full px-4 py-2 text-sm"
          />
          <Button type="submit" size="sm">Search</Button>
        </form>
      </Card>

      {error && <Card><p className="text-sm text-red-600" role="alert">{error}</p></Card>}
      {notice && <Card><p className="text-sm text-green-700" role="status">{notice}</p></Card>}

      {users.length === 0 ? (
        <Card><p className="text-center text-[#5C635D] py-8">No users found.</p></Card>
      ) : (
        <div className="space-y-2">
          {users.map((u: any) => (
            <Card key={u.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-[#1F2421]">{u.name} <span className="text-xs text-[#5C635D]">{u.email}</span></p>
                  <p className="text-xs text-[#5C635D]">Roles: {(u.roles ?? []).join(', ') || 'none'}{u.is_suspended ? ' • SUSPENDED' : ''}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => roleMutation.mutate({ id: u.id, role: 'instructor', action: 'assign' })}>Make instructor</Button>
                  <Button size="sm" variant="outline" onClick={() => roleMutation.mutate({ id: u.id, role: 'instructor', action: 'revoke' })}>Remove instructor</Button>
                  <Button size="sm" variant="outline" onClick={() => roleMutation.mutate({ id: u.id, role: 'admin', action: 'assign' })}>Make admin</Button>
                  {u.is_suspended ? (
                    <Button size="sm" variant="outline" onClick={() => suspendMutation.mutate({ id: u.id, suspended: false })}>Restore</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => suspendMutation.mutate({ id: u.id, suspended: true })}>Suspend</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`Delete ${u.email}?`)) deleteMutation.mutate(u.id); }}>Delete</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
