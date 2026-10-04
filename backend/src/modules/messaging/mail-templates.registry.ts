import type { MailFields } from './mail-renderer';

export interface TemplateVariable {
  name: string;
  description: string;
  /** Used in previews and test e-mails. */
  sample: string;
}

export interface SystemTemplate {
  key: string;
  name: string;
  description: string;
  /** system = sent automatically by the server; starter = a starting point for messages. */
  usage: 'system' | 'starter';
  variables: TemplateVariable[];
  /** Variables that must appear somewhere (e.g. the sign-in code). */
  required?: string[];
  defaults: MailFields;
}

/** Available in every template. */
export const COMMON_VARIABLES: TemplateVariable[] = [
  { name: 'name', description: "The person's name (\"there\" if they haven't set one)", sample: 'Sara' },
  { name: 'email', description: 'Their e-mail address', sample: 'sara@gmail.com' },
  { name: 'appName', description: 'Vibe', sample: 'Vibe' },
];

/** Only in message e-mails (people can opt out); added to the footer automatically too. */
export const MESSAGE_VARIABLES: TemplateVariable[] = [{ name: 'unsubscribeUrl', description: 'Link to stop e-mail updates', sample: 'https://vibe.app/unsubscribe' }];

/**
 * Built-in templates. Wording here is the default; staff can edit it in the
 * admin panel (stored as an override) and reset back to this.
 */
export const SYSTEM_TEMPLATES: SystemTemplate[] = [
  {
    key: 'sign_in_code',
    name: 'Sign-in code',
    description: 'Sent when someone signs in with their e-mail.',
    usage: 'system',
    variables: [
      { name: 'code', description: 'The 4-digit code', sample: '4821' },
      { name: 'minutes', description: 'Minutes until the code expires', sample: '10' },
    ],
    required: ['code'],
    defaults: {
      subject: '{{code}} is your Vibe code',
      preheader: 'It expires in {{minutes}} minutes.',
      heading: 'Your sign-in code',
      body: 'Enter this code in the Vibe app to sign in.',
      highlight: '{{code}}',
      buttonLabel: '',
      buttonUrl: '',
      footer: "It expires in {{minutes}} minutes and works once. If you didn't try to sign in, you can ignore this e-mail — nobody can get in without the code.",
    },
  },
  {
    key: 'general_message',
    name: 'General message',
    description: 'A friendly note from the team. Starting point for messages.',
    usage: 'starter',
    variables: [],
    defaults: {
      subject: 'News from Vibe',
      preheader: '',
      heading: 'Hi {{name}},',
      body: "We've got something new for you.\n\nOpen the app to take a look.",
      highlight: '',
      buttonLabel: '',
      buttonUrl: '',
      footer: 'Thanks for being part of Vibe.',
    },
  },
  {
    key: 'service_notice',
    name: 'Service notice',
    description: 'Important account or policy information. Starting point for messages.',
    usage: 'starter',
    variables: [],
    defaults: {
      subject: 'An update about your Vibe account',
      preheader: '',
      heading: 'Hi {{name}},',
      body: "We're writing to let you know about a change that affects your account.\n\n**What's changing:** …\n\n**What you need to do:** nothing — this is just so you know.",
      highlight: '',
      buttonLabel: '',
      buttonUrl: '',
      footer: 'Questions? Just reply to this e-mail.',
    },
  },
];

export const findSystemTemplate = (key: string) => SYSTEM_TEMPLATES.find((t) => t.key === key);
