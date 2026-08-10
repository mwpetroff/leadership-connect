import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { UserCircle2, X as XIcon } from 'lucide-react';
import type { Person } from '@workspace/api-client-react';
import { PersonPicker } from './PersonPicker';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email required'),
  title: z.string().optional().default(''),
  department: z.string().optional().default(''),
  role: z.enum(['executive', 'secondary_leader', 'staff']),
  homeCity: z.string().min(1, 'City is required'),
  homeState: z.string().min(1, 'State required').max(2, 'Use 2-letter abbreviation').transform(v => v.toUpperCase()),
  notes: z.string().optional().default(''),
});

export type PersonFormValues = z.infer<typeof schema> & { managerId?: number | null };

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: PersonFormValues) => void;
  isPending: boolean;
  defaultValues?: Partial<Person>;
  mode: 'create' | 'edit';
}

const EMPTY: PersonFormValues = {
  name: '', email: '', title: '', department: '',
  role: 'staff', homeCity: '', homeState: '', notes: '',
  managerId: null,
};

export function PersonForm({ open, onClose, onSubmit, isPending, defaultValues, mode }: Props) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PersonFormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });

  const [managerId, setManagerId] = useState<number | null>(null);
  const [managerName, setManagerName] = useState<string | null>(null);
  const [showManagerPicker, setShowManagerPicker] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (defaultValues) {
      reset({
        name: defaultValues.name ?? '',
        email: defaultValues.email ?? '',
        title: defaultValues.title ?? '',
        department: defaultValues.department ?? '',
        role: defaultValues.role ?? 'staff',
        homeCity: defaultValues.homeCity ?? '',
        homeState: defaultValues.homeState ?? '',
        notes: defaultValues.notes ?? '',
      });
      const mid = (defaultValues as any).managerId ?? null;
      setManagerId(mid);
      setManagerName(mid ? ((defaultValues as any).managerName ?? null) : null);
    } else {
      reset(EMPTY);
      setManagerId(null);
      setManagerName(null);
    }
  }, [open, defaultValues, reset]);

  const handleFormSubmit = (values: PersonFormValues) => {
    onSubmit({ ...values, managerId: managerId ?? null });
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
                <input {...register('department')} className={f} placeholder="Engineering" />
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
    </>
  );
}
