import Link from "next/link";

import { ArticleShell } from "@/components/article-shell";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

export const metadata = pageMetadata({ title: "Delete your Vibe account", description: "How to delete your Vibe account and what happens to your data.", path: "/delete-account/" });

/** The account-deletion page Google Play asks for (Data safety → Delete account URL). */
export default function Page() {
  const email = site.supportEmail;
  return (
    <ArticleShell
      cta={false}
      trail={[
        { name: "Home", path: "/" },
        { name: "Delete account", path: "/delete-account/" },
      ]}
      hero={
        <>
          <h1 className="mt-4 text-[34px] leading-[1.1] font-extrabold tracking-[-0.02em] sm:text-[44px]">Delete your Vibe account</h1>
          <p className="mt-3 text-[16px] text-text2">You can delete your account yourself at any time, in the app or on the website.</p>
        </>
      }
    >
      <div className="prose-site">
        <h2 id="in-the-app">In the app or on the website</h2>
        <ol>
          <li>Open Vibe and sign in.</li>
          <li>
            Go to <strong>Me → Account</strong>.
          </li>
          <li>
            Tap <strong>Delete account</strong> and confirm.
          </li>
        </ol>
        <h2 id="by-email">Can&apos;t sign in?</h2>
        <p>
          E-mail {email ? <a href={`mailto:${email}?subject=Delete%20my%20Vibe%20account`}>{email}</a> : "us"} from the address you signed up with, with the subject &quot;Delete my Vibe
          account&quot;. We&apos;ll delete it within 30 days and confirm by e-mail.
        </p>
        <h2 id="what-happens">What happens to your data</h2>
        <ul>
          <li>Right away: your name, e-mail, bio, profile photo and interests are removed, you&apos;re signed out everywhere, and your sign-ins, devices and saved cash-out accounts are disconnected.</li>
          <li>Messages you sent stay in the other person&apos;s chat, shown as from &quot;Deleted user&quot;.</li>
          <li>Unused coins, gems and VIP time are lost and can&apos;t be refunded. Cash out your gems first.</li>
          <li>
            We keep payment, cash-out and safety records (like reports and bans) only as long as the law and safety require. See our <Link href="/privacy/">Privacy Policy</Link>.
          </li>
        </ul>
      </div>
    </ArticleShell>
  );
}
