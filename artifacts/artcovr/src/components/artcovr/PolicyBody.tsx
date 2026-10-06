import React, { Fragment } from "react";
import type { PolicyDocument } from "../../lib/artcovr/policy-document";

export function PolicyBody({ policy }: { policy: PolicyDocument }) {
  return (
    <>
      <p>{policy.introduction}</p>
      {policy.sections.map((section) => (
        <Fragment key={section.heading}>
          <h2 className="mt-10 text-xl font-bold">{section.heading}</h2>
          {section.blocks.map((block, index) => block.kind === "paragraph" ? (
            <p className={block.spacing === "wide" ? "mt-6" : "mt-4"} key={index}>
              {block.text}
            </p>
          ) : (
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6" key={index}>
              {block.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ))}
        </Fragment>
      ))}
    </>
  );
}
