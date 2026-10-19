export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

/** Main nav for everyone (desktop sidebar and the 3-tab mobile bar). */
export const MAIN_NAV: NavItem[] = [
  { href: "/workshop", label: "Workshop", icon: "space_dashboard" },
  { href: "/hats", label: "Hats", icon: "styler" },
  { href: "/weavers", label: "Weavers", icon: "groups" },
];

/** Admin group: desktop sidebar, and "Admin tools" in the mobile user menu. Never in the tab bar. */
export const ADMIN_NAV: NavItem[] = [
  { href: "/runs", label: "Agent runs", icon: "account_tree" },
  { href: "/logs", label: "Logs", icon: "receipt_long" },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
