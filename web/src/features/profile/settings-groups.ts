/** The settings groups on Me (a plain module: the route reads it on the server). */
export const SETTINGS_GROUPS = {
  account: "Account",
  activity: "Your activity",
  privacy: "Privacy & safety",
  wallet: "Wallet & invites",
  help: "Help & about",
} as const;
export type SettingsGroupKey = keyof typeof SETTINGS_GROUPS;
export const isSettingsGroup = (g: string): g is SettingsGroupKey => Object.hasOwn(SETTINGS_GROUPS, g);
