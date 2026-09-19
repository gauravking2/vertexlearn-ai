import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/common/Badge';
import { Input } from '@/components/common/Input';
import { getApiErrorMessage } from '@/components/common/apiError';
import { CircleDollarSign, Receipt } from 'lucide-react';

/**
 * Revenue reporting over REAL payment records only (manual ingress via the
 * form below or a future provider webhook — no payment gateway in scope).
 * Empty ledgers honestly report zero; nothing is fabricated.
 */
export const RevenuePage = () => {
  const queryClient = useQueryClient();
  const { data: overview, isLoading: loadingOverview } = useQuery({
    queryKey: ['admin-revenue-overview'],
    queryFn: () => adminService.analyticsOverview(),
  });
  const { data: payments, isLoading: loadingPayments, isError, error, refetch } = useQuery({
    queryKey: ['admin-payments'],
    queryFn: () => adminService.listPayments(),
  });

  const [amount, setAmount] = useState('49.99');
  const [currency, setCurrency] = useState('USD');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const record = useMutation({
    mutationFn: () =>
      adminService.recordPayment({
        amountCents: Math.round(Number(amount) * 100),
        currency: currency.toUpperCase(),
        status: 'completed',
        provider: 'manual',
        providerRef: note.trim(),
      }),
    onSuccess: () => {
      setFormError(null);
      setNote('');
      queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
      queryClient.invalidateQueries({ queryKey: ['admin-revenue-overview'] });
    },
    onError: (e: any) => setFormError(getApiErrorMessage(e)),
  });

  if (loadingOverview || loadingPayments) return <LoadingSpinner text="Loading revenue..." />;

  const revenue = (overview as any)?.revenue ?? {};
  const totals: { currency: string; total_cents: number }[] = revenue.totals ?? [];
  const rows: any[] = (payments as any)?.data ?? [];

  const cents = Number(amount) * 100;
  const amountValid = Number.isFinite(Number(amount)) && cents > 0 && /^[A-Z]{3}$/i.test(currency.trim());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-normal tracking-tight text-[#1F2421] dark:text-[#ece9e2] mb-2">
          Revenue
        </h1>
        <p className="text-[#5C635D] dark:text-[#b9beb4]">Completed payments only — manual records, no gateway</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 vl-stagger">
        <Card variant="elevated" className="relative overflow-hidden">
          <div aria-hidden="true" className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-[radial-gradient(circle,rgba(196,97,47,0.08),transparent_70%)] dark:bg-[radial-gradient(circle,rgba(232,160,111,0.10),transparent_70%)]" />
          <p className="text-sm text-[#5C635D] dark:text-[#b9beb4]">Total recorded payments</p>
          <p className="text-2xl font-serif text-[#1F2421] dark:text-[#ece9e2] tabular-nums">{revenue.recorded ?? 0}</p>
        </Card>
        {(totals.length > 0 ? totals : [{ currency: 'USD', total_cents: 0 }]).slice(0, 2).map((t) => (
          <Card key={t.currency} variant="elevated" className="relative overflow-hidden">
            <div aria-hidden="true" className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-[radial-gradient(circle,rgba(196,97,47,0.08),transparent_70%)] dark:bg-[radial-gradient(circle,rgba(232,160,111,0.10),transparent_70%)]" />
            <p className="text-sm text-[#5C635D] dark:text-[#b9beb4]">Completed revenue ({t.currency})</p>
            <p className="text-2xl font-serif text-[#1F2421] dark:text-[#ece9e2] tabular-nums">${((t.total_cents ?? 0) / 100).toFixed(2)}</p>
          </Card>
        ))}
      </div>

      <Card variant="inset">
        <h2 className="text-lg font-serif text-[#1F2421] dark:text-[#ece9e2] mb-1">Record a payment</h2>
        <p className="text-sm text-[#5C635D] dark:text-[#b9beb4] mb-3">Manual ingress (e.g. bank transfer, invoice). Recorded as completed.</p>
        {formError && <p className="text-sm text-red-700 dark:text-red-400 mb-2" role="alert">{formError}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="49.99" />
          <Input label="Currency (3 letters)" value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="USD" />
          <Input label="Reference (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="invoice-123" />
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={() => record.mutate()} loading={record.isPending} disabled={!amountValid}>
            <CircleDollarSign size={16} aria-hidden="true" /> Record payment
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-serif text-[#1F2421] dark:text-[#ece9e2] mb-3 flex items-center gap-2">
          <Receipt size={18} className="text-[#C4612F] dark:text-[#e8a06f]" aria-hidden="true" />
          Payment records
        </h2>
        {isError ? (
          <div>
            <p className="text-sm text-red-700 dark:text-red-400 mb-2" role="alert">{getApiErrorMessage(error)}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={CircleDollarSign} title="No payments recorded" description="Use the form above to record the first payment." />
        ) : (
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[#5C635D] dark:text-[#b9beb4] border-b border-[#E7E1D7] dark:border-[#2c2f2a]">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Course</th>
                  <th className="py-2 pr-3 font-medium">User</th>
                  <th className="py-2 pr-3 font-medium">Amount</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p: any) => (
                  <tr key={p.id} className="border-b border-[#F2E3D6] dark:border-[#2c241c] last:border-b-0">
                    <td className="py-2.5 pr-3 text-[#5C635D] dark:text-[#b9beb4] tabular-nums">{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
                    <td className="py-2.5 pr-3 text-[#1F2421] dark:text-[#ece9e2]">{p.course_title ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-[#5C635D] dark:text-[#b9beb4]">{p.user_email ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-[#1F2421] dark:text-[#ece9e2] tabular-nums">{((p.amount_cents ?? 0) / 100).toFixed(2)} {p.currency}</td>
                    <td className="py-2.5">
                      <Badge variant={p.status === 'completed' ? 'success' : 'warning'} className="capitalize">{p.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
