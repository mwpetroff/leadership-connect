import type { Person } from "@workspace/db";

/** API person shape: department remains a display name; ids are the source of truth. */
export interface PersonDto {
  id: number;
  name: string;
  email: string;
  title: string | null;
  department: string | null;
  departmentId: number | null;
  role: Person["role"];
  homeCity: string;
  homeState: string;
  managerId: number | null;
  managerName: string | null;
  hrbpId: number | null;
  hrbpName: string | null;
  isHrbp: boolean;
  status: Person["status"] | "active" | "inactive";
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

type PersonLike = Partial<Person> & {
  id: number;
  name: string;
  email: string;
  role: Person["role"];
  homeCity: string;
  homeState: string;
  createdAt: Date | string;
  department?: string | null;
};

export function toPersonDto(
  person: PersonLike,
  extras: {
    department?: string | null;
    hrbpName?: string | null;
    managerName?: string | null;
  } = {},
): PersonDto {
  return {
    id: person.id,
    name: person.name,
    email: person.email,
    title: person.title ?? null,
    department: extras.department ?? person.department ?? null,
    departmentId: person.departmentId ?? null,
    role: person.role,
    homeCity: person.homeCity,
    homeState: person.homeState,
    managerId: person.managerId ?? null,
    managerName: extras.managerName ?? null,
    hrbpId: person.hrbpId ?? null,
    hrbpName: extras.hrbpName ?? null,
    isHrbp: person.isHrbp ?? false,
    status: person.status ?? "active",
    notes: person.notes ?? null,
    createdAt: person.createdAt,
    updatedAt: person.updatedAt ?? person.createdAt,
  };
}
