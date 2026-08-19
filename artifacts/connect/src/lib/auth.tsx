import React, {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  azureOid: string;
  role: "admin" | "hrbp" | "leader" | "staff";
  personId?: number | null;
  isHrbp?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAdmin: boolean;
  isHrbp: boolean;
  isLeader: boolean;
  isLoading: boolean;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAdmin: false,
  isHrbp: false,
  isLeader: false,
  isLoading: true,
});

// ── Fetch current user ────────────────────────────────────────────────────────

async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Auth check failed: ${res.status}`);
  return res.json() as Promise<AuthUser>;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user = null, isLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchMe,
    retry: false,
    refetchOnWindowFocus: true,
    staleTime: 5 * 60 * 1000, // 5 min
  });

  const isAdmin = user?.role === "admin";
  const isHrbp = user?.role === "hrbp" || user?.isHrbp === true || isAdmin;
  const isLeader = user?.role === "leader" || isAdmin || isHrbp;

  return (
    <AuthContext.Provider value={{ user, isAdmin, isHrbp, isLeader, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
