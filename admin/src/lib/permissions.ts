/**
 * Mirrors the API's permission keys (backend: src/modules/admin/core/permissions.ts).
 * The UI uses them only to hide what someone can't do — the API enforces
 * them on every request regardless.
 */
export const P = {
  DashboardView: "dashboard.view",

  UsersView: "users.view",
  UsersPii: "users.pii",
  UsersEdit: "users.edit",
  UsersBan: "users.ban",
  UsersVerify: "users.verify",
  UsersSessions: "users.sessions",
  UsersDelete: "users.delete",
  UsersNotes: "users.notes",

  WalletView: "wallet.view",
  WalletAdjust: "wallet.adjust",

  ModerationView: "moderation.view",
  ModerationResolve: "moderation.resolve",
  ModerationMessages: "moderation.messages",

  FinanceView: "finance.view",
  FinancePurchases: "finance.purchases",
  FinanceRefunds: "finance.refunds",
  FinanceCashouts: "finance.cashouts",
  FinanceVip: "finance.vip",

  OpsLive: "ops.live",
  OpsAnnouncements: "ops.announcements",
  OpsSettings: "ops.settings",
  OpsTemplates: "ops.templates",
  OpsMessages: "ops.messages",
  OpsEconomy: "ops.economy",
  OpsIntegrations: "ops.integrations",

  StaffView: "staff.view",
  StaffManage: "staff.manage",
  RolesManage: "roles.manage",

  AuditView: "audit.view",
} as const;

export type Permission = (typeof P)[keyof typeof P];
