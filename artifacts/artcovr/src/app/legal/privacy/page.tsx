import { PublicPage } from "@/components/artcovr/PublicPage";
import { PrivacyPolicyBody } from "@/components/artcovr/PrivacyPolicyBody";
import { PRIVACY_POLICY } from "@/lib/artcovr/privacy-policy";

export default function PrivacyPage() {
  return (
    <PublicPage eyebrow={PRIVACY_POLICY.eyebrow} title={PRIVACY_POLICY.title}>
      <PrivacyPolicyBody />
    </PublicPage>
  );
}
