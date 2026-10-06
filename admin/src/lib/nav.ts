import { Activity, BarChart3, Banknote, BookOpen, CreditCard, FileClock, Flag, Gift, HandCoins, Handshake, Layers, LayoutDashboard, type LucideIcon, Mail, Megaphone, Plug, ScanFace, Send, Receipt, Settings, ShieldCheck, Sparkles, UserCog, Users, Wallet, Webhook } from "lucide-react";

import { P, type Permission } from "./permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown only with this permission. */
  permission: Permission;
  /** Key into the sidebar's badge counts. */
  badge?: "openReports" | "cashoutsReview" | "pendingPurchases" | "partnersPending" | "partnerPayoutsOpen";
  /** Also active for these path prefixes. */
  match?: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * The menu, as data. A new screen = one entry here + its route; the sidebar,
 * command palette and permission filtering pick it up automatically.
 */
export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, permission: P.DashboardView },
      { href: "/live", label: "Live", icon: Activity, permission: P.OpsLive },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/users", label: "Users", icon: Users, permission: P.UsersView },
      { href: "/moderation", label: "Reports", icon: Flag, permission: P.ModerationView, badge: "openReports" },
      { href: "/verifications", label: "Verifications", icon: ScanFace, permission: P.UsersVerify },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/finance", label: "Revenue and profit", icon: BarChart3, permission: P.FinanceView },
      { href: "/finance/purchases", label: "Purchases", icon: CreditCard, permission: P.FinanceView, badge: "pendingPurchases" },
      { href: "/finance/cashouts", label: "Cash-outs", icon: Banknote, permission: P.FinanceView, badge: "cashoutsReview" },
      { href: "/finance/payout-batches", label: "Payout batches", icon: Layers, permission: P.FinanceView },
      { href: "/finance/subscriptions", label: "VIP", icon: Sparkles, permission: P.FinanceView },
      { href: "/finance/ledger", label: "Ledger", icon: Receipt, permission: P.WalletView },
    ],
  },
  {
    label: "Growth",
    items: [
      { href: "/referrals", label: "Referrals", icon: Gift, permission: P.AffiliatesView },
      { href: "/affiliates", label: "Affiliates", icon: Handshake, permission: P.AffiliatesView, badge: "partnersPending" },
      { href: "/affiliate-payouts", label: "Affiliate payouts", icon: HandCoins, permission: P.AffiliatesView, badge: "partnerPayoutsOpen" },
    ],
  },
  {
    label: "Messaging",
    items: [
      { href: "/messages", label: "Messages", icon: Send, permission: P.OpsMessages },
      { href: "/mail-templates", label: "E-mail templates", icon: Mail, permission: P.OpsTemplates },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/announcements", label: "Announcements", icon: Megaphone, permission: P.OpsAnnouncements },
      { href: "/settings", label: "Settings", icon: Settings, permission: P.OpsSettings },
      { href: "/economy", label: "Economy", icon: Wallet, permission: P.DashboardView },
      { href: "/integrations", label: "Integrations", icon: Plug, permission: P.OpsIntegrations },
      { href: "/webhooks", label: "Webhooks", icon: Webhook, permission: P.OpsIntegrations },
    ],
  },
  {
    label: "Team",
    items: [
      { href: "/team", label: "Staff", icon: UserCog, permission: P.StaffView, match: ["/team/"] },
      { href: "/team/roles", label: "Roles", icon: ShieldCheck, permission: P.StaffView },
      { href: "/audit", label: "Audit log", icon: FileClock, permission: P.AuditView },
    ],
  },
];

export const DOCS_ITEM = { href: "/account", label: "Your account", icon: BookOpen };

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === "/") return pathname === "/";
  if (pathname === item.href) return true;
  // Most specific match wins: /finance shouldn't light up on /finance/purchases.
  const deeper = NAV.flatMap((g) => g.items).some((o) => o.href !== item.href && o.href.startsWith(item.href) && pathname.startsWith(o.href));
  if (deeper) return false;
  return pathname.startsWith(`${item.href}/`) || (item.match ?? []).some((m) => pathname.startsWith(m));
}
