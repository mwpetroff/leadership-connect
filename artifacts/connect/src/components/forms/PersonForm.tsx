import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { UserCircle2, X as XIcon } from 'lucide-react';
import type { Person, PersonInput } from '@workspace/api-client-react';
import { getListDepartmentsQueryKey, useListDepartments } from '@workspace/api-client-react';
import { PersonPicker } from './PersonPicker';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email required'),
  title: z.string().optional().default(''),
  role: z.enum(['executive', 'secondary_leader', 'staff']),
  homeCity: z.string().min(1, 'City is required'),
  homeState: z.string().min(1, 'State required').max(2, 'Use 2-letter abbreviation').transform(v => v.toUpperCase()),
  notes: z.string().optional().default(''),
});

export type PersonFormValues = PersonInput;

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: PersonFormValues) => void;
  isPending: boolean;
  defaultValues?: Partial<Person>;
  mode: 'create' | 'edit';
}

const EMPTY = {
  name: '', email: '', title: '',
  role: 'staff' as const, homeCity: '', homeState: '', notes: '',
};

export function PersonForm({ open, onClose, onSubmit, isPending, defaultValues, mode }: Props) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });

  const [managerId, setManagerId] = useState<number | null>(null);
  const [managerName, setManagerName] = useState<string | null>(null);
  const [showManagerPicker, setShowManagerPicker] = useState(false);
  const [hrbpId, setHrbpId] = useState<number | null>(null);
  const [hrbpName, setHrbpName] = useState<string | null>(null);
  const [showHrbpPicker, setShowHrbpPicker] = useState(false);
  const [isHrbp, setIsHrbp] = useState(false);
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const { data: departments = [] } = useListDepartments({
    query: { enabled: open, queryKey: getListDepartmentsQueryKey() },
  });

  useEffect(() => {
    if (!open) return;
    if (defaultValues) {
      reset({
        name: defaultValues.name ?? '',
        email: defaultValues.email ?? '',
        title: defaultValues.title ?? '',
        role: defaultValues.role ?? 'staff',
        homeCity: defaultValues.homeCity ?? '',
        homeState: defaultValues.homeState ?? '',
        notes: defaultValues.notes ?? '',
      });
      const mid = defaultValues.managerId ?? null;
      setManagerId(mid);
      setManagerName(mid ? (defaultValues.managerName ?? null) : null);
      setHrbpId(defaultValues.hrbpId ?? null);
      setHrbpName(defaultValues.hrbpName ?? null);
      setIsHrbp(Boolean(defaultValues.isHrbp));
      setStatus(defaultValues.status === 'inactive' ? 'inactive' : 'active');
      setDepartmentId(defaultValues.departmentId ?? null);
    } else {
      reset(EMPTY);
      setManagerId(null);
      setManagerName(null);
      setHrbpId(null);
      setHrbpName(null);
      setIsHrbp(false);
      setStatus('active');
      setDepartmentId(null);
    }
  }, [open, defaultValues, reset]);

  const handleFormSubmit = (values: z.infer<typeof schema>) => {
    onSubmit({
      ...values,
      managerId: managerId ?? null,
      hrbpId: hrbpId ?? null,
      departmentId,
      isHrbp,
      status,
    });
  };

  const f = 'w-full px-3 py-2 bg-muted/50 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-colors';
  const l = 'block text-sm font-medium text-foreground mb-1';
  const e = 'text-xs text-destructive mt-1';

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? 'Add Person' : 'Edit Profile'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={l}>Full Name *</label>
                <input {...register('name')} className={f} placeholder="Jane Smith" />
                {errors.name && <p className={e}>{errors.name.message}</p>}
              </div>
              <div>
                <label className={l}>Email *</label>
                <input {...register('email')} type="email" className={f} placeholder="jane@company.com" />
                {errors.email && <p className={e}>{errors.email.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={l}>Title</label>
                <input {...register('title')} className={f} placeholder="Senior Engineer" />
              </div>
              <div>
                <label className={l}>Department</label>
                <select
                  className={f}
                  value={departmentId ?? ''}
                  onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Unassigned</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={l}>Role *</label>
              <select {...register('role')} className={f}>
                <option value="executive">Executive</option>
                <option value="secondary_leader">Secondary Leader</option>
                <option value="staff">Staff</option>
              </select>
            </div>

            {/* Manager / Reports To */}
            <div>
              <label className={l}>Reports To</label>
              {managerName ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border border-border rounded-md">
                  <UserCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm flex-1 text-foreground">{managerName}</span>
                  <button
                    type="button"
                    onClick={() => { setManagerId(null); setManagerName(null); }}
                    className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowManagerPicker(true)}
                    className="text-xs text-primary hover:underline"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowManagerPicker(true)}
                  className={`${f} text-left text-muted-foreground flex items-center gap-2`}
                >
                  <UserCircle2 className="h-4 w-4 shrink-0" />
                  Select manager…
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={l}>Home City *</label>
                <input {...register('homeCity')} className={f} placeholder="Austin" />
                {errors.homeCity && <p className={e}>{errors.homeCity.message}</p>}
              </div>
              <div>
                <label className={l}>Home State *</label>
                <input {...register('homeState')} className={f} placeholder="TX" maxLength={2} />
                {errors.homeState && <p className={e}>{errors.homeState.message}</p>}
              </div>
            </div>

            <div>
              <label className={l}>Notes</label>
              <textarea {...register('notes')} className={`${f} resize-none`} rows={3} placeholder="Optional notes…" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={l}>Status</label>
                <select className={f} value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive (FMLA / leave)</option>
                </select>
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={isHrbp} onChange={(e) => setIsHrbp(e.target.checked)} />
                  This person is an HRBP
                </label>
              </div>
            </div>

            <div>
              <label className={l}>Assigned HRBP</label>
              {hrbpName ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border border-border rounded-md">
                  <span className="text-sm flex-1">{hrbpName}</span>
                  <button type="button" onClick={() => { setHrbpId(null); setHrbpName(null); }} className="text-xs text-muted-foreground">Clear</button>
                  <button type="button" onClick={() => setShowHrbpPicker(true)} className="text-xs text-primary">Change</button>
                </div>
              ) : (
                <button type="button" onClick={() => setShowHrbpPicker(true)} className={`${f} text-left text-muted-foreground`}>
                  Select HRBP…
                </button>
              )}
            </div>

            <DialogFooter>
              <button type="button" onClick={onClose} disabled={isPending}
                className="px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80">
                Cancel
              </button>
              <button type="submit" disabled={isPending}
                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50">
                {isPending ? 'Saving…' : mode === 'create' ? 'Add Person' : 'Save Changes'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Manager picker — rendered outside the form Dialog to avoid nesting issues */}
      <PersonPicker
        open={showManagerPicker}
        onClose={() => setShowManagerPicker(false)}
        onSelect={(p) => { setManagerId(p.id); setManagerName(p.name); }}
        title="Select Manager"
        description="Choose who this person reports to."
        excludeIds={defaultValues?.id ? [defaultValues.id] : []}
      />
      <PersonPicker
        open={showHrbpPicker}
        onClose={() => setShowHrbpPicker(false)}
        onSelect={(p) => { setHrbpId(p.id); setHrbpName(p.name); }}
        title="Select HRBP"
        description="Choose the HR business partner who supports this person."
        excludeIds={defaultValues?.id ? [defaultValues.id] : []}
      />
    </>
  );
}
