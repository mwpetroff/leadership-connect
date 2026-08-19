export type WantToAction = {
  id: string;
  /** Completes the sentence “I want to …” */
  label: string;
  href?: string;
  action?: "cover_hrbp";
};

/**
 * Job starters for the Coverage home. Not a command palette — a short,
 * role-aware list of the next thing someone is likely here to do.
 */
export function getWantToActions(opts: {
  isHrbp: boolean;
  isLeader: boolean;
  personId?: number | null;
  firstOverduePersonId?: number | null;
}): WantToAction[] {
  const actions: WantToAction[] = [];

  if (opts.isLeader) {
    actions.push({ id: "gap", label: "close a coverage gap", href: "/suggestions" });
    actions.push({
      id: "log",
      label: "log a 1:1",
      href: opts.firstOverduePersonId ? `/people/${opts.firstOverduePersonId}` : "/people",
    });
  }

  actions.push({ id: "find", label: "find someone", href: "/people" });
  actions.push({ id: "org", label: "see how the org connects", href: "/org-chart" });

  if (opts.isHrbp) {
    actions.push({ id: "cover", label: "cover another HRBP", action: "cover_hrbp" });
  } else if (opts.isLeader) {
    actions.push({ id: "onsite", label: "plan an onsite", href: "/events" });
  } else if (opts.personId) {
    actions.push({ id: "me", label: "open my profile", href: `/people/${opts.personId}` });
  }

  return actions;
}
