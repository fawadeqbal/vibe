/**
 * Every back-office permission, in one place. Endpoints declare what they
 * need with `@RequirePermissions(P.UsersBan)`; roles are lists of these keys.
 * The admin panel reads the same catalog from `GET /v1/admin/permissions`
 * to build the role editor and to hide what a person can't use.
 *
 * Adding a feature = add a key here, put it on the endpoint, and (if it
 * should be on by default) add it to the built-in roles below.
 */
export const P = {
  DashboardView: 'dashboard.view',

  UsersView: 'users.view',
  UsersPii: 'users.pii',
  UsersEdit: 'users.edit',
  UsersBan: 'users.ban',
  UsersVerify: 'users.verify',
  UsersSessions: 'users.sessions',
  UsersDelete: 'users.delete',
  UsersNotes: 'users.notes',

  WalletView: 'wallet.view',
  WalletAdjust: 'wallet.adjust',

  ModerationView: 'moderation.view',
  ModerationResolve: 'moderation.resolve',
  ModerationMessages: 'moderation.messages',

  FinanceView: 'finance.view',
  FinancePurchases: 'finance.purchases',
  FinanceRefunds: 'finance.refunds',
  FinanceCashouts: 'finance.cashouts',
  FinanceVip: 'finance.vip',

  OpsLive: 'ops.live',
  OpsAnnouncements: 'ops.announcements',
  OpsSettings: 'ops.settings',
  OpsTemplates: 'ops.templates',
  OpsMessages: 'ops.messages',
  OpsEconomy: 'ops.economy',
  OpsIntegrations: 'ops.integrations',

  StaffView: 'staff.view',
  StaffManage: 'staff.manage',
  RolesManage: 'roles.manage',

  AuditView: 'audit.view',
} as const;

export type Permission = (typeof P)[keyof typeof P];
export const ALL = '*';

export interface PermissionGroup {
  key: string;
  label: string;
  permissions: { key: Permission; label: string; description: string; sensitive?: boolean }[];
}

/** Human labels for the role editor, grouped the way the panel's menu is. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    permissions: [{ key: P.DashboardView, label: 'View dashboard', description: 'KPIs, charts and queues at a glance.' }],
  },
  {
    key: 'users',
    label: 'Users',
    permissions: [
      { key: P.UsersView, label: 'View users', description: 'Search users and open profiles.' },
      { key: P.UsersPii, label: 'See contact details', description: 'Full e-mail addresses and sign-in identifiers.', sensitive: true },
      { key: P.UsersEdit, label: 'Edit profiles', description: 'Change name, bio, age, country; remove photos.' },
      { key: P.UsersBan, label: 'Ban and unban', description: 'Pause accounts for a set time.' },
      { key: P.UsersVerify, label: 'Verification', description: 'Grant or revoke the verified badge.' },
      { key: P.UsersSessions, label: 'Sign users out', description: 'Revoke every session of a user.' },
      { key: P.UsersDelete, label: 'Delete accounts', description: 'Wipe personal data (cannot be undone).', sensitive: true },
      { key: P.UsersNotes, label: 'Internal notes', description: 'Read and write staff notes on users.' },
    ],
  },
  {
    key: 'wallet',
    label: 'Wallet',
    permissions: [
      { key: P.WalletView, label: 'View ledger', description: 'Balances and every coin/gem movement.' },
      { key: P.WalletAdjust, label: 'Adjust balances', description: 'Credit or debit coins and gems.', sensitive: true },
    ],
  },
  {
    key: 'moderation',
    label: 'Moderation',
    permissions: [
      { key: P.ModerationView, label: 'View reports', description: 'The report queue and report details.' },
      { key: P.ModerationResolve, label: 'Resolve reports', description: 'Dismiss, warn or ban from a report.' },
      { key: P.ModerationMessages, label: 'Read chats', description: 'Read messages between reporter and reported.', sensitive: true },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    permissions: [
      { key: P.FinanceView, label: 'View finance', description: 'Purchases, cash-outs, subscriptions, ledger, revenue.' },
      { key: P.FinancePurchases, label: 'Confirm payments', description: 'Mark bank transfers and pending charges as paid.' },
      { key: P.FinanceRefunds, label: 'Refunds', description: 'Reverse a purchase.', sensitive: true },
      { key: P.FinanceCashouts, label: 'Cash-outs', description: 'Approve, mark paid or reject payouts.', sensitive: true },
      { key: P.FinanceVip, label: 'VIP', description: 'Grant or revoke VIP time.' },
    ],
  },
  {
    key: 'ops',
    label: 'Operations',
    permissions: [
      { key: P.OpsLive, label: 'Live activity', description: 'Online users, queue and live calls.' },
      { key: P.OpsAnnouncements, label: 'Announcements', description: 'Write and publish in-app announcements.' },
      { key: P.OpsSettings, label: 'Settings', description: 'Maintenance mode, sign-ups, payout rules.', sensitive: true },
      { key: P.OpsTemplates, label: 'E-mail templates', description: 'Edit, preview and test the e-mails Vibe sends.' },
      { key: P.OpsMessages, label: 'Send messages', description: 'Message users by e-mail and in the app — one person, a segment or everyone.', sensitive: true },
      { key: P.OpsEconomy, label: 'Edit prices and rules', description: 'Coin packs, VIP plans, gifts, rewards and costs. Changes reach every app at once.', sensitive: true },
      { key: P.OpsIntegrations, label: 'Integrations', description: 'See which providers are live and which keys are missing; read and retry provider webhooks.' },
    ],
  },
  {
    key: 'team',
    label: 'Team',
    permissions: [
      { key: P.StaffView, label: 'View team', description: 'See staff accounts and roles.' },
      { key: P.StaffManage, label: 'Manage staff', description: 'Invite, edit, disable staff; reset passwords and 2FA.', sensitive: true },
      { key: P.RolesManage, label: 'Manage roles', description: 'Create and edit roles and their permissions.', sensitive: true },
      { key: P.AuditView, label: 'Audit log', description: 'Every action taken in the admin panel.' },
    ],
  },
];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));

export function isPermission(key: string): key is Permission {
  return (ALL_PERMISSIONS as string[]).includes(key);
}

export interface SystemRole {
  key: string;
  name: string;
  description: string;
  permissions: (Permission | typeof ALL)[];
}

/**
 * Built-in roles. They are upserted at boot, so changing a list here
 * updates every deployment. Custom roles live only in the database.
 */
