export type PolicyBlock =
  | { kind: "paragraph"; text: string; spacing?: "wide" }
  | { kind: "list"; items: readonly string[] };

export type PolicyDocument = {
  eyebrow: string;
  title: string;
  introduction: string;
  sections: readonly { heading: string; blocks: readonly PolicyBlock[] }[];
  links?: readonly { href: string; label: string }[];
};

// Use the same ordered content for crawler HTML and the interactive policy.
// Rendering callbacks retain the static site's escaping and link conventions.
export function renderPolicyHtml(
  policy: PolicyDocument,
  escape: (value: string) => string,
  link: (href: string, label: string) => string,
) {
  return `<p>${escape(policy.introduction)}</p>${policy.sections.map((section) =>
    `<h2>${escape(section.heading)}</h2>${section.blocks.map((block) =>
      block.kind === "paragraph"
        ? `<p>${escape(block.text)}</p>`
        : `<ul>${block.items.map((item) => `<li>${escape(item)}</li>`).join("")}</ul>`,
    ).join("")}`,
  ).join("")}${(policy.links ?? []).map(({ href, label }) => link(href, label)).join("")}`;
}
