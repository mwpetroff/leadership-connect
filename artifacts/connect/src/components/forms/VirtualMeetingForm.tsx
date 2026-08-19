import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useListPeople } from '@workspace/api-client-react';

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  scheduledDate: z.string().optional().default(''),
  hostId: z.string().optional().default(''),
  notes: z.string().optional().default(''),
  status: z.enum(['suggested', 'scheduled']),
  meetingKind: z.enum(['general', 'hrbp_1on1', 'leader_1on1', 'skip_level']).default('general'),
});

export type VirtualMeetingFormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: VirtualMeetingFormValues) => void;
  isPending: boolean;
  defaultTitle?: string;
  defaultStatus?: 'suggested' | 'scheduled';
}

const EMPTY = (title = '', status: 'suggested' | 'scheduled' = 'scheduled'): VirtualMeetingFormValues => ({
  title, scheduledDate: '', hostId: '', notes: '', status, meetingKind: 'general',
});

export function VirtualMeetingForm({
  open, onClose, onSubmit, isPending, defaultTitle = '', defaultStatus = 'scheduled',
}: Props) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<VirtualMeetingFormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY(defaultTitle, defaultStatus),
  });

  const { data: executives } = useListPeople({ role: 'executive' }, { query: { enabled: open } as any });
  const { data: leaders } = useListPeople({ role: 'secondary_leader' }, { query: { enabled: open } as any });
  const allHosts = [...(executives ?? []), ...(leaders ?? [])];

  useEffect(() => {
    if (open) reset(EMPTY(defaultTitle, defaultStatus));
  }, [open, defaultTitle, defaultStatus, reset]);

  const f = 'w-full px-3 py-2 bg-muted/50 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-colors';
  const l = 'block text-sm font-medium text-foreground mb-1';
  const e = 'text-xs text-destructive mt-1';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Virtual Meeting</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className={l}>Meeting Title *</label>
            <input {...register('title')} className={f} placeholder="Leadership Check-in" />
            {errors.title && <p className={e}>{errors.title.message}</p>}
          </div>

          <div>
            <label className={l}>Status</label>
            <select {...register('status')} className={f}>
              <option value="scheduled">Scheduled (has a date)</option>
              <option value="suggested">Suggested (no date yet)</option>
            </select>
          </div>

          <div>
            <label className={l}>Coverage clock</label>
            <select {...register('meetingKind')} className={f}>
              <option value="general">General</option>
              <option value="hrbp_1on1">HRBP 1:1</option>
              <option value="leader_1on1">Leadership 1:1</option>
              <option value="skip_level">Skip-level 1:1</option>
            </select>
          </div>

          <div>
            <label className={l}>Date</label>
            <input {...register('scheduledDate')} type="date" className={f} />
          </div>

          <div>
            <label className={l}>Host</label>
            <select {...register('hostId')} className={f}>
              <option value="">No host assigned</option>
              {allHosts.map((h) => (
                <option key={h.id} value={String(h.id)}>
                  {h.name} — {h.role === 'executive' ? 'Executive' : 'Leader'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={l}>Notes / Agenda</label>
            <textarea {...register('notes')} className={`${f} resize-none`} rows={3} placeholder="Optional agenda…" />
          </div>

          <DialogFooter>
            <button type="button" onClick={onClose} disabled={isPending}
              className="px-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80">
              Cancel
            </button>
            <button type="submit" disabled={isPending}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50">
              {isPending ? 'Saving…' : 'Create Meeting'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