export const SYSTEM_ROLES: SystemRole[] = [
  { key: 'owner', name: 'Owner', description: 'Everything, including roles and settings.', permissions: [ALL] },
  {
    key: 'admin',
    name: 'Admin',
    description: 'Runs the app day to day. Cannot edit roles.',
    permissions: ALL_PERMISSIONS.filter((p) => p !== P.RolesManage),
  },
  {
    key: 'moderator',
    name: 'Moderator',
    description: 'Works the report queue and keeps people safe.',
    permissions: [P.DashboardView, P.UsersView, P.UsersBan, P.UsersVerify, P.UsersSessions, P.UsersNotes, P.ModerationView, P.ModerationResolve, P.ModerationMessages, P.OpsLive],
  },
  {
    key: 'finance',
    name: 'Finance',
    description: 'Payments, refunds, payouts and VIP.',
    permissions: [P.DashboardView, P.UsersView, P.UsersPii, P.UsersNotes, P.WalletView, P.WalletAdjust, P.FinanceView, P.FinancePurchases, P.FinanceRefunds, P.FinanceCashouts, P.FinanceVip, P.OpsEconomy, P.OpsIntegrations],
  },
  {
    key: 'support',
    name: 'Support',
    description: 'Helps users: looks things up, signs people out, small fixes.',
    permissions: [P.DashboardView, P.UsersView, P.UsersPii, P.UsersEdit, P.UsersSessions, P.UsersNotes, P.WalletView, P.FinanceView, P.ModerationView],
  },
  {
    key: 'viewer',
    name: 'Viewer',
    description: 'Read-only access to dashboards and lists.',
    permissions: [P.DashboardView, P.UsersView, P.ModerationView, P.FinanceView, P.OpsLive],
  },
];

export const OWNER_ROLE = 'owner';

/** Expands "*" and drops unknown keys (e.g. a permission removed from code). */
export function effectivePermissions(stored: string[]): Permission[] {
  if (stored.includes(ALL)) return [...ALL_PERMISSIONS];
  return stored.filter(isPermission);
}
