import { PublicPage } from "@/components/artcovr/PublicPage";
import { PolicyBody } from "@/components/artcovr/PolicyBody";
import { TERMS_POLICY } from "@/lib/artcovr/terms-policy";

export default function TermsPage() {
  return (
    <PublicPage eyebrow={TERMS_POLICY.eyebrow} title={TERMS_POLICY.title}>
      <PolicyBody policy={TERMS_POLICY} />
    </PublicPage>
  );
}
