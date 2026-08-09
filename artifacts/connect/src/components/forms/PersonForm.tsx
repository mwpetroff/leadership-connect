import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import type { Person } from '@workspace/api-client-react';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email required'),
  title: z.string().optional().default(''),
  department: z.string().optional().default(''),
  role: z.enum(['executive', 'secondary_leader', 'staff']),
  homeCity: z.string().min(1, 'City is required'),
  homeState: z.string().min(1, 'State is required'),
  notes: z.string().optional().default(''),
});

export type PersonFormValues = z.infer<typeof schema>;

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
};

export function PersonForm({ open, onClose, onSubmit, isPending, defaultValues, mode }: Props) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PersonFormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });

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
    } else {
      reset(EMPTY);
    }
  }, [open, defaultValues, reset]);

  const f = 'w-full px-3 py-2 bg-muted/50 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-colors';
  const l = 'block text-sm font-medium text-foreground mb-1';
  const e = 'text-xs text-destructive mt-1';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add Person' : 'Edit Profile'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
  );
}
