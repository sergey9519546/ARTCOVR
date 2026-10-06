import React, { Fragment } from "react";
import { PRIVACY_POLICY } from "../../lib/artcovr/privacy-policy";

export function PrivacyPolicyBody() {
  return (
    <>
      <p>{PRIVACY_POLICY.introduction}</p>
      {PRIVACY_POLICY.sections.map((section) => (
        <Fragment key={section.heading}>
          <h2 className="mt-10 text-xl font-bold">{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p className="mt-4" key={paragraph}>{paragraph}</p>
          ))}
        </Fragment>
      ))}
    </>
  );
}
