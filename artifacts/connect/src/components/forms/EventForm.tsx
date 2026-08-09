import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import type { Event } from '@workspace/api-client-react';

const schema = z.object({
  name: z.string().min(1, 'Event name is required'),
  description: z.string().optional().default(''),
  location: z.string().optional().default(''),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().optional().default(''),
  eventType: z.enum(['summit', 'conference', 'marketing', 'leadership', 'regional', 'other']),
});

export type EventFormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: EventFormValues) => void;
  isPending: boolean;
  defaultValues?: Partial<Event>;
  mode: 'create' | 'edit';
}

const EMPTY: EventFormValues = {
  name: '', description: '', location: '',
  city: '', state: '', startDate: '', endDate: '', eventType: 'summit',
};

export function EventForm({ open, onClose, onSubmit, isPending, defaultValues, mode }: Props) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<EventFormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    reset(defaultValues ? {
      name: defaultValues.name ?? '',
      description: defaultValues.description ?? '',
      location: defaultValues.location ?? '',
      city: defaultValues.city ?? '',
      state: defaultValues.state ?? '',
      startDate: defaultValues.startDate ?? '',
      endDate: defaultValues.endDate ?? '',
      eventType: defaultValues.eventType ?? 'summit',
    } : EMPTY);
  }, [open, defaultValues, reset]);

  const f = 'w-full px-3 py-2 bg-muted/50 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-colors';
  const l = 'block text-sm font-medium text-foreground mb-1';
  const e = 'text-xs text-destructive mt-1';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Create Event' : 'Edit Event'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className={l}>Event Name *</label>
            <input {...register('name')} className={f} placeholder="Annual Leadership Summit" />
            {errors.name && <p className={e}>{errors.name.message}</p>}
          </div>

          <div>
            <label className={l}>Description</label>
            <textarea {...register('description')} className={`${f} resize-none`} rows={2} placeholder="Optional description…" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={l}>Event Type *</label>
              <select {...register('eventType')} className={f}>
                <option value="summit">Summit</option>
                <option value="conference">Conference</option>
                <option value="marketing">Marketing</option>
                <option value="leadership">Leadership</option>
                <option value="regional">Regional</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className={l}>Venue / Location</label>
              <input {...register('location')} className={f} placeholder="Marriott Marquis" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={l}>City *</label>
              <input {...register('city')} className={f} placeholder="New York" />
              {errors.city && <p className={e}>{errors.city.message}</p>}
            </div>
            <div>
              <label className={l}>State *</label>
              <input {...register('state')} className={f} placeholder="NY" maxLength={2} />
              {errors.state && <p className={e}>{errors.state.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={l}>Start Date *</label>
              <input {...register('startDate')} type="date" className={f} />
              {errors.startDate && <p className={e}>{errors.startDate.message}</p>}
            </div>
            <div>
              <label className={l}>End Date</label>
              <input {...register('endDate')} type="date" className={f} />
            </div>
          </div>

          <DialogFooter>
            <button type="button" onClick={onClose} disabled={isPending}
              className="px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80">
              Cancel
            </button>
            <button type="submit" disabled={isPending}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50">
              {isPending ? 'Saving…' : mode === 'create' ? 'Create Event' : 'Save Changes'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
