import { useScope, type Lens } from "@/lib/scope";
import { cn } from "@/lib/utils";
import { useListDepartments, useListPeople } from "@workspace/api-client-react";

const LENSES: { id: Lens; label: string }[] = [
  { id: "my_team", label: "My team" },
  { id: "departments", label: "Departments" },
  { id: "leader", label: "Leader" },
  { id: "hrbp", label: "Another HRBP" },
  { id: "all", label: "Everyone" },
];

export function ScopeBar() {
  const { scope, setScope } = useScope();
  const { data: departments = [] } = useListDepartments();
  const { data: people = [] } = useListPeople({ lens: "all", includeInactive: false });

  const hrbps = people.filter((p) => p.isHrbp);
  const leaders = people.filter((p) => p.role === "executive" || p.role === "secondary_leader");

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mr-1">View</span>
        {LENSES.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setScope({ lens: l.id })}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
              scope.lens === l.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted/70 text-muted-foreground hover:text-foreground",
            )}
          >
            {l.label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={scope.includeInactive}
            onChange={(e) => setScope({ includeInactive: e.target.checked })}
          />
          Include inactive
        </label>
      </div>

      {scope.lens === "departments" && (
        <div className="flex flex-wrap gap-2">
          {departments.length === 0 && (
            <p className="text-xs text-muted-foreground">No departments yet. HR can add them in Settings.</p>
          )}
          {departments.map((d) => {
            const on = scope.departmentIds.includes(d.id);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() =>
                  setScope({
                    departmentIds: on
                      ? scope.departmentIds.filter((id) => id !== d.id)
                      : [...scope.departmentIds, d.id],
                  })
                }
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-medium border",
                  on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
                )}
              >
                {d.name}
              </button>
            );
          })}
        </div>
      )}

      {scope.lens === "leader" && (
        <select
          className="max-w-sm w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm"
          value={scope.leaderId ?? ""}
          onChange={(e) => setScope({ leaderId: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Select a leader…</option>
          {leaders.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      )}

      {scope.lens === "hrbp" && (
        <select
          className="max-w-sm w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm"
          value={scope.hrbpId ?? ""}
          onChange={(e) => setScope({ hrbpId: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Select an HRBP to cover…</option>
          {hrbps.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}
