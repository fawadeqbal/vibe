import { ldJson } from "@/lib/seo";

/** One structured-data graph per page. */
export function JsonLd({ nodes }: { nodes: object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(...nodes) }} />;
}
