/** The round "V" used for the Vibe team (Chats row, inbox cards). */
export function TeamAvatar({ size = 52 }: { size?: number }) {
  return (
    <span className="bg-brand flex shrink-0 items-center justify-center text-white" style={{ width: size, height: size, borderRadius: size * 0.32 }} aria-hidden>
      <span className={size * 0.46 >= 20 ? "type-title-lg" : "type-title"} style={{ fontSize: size * 0.46 }}>
        V
      </span>
    </span>
  );
}
