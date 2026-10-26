"use client";

import { useEffect, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { GradientButton } from "@/components/ui/button";
import { ChoiceTile, InterestChip } from "@/components/ui/choice";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { Select, TextArea, TextField } from "@/components/ui/text-field";
import { Headline } from "@/components/ui/typography";
import { errorMessage } from "@/lib/api/errors";
import { COUNTRIES, country, INTERESTS } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { type Gender, genderLabel, GENDERS, type Intent, intentInfo, INTENTS } from "@/lib/models";
import { useSession } from "@/stores/session";

import { changeProfilePhoto } from "@/features/profile/change-photo";
import { InviteBanner } from "@/features/referrals/invite-banner";
import { InviteCodeField } from "@/features/referrals/invite-code-field";

/**
 * Name, age, gender, country, a line about you, what you're here for, a few
 * interests. Age gates 18+. The photo is taken with the camera or picked from
 * files and uploaded (`POST /me/avatar`). First-run setup and "Edit profile"
 * share it; `/me/edit#bio` (or #intent, #interests, #photo) scrolls to that part.
 */
export function ProfileForm({ editing = false, onSaved }: { editing?: boolean; onSaved?: () => void }) {
  const me = useSession((s) => s.me);
  const [name, setName] = useState(me?.name ?? "");
  const [bio, setBio] = useState(me?.bio ?? "");
  const [age, setAge] = useState(!me || me.age < 18 ? 21 : me.age);
  const [gender, setGender] = useState<Gender>(me?.gender ?? "other");
  const [countryCode, setCountryCode] = useState(me?.country.code ?? "PK");
  const [interests, setInterests] = useState<string[]>(me?.interests ?? []);
  const [intent, setIntent] = useState<Intent | null>(me?.intent ?? null);
  const [avatar, setAvatar] = useState(me?.avatarUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Deep links from the Me screen land on the part to fill in.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const el = document.getElementById(`profile-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.querySelector<HTMLElement>("textarea, input")?.focus({ preventScroll: true });
  }, []);

  const toggle = (i: string) => setInterests((list) => (list.includes(i) ? list.filter((x) => x !== i) : [...list, i]));

  const save = async () => {
    const n = name.trim();
    if (n.length < 2) return setError("Tell us what to call you.");
    if (age < 18) return setError("Vibe is for adults only.");
    if (!me) return;
    setError(null);
    setSaving(true);
    try {
      await useSession.getState().saveProfile({ ...me, name: n, age, gender, country: country(countryCode), bio: bio.trim(), interests, intent, avatarUrl: avatar });
      onSaved?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const newPhoto = async () => {
    if (await changeProfilePhoto(setUploading)) setAvatar(useSession.getState().me?.avatarUrl ?? avatar);
  };

  return (
    <div className="mx-auto w-full max-w-[560px] px-6 pt-4 pb-8">
      {!editing ? (
        <>
          <Headline text="Set up your " accent="profile" size={34} accentColor="pink-soft" />
          <p className="type-body mt-2.5 text-[15px] leading-[1.5] text-text2">This is what people see for the first three seconds. Make it count.</p>
          <InviteBanner className="mt-4" />
          <div className="h-6" />
        </>
      ) : null}

      <div id="profile-photo" className="flex justify-center">
        <button type="button" onClick={uploading ? undefined : () => void newPhoto()} aria-label="Change photo" className="relative">
          <Avatar url={avatar} name={name} size={112} ring />
          {uploading ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <Spinner />
            </span>
          ) : null}
          <span className="absolute right-0 bottom-0 flex size-9 items-center justify-center rounded-full border-[3px] border-bg bg-surface3">
            <Icon name="photo_camera" size={16} className="text-white" />
          </span>
        </button>
      </div>
      <p className="type-body mt-1.5 text-center text-[12px] text-muted">Tap to change photo</p>

      <Label text="Name" className="mt-6" />
      <TextField value={name} onChange={(e) => setName(e.target.value)} placeholder="What should people call you?" autoCapitalize="words" autoComplete="given-name" aria-label="Name" />

      <Label text="Age" className="mt-[18px]" />
      <div className="flex items-center">
        <Stepper icon="remove" label="Younger" onClick={() => setAge((a) => Math.max(13, a - 1))} />
        <span className={cn("type-display flex-1 text-center text-[28px]", age < 18 ? "text-bad" : "text-text")} aria-live="polite">
          {age}
        </span>
        <Stepper icon="add" label="Older" onClick={() => setAge((a) => Math.min(99, a + 1))} />
      </div>
      {age < 18 ? <p className="type-body mt-1.5 text-[13px] text-bad">You need to be 18 or older to use Vibe.</p> : null}

      <Label text="I am" className="mt-[18px]" />
      <div className="flex gap-2">
        {GENDERS.map((g) => (
          <ChoiceTile key={g} selected={gender === g} onClick={() => setGender(g)} className="h-[46px] rounded-[16px]">
            <span className={cn("type-title text-[14px] font-semibold", gender === g ? "text-text" : "text-text2")}>{genderLabel[g]}</span>
          </ChoiceTile>
        ))}
      </div>

      <Label text="Country" className="mt-[18px]" />
      <Select label="Country" value={countryCode} onChange={setCountryCode} options={COUNTRIES.map((c) => ({ value: c.code, label: `${c.flag}  ${c.name}` }))} />

      <div id="profile-bio">
        <Label text="About you" className="mt-[18px]" />
        <TextArea
          rows={2}
          maxLength={120}
          showCount
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="One line people see before the call. e.g. Cricket fan, bad at cooking, good at listening."
          aria-label="About you"
        />
      </div>

      <div id="profile-intent">
        <Label text="Here for (optional)" className="mt-2" />
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Here for">
          {INTENTS.map((i) => {
            const on = intent === i;
            return (
              <ChoiceTile
                key={i}
                selected={on}
                onClick={() => setIntent(on ? null : i)}
                className="h-auto min-h-[64px] items-start rounded-[16px] px-3.5 py-2.5 text-left"
              >
                <span className="flex items-center">
                  <Icon name={intentInfo[i].icon} size={18} className={on ? "text-pink-soft" : "text-text2"} />
                  <span className={cn("type-title ml-2 text-[14px] font-semibold", on ? "text-text" : "text-text2")}>{intentInfo[i].label}</span>
                </span>
                <span className="type-body mt-0.5 text-[11.5px] leading-[1.3] text-muted">{intentInfo[i].blurb}</span>
              </ChoiceTile>
            );
          })}
        </div>
        <p className="type-body mt-1.5 ml-0.5 text-[11.5px] text-muted">Shown on your profile. It doesn&apos;t change who you&apos;re matched with.</p>
      </div>

      <Label text="Interests (pick 3 or more)" className="mt-[18px]" />
      <div id="profile-interests" className="flex flex-wrap gap-2">
        {INTERESTS.map((i) => (
          <InterestChip key={i} label={i} selected={interests.includes(i)} onClick={() => toggle(i)} />
        ))}
      </div>

      {error ? <p className="type-body mt-3 text-[13px] text-bad">{error}</p> : null}
      {!editing ? <InviteCodeField className="mt-6" /> : null}
      <div className="mt-7">
        <GradientButton label={editing ? "Save" : "Continue"} busy={saving} onClick={() => void save()} />
      </div>
    </div>
  );
}

const Label = ({ text, className }: { text: string; className?: string }) => <p className={cn("type-overline mb-2.5 ml-0.5", className)}>{text}</p>;

function Stepper({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-12 items-center justify-center rounded-full bg-surface2 text-text transition-[filter] hover:brightness-125"
    >
      <Icon name={icon} size={24} />
    </button>
  );
}
