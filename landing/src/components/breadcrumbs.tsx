/** Visible trail; the matching BreadcrumbList schema comes from lib/seo. */
export function Breadcrumbs({ trail }: { trail: { name: string; path: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
        {trail.map((t, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={t.path} className="flex items-center gap-2">
              {last ? (
                <span aria-current="page" className="text-text2">{t.name}</span>
              ) : (
                <>
                  <a href={t.path} className="transition-colors hover:text-pink-soft">{t.name}</a>
                  <span aria-hidden="true" className="text-faint">/</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
