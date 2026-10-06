import Link from "@/components/compat/Link";
import { PublicPage } from "@/components/artcovr/PublicPage";
import { PolicyBody } from "@/components/artcovr/PolicyBody";
import { LICENSE_POLICY } from "@/lib/artcovr/license-policy";

export default function LicensePage() {
  return (
    <PublicPage eyebrow={LICENSE_POLICY.eyebrow} title={LICENSE_POLICY.title}>
      <PolicyBody policy={LICENSE_POLICY} />
      {LICENSE_POLICY.links.map(({ href, label }) => (
        <Link key={href} href={href} className="link-hover mt-8 inline-block text-xs font-bold uppercase tracking-[.08em]">
          {label}
        </Link>
      ))}
    </PublicPage>
  );
}
