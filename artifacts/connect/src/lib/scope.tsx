import React, { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type Lens = "my_team" | "departments" | "leader" | "hrbp" | "all";

export interface ScopeState {
  lens: Lens;
  departmentIds: number[];
  leaderId: number | null;
  hrbpId: number | null;
  includeInactive: boolean;
}

const DEFAULT: ScopeState = {
  lens: "my_team",
  departmentIds: [],
  leaderId: null,
  hrbpId: null,
  includeInactive: false,
};

const STORAGE_KEY = "touchpoint.scope";

function load(): ScopeState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<ScopeState>;
    return { ...DEFAULT, ...parsed };
  } catch {
    return DEFAULT;
  }
}

function save(state: ScopeState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}

interface ScopeContextValue {
  scope: ScopeState;
  setScope: (next: Partial<ScopeState>) => void;
  queryString: string;
}

const ScopeContext = createContext<ScopeContextValue>({
  scope: DEFAULT,
  setScope: () => {},
  queryString: "lens=my_team",
});

export function scopeToQuery(scope: ScopeState): Record<string, string> {
  const q: Record<string, string> = { lens: scope.lens };
  if (scope.departmentIds.length) q.departmentIds = scope.departmentIds.join(",");
  if (scope.leaderId) q.leaderId = String(scope.leaderId);
  if (scope.hrbpId) q.hrbpId = String(scope.hrbpId);
  if (scope.includeInactive) q.includeInactive = "true";
  return q;
}

/** Query params matching generated list/dashboard/coverage hooks. */
export function scopeToListParams(scope: ScopeState): {
  lens: Lens;
  departmentIds?: string;
  leaderId?: number;
  hrbpId?: number;
  includeInactive?: boolean;
} {
  return {
    lens: scope.lens,
    departmentIds: scope.departmentIds.length ? scope.departmentIds.join(",") : undefined,
    leaderId: scope.leaderId ?? undefined,
    hrbpId: scope.hrbpId ?? undefined,
    includeInactive: scope.includeInactive || undefined,
  };
}

export function ScopeProvider({ children }: { children: ReactNode }) {
  const [scope, setScopeState] = useState<ScopeState>(() =>
    typeof window === "undefined" ? DEFAULT : load(),
  );

  const setScope = useCallback((next: Partial<ScopeState>) => {
    setScopeState((prev) => {
      const merged = { ...prev, ...next };
      save(merged);
      return merged;
    });
  }, []);

  const queryString = useMemo(() => {
    const q = scopeToQuery(scope);
    return new URLSearchParams(q).toString();
  }, [scope]);

  return (
    <ScopeContext.Provider value={{ scope, setScope, queryString }}>
      {children}
    </ScopeContext.Provider>
  );
}

export function useScope() {
  return useContext(ScopeContext);
}
