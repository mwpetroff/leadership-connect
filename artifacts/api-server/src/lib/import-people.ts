/**
 * CSV import column presence and row-level checks that do not need a database.
 *
 * Header present + empty cell → clear that field.
 * Header omitted → leave the existing database value alone (caller must not SET it).
 */

export const DIRECTORY_ROLES = ["executive", "secondary_leader", "staff"] as const;
export type DirectoryRole = (typeof DIRECTORY_ROLES)[number];

export interface ImportHeaders {
  name: boolean;
  email: boolean;
  role: boolean;
  title: boolean;
  department: boolean;
  managerEmail: boolean;
  hrbpEmail: boolean;
  isHrbp: boolean;
  homeCity: boolean;
  homeState: boolean;
  status: boolean;
}

export interface ImportRowInput {
  rowNumber: number;
  fields: Record<string, string>;
}

export interface ValidatedImportRow {
  rowNumber: number;
  name: string;
  email: string;
  role?: DirectoryRole;
  title?: string | null;
  departmentName?: string | null;
  managerEmail?: string | null;
  hrbpEmail?: string | null;
  isHrbp?: boolean;
  homeCity?: string;
  homeState?: string;
  status?: "active" | "inactive";
}

export interface SkippedImportRow {
  row: number;
  email: string;
  reason: string;
}

const COL_ALIASES: Record<string, string> = {
  fullname: "name",
  employeename: "name",
  workemail: "email",
  emailaddress: "email",
  jobtitle: "title",
  position: "title",
  dept: "department",
  homecity: "homecity",
  city: "homecity",
  homestate: "homestate",
  state: "homestate",
  manageremail: "manageremail",
  manager: "manageremail",
  reportsto: "manageremail",
  hrbpemail: "hrbpemail",
  hrbp: "hrbpemail",
  ishrbp: "ishrbp",
  employmentstatus: "status",
};

export function normalizeImportKey(raw: string): string {
  const compact = raw.toLowerCase().trim().replace(/[\s_-]+/g, "");
  return COL_ALIASES[compact] ?? compact;
}

export function detectHeaders(normalizedKeys: string[]): ImportHeaders {
  const set = new Set(normalizedKeys);
  return {
    name: set.has("name"),
    email: set.has("email"),
    role: set.has("role"),
    title: set.has("title"),
    department: set.has("department"),
    managerEmail: set.has("manageremail"),
    hrbpEmail: set.has("hrbpemail"),
    isHrbp: set.has("ishrbp"),
    homeCity: set.has("homecity"),
    homeState: set.has("homestate"),
    status: set.has("status"),
  };
}

export function parseBoolFlag(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (v === "") return null;
  if (["true", "yes", "y", "1"].includes(v)) return true;
  if (["false", "no", "n", "0"].includes(v)) return false;
  return null;
}

export function parseStatus(raw: string): "active" | "inactive" | null {
  const v = raw.trim().toLowerCase();
  if (v === "") return null;
  if (v === "active") return "active";
  if (["inactive", "fmla", "leave", "terminated", "offboard"].includes(v)) return "inactive";
  return null;
}

export function parseRole(raw: string): DirectoryRole | null {
  const v = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (v === "") return null;
  if ((DIRECTORY_ROLES as readonly string[]).includes(v)) return v as DirectoryRole;
  return null;
}

export function wouldCreateManagerCycle(
  personId: number,
  nextManagerId: number | null,
  managerById: Map<number, number | null>,
): boolean {
  if (nextManagerId == null) return false;
  if (nextManagerId === personId) return true;
  const seen = new Set<number>([personId]);
  let current: number | null = nextManagerId;
  while (current != null) {
    if (seen.has(current)) return true;
    seen.add(current);
    current = managerById.get(current) ?? null;
  }
  return false;
}

export function validateImportRows(
  rows: ImportRowInput[],
  headers: ImportHeaders,
): { valid: ValidatedImportRow[]; skipped: SkippedImportRow[] } {
  const valid: ValidatedImportRow[] = [];
  const skipped: SkippedImportRow[] = [];
  const seenEmails = new Set<string>();

  const firstKeys = rows[0] ? Object.keys(rows[0].fields) : [];
  const hasSeparateNames =
    firstKeys.includes("firstname") && !firstKeys.includes("name") && !headers.name;

  for (const row of rows) {
    const f = row.fields;
    const email = (f["email"] ?? "").trim().toLowerCase();
    const name = (f["name"] ?? "").trim();

    if (hasSeparateNames) {
      skipped.push({
        row: row.rowNumber,
        email: email || "(none)",
        reason:
          "File has separate 'first name'/'last name' columns — combine them into a single 'name' column and re-upload",
      });
      continue;
    }
    if (!name) {
      skipped.push({ row: row.rowNumber, email: email || "(none)", reason: "Missing required field: name" });
      continue;
    }
    if (!email || !email.includes("@")) {
      skipped.push({
        row: row.rowNumber,
        email: email || "(none)",
        reason: "Missing or invalid email address",
      });
      continue;
    }
    if (seenEmails.has(email)) {
      skipped.push({
        row: row.rowNumber,
        email,
        reason: "Duplicate email within the uploaded file (first occurrence wins)",
      });
      continue;
    }
    seenEmails.add(email);

    const parsed: ValidatedImportRow = { rowNumber: row.rowNumber, name, email };

    if (headers.role) {
      const role = parseRole(f["role"] ?? "");
      parsed.role = role ?? "staff";
    }
    if (headers.title) {
      parsed.title = (f["title"] ?? "").trim() || null;
    }
    if (headers.department) {
      parsed.departmentName = (f["department"] ?? "").trim() || null;
    }
    if (headers.managerEmail) {
      const raw = (f["manageremail"] ?? "").trim().toLowerCase();
      parsed.managerEmail = raw || null;
    }
    if (headers.hrbpEmail) {
      const raw = (f["hrbpemail"] ?? "").trim().toLowerCase();
      parsed.hrbpEmail = raw || null;
    }
    if (headers.isHrbp) {
      const flag = parseBoolFlag(f["ishrbp"] ?? "");
      if (flag == null && (f["ishrbp"] ?? "").trim() !== "") {
        skipped.push({
          row: row.rowNumber,
          email,
          reason: "Invalid isHrbp value — use true/false or yes/no",
        });
        continue;
      }
      parsed.isHrbp = flag ?? false;
    }
    if (headers.homeCity) {
      parsed.homeCity = (f["homecity"] ?? "").trim();
    }
    if (headers.homeState) {
      parsed.homeState = (f["homestate"] ?? "").trim();
    }
    if (headers.status) {
      const status = parseStatus(f["status"] ?? "");
      if (status == null && (f["status"] ?? "").trim() !== "") {
        skipped.push({
          row: row.rowNumber,
          email,
          reason: "Invalid status — use active or inactive",
        });
        continue;
      }
      parsed.status = status ?? "active";
    }

    valid.push(parsed);
  }

  return { valid, skipped };
}
