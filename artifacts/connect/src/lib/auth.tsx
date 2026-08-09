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
  role: "admin" | "leader" | "staff";
}

interface AuthContextValue {
  user: AuthUser | null;
  isAdmin: boolean;
  isLeader: boolean;
  isLoading: boolean;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAdmin: false,
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
  const isLeader = user?.role === "leader" || isAdmin;

  return (
    <AuthContext.Provider value={{ user, isAdmin, isLeader, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
