export type AnswerGuide = {
  path: string;
  eyebrow: string;
  title: string;
  displayTitle: string;
  description: string;
  introduction: string;
  keyTakeaways: readonly string[];
  lastReviewed: string;
  sections: readonly {
    heading: string;
    answer: string;
  }[];
  sources: readonly {
    title: string;
    publisher: string;
    href: string;
    description: string;
  }[];
  links: readonly {
    href: string;
    label: string;
  }[];
};

export const ANSWER_GUIDES: readonly AnswerGuide[] = [
  {
    path: "/guides/cover-art-licensing",
    eyebrow: "Cover art licensing guide",
    title: "How to License Cover Art for a Music Release | ARTCOVR",
    displayTitle: "HOW TO LICENSE COVER ART.",
    description:
      "Learn how commercial cover art licensing works for music releases, including permitted uses, attribution, editing, digital delivery, and restrictions.",
    introduction:
      "A cover art license gives you defined permission to use an artwork without transferring the underlying copyright. Before checkout, confirm the work, price, sale mode, permitted uses, and restrictions.",
    keyTakeaways: [
      "A commercial license grants defined usage permission; it does not automatically transfer copyright.",
      "Editing and generated-image access are governed by the allowance and restrictions shown at checkout.",
      "Standalone resale, stock redistribution, sublicensing, and model training are outside the ARTCOVR license.",
    ],
    lastReviewed: "2026-09-05",
    sections: [
      {
        heading: "What can licensed cover art be used for?",
        answer:
          "An ARTCOVR commercial license covers the purchased artwork and included generated images for commercial creative projects, including a music release and its promotion.",
      },
      {
        heading: "Does purchasing cover art transfer copyright?",
        answer:
          "No. Purchasing grants a commercial license. It does not transfer the underlying copyright or allow a buyer to claim authorship of an AI-generated result.",
      },
      {
        heading: "Can licensed cover art be edited?",
        answer:
          "Yes. A purchase includes prompt-based editing access subject to the allowance shown at checkout. Generated images remain governed by the same commercial license and restrictions.",
      },
      {
        heading: "What uses are prohibited?",
        answer:
          "The license does not permit standalone resale, stock or template redistribution, sublicensing for independent reuse, or use of purchased images to train an AI model.",
      },
      {
        heading: "How is digital cover art delivered?",
        answer:
          "Payment is verified through Stripe before access begins. Purchased and generated files are then available through authenticated, time-limited download access in My Images.",
      },
    ],
    sources: [
      {
        title: "What is Copyright?",
        publisher: "U.S. Copyright Office",
        href: "https://www.copyright.gov/what-is-copyright/",
        description:
          "General explanation of copyright ownership and permissions; it does not replace the ARTCOVR license.",
      },
      {
        title: "Commercial Cover Art License",
        publisher: "ARTCOVR",
        href: "/license",
        description:
          "The first-party terms that control permitted uses, restrictions, and delivery for ARTCOVR purchases.",
      },
    ],
    links: [
      { href: "/license", label: "Read the commercial license" },
      { href: "/faq", label: "Review licensing questions" },
      { href: "/refunds", label: "Understand refunds and delivery" },
    ],
  },
  {
    path: "/guides/exclusive-cover-art",
    eyebrow: "Exclusive cover art guide",
    title: "Exclusive Cover Art Licensing Explained | ARTCOVR",
    displayTitle: "EXCLUSIVE COVER ART, EXPLAINED.",
    description:
      "Understand exclusive cover art licensing, temporary checkout reservations, removal after verified payment, copyright limits, and repeatable alternatives.",
    introduction:
      "Exclusive cover art is sold under a one-customer storefront model. The label describes future availability on ARTCOVR; it does not transfer copyright or guarantee that no similar image exists elsewhere.",
    keyTakeaways: [
      "Exclusive means the purchased work is removed from future sale on ARTCOVR after verified payment.",
      "A temporary checkout reservation is not a completed purchase and expires if payment is not verified.",
      "Exclusivity is a storefront commitment, not a promise of worldwide uniqueness or copyright assignment.",
    ],
    lastReviewed: "2026-09-05",
    sections: [
      {
        heading: "What does exclusive cover art mean?",
        answer:
          "After verified payment, an exclusive artwork is removed from future sale on ARTCOVR. The buyer receives the commercial license shown at checkout.",
      },
      {
        heading: "How long is an exclusive artwork reserved?",
        answer:
          "Starting checkout places an exclusive work on a temporary reservation for about 30 minutes. Expired or failed reservations are released so another customer can purchase it.",
      },
      {
        heading: "Does exclusivity transfer copyright?",
        answer:
          "No. Exclusivity does not assign copyright, authorship, or ownership of the underlying base artwork. It controls future sale of that work through ARTCOVR.",
      },
      {
        heading: "Does exclusivity guarantee worldwide uniqueness?",
        answer:
          "No. ARTCOVR does not promise that no visually similar work exists elsewhere. The exclusive commitment is removal of the purchased work from this storefront after verified payment.",
      },
      {
        heading: "What is repeatable cover art?",
        answer:
          "Repeatable artwork remains available to more than one customer under separate non-exclusive commercial licenses.",
      },
    ],
    sources: [
      {
        title: "Commercial Cover Art License",
        publisher: "ARTCOVR",
        href: "/license",
        description:
          "The first-party terms that define exclusive and repeatable availability on the ARTCOVR storefront.",
      },
      {
        title: "Terms of Use",
        publisher: "ARTCOVR",
        href: "/legal/terms",
        description:
          "The first-party purchase, payment verification, and fulfillment terms.",
      },
      {
        title: "What is Copyright?",
        publisher: "U.S. Copyright Office",
        href: "https://www.copyright.gov/what-is-copyright/",
        description:
          "General copyright context; it does not define ARTCOVR's storefront exclusivity policy.",
      },
    ],
    links: [
      { href: "/archive", label: "Browse available cover art" },
      { href: "/license", label: "Compare license terms" },
      { href: "/legal/terms", label: "Read the terms of use" },
    ],
  },
  {
    path: "/guides/ai-generated-cover-art",
    eyebrow: "AI cover art rights guide",
    title: "AI-Generated Cover Art Rights and Usage | ARTCOVR",
    displayTitle: "AI COVER ART RIGHTS.",
    description:
      "Learn how ARTCOVR handles AI-generated cover art, commercial usage, authorship limits, prompt-based editing, redistribution, and model-training restrictions.",
    introduction:
      "ARTCOVR publishes and licenses base compositions with prompt-based AI editing. Commercial permission comes from the ARTCOVR license, while authorship and copyright claims remain limited by the license and applicable law.",
    keyTakeaways: [
      "Commercial use depends on the ARTCOVR license delivered with the purchase.",
      "A prompt or generated result does not, by itself, transfer copyright or authorize a buyer to claim authorship.",
      "Standalone resale, stock redistribution, sublicensing, and model training are not included.",
    ],
    lastReviewed: "2026-09-05",
    sections: [
      {
        heading: "Can AI-generated cover art be used commercially?",
        answer:
          "Yes, when it is delivered through an ARTCOVR purchase and used within the commercial license. The license covers the purchased base artwork and the included generated images.",
      },
      {
        heading: "Can a buyer claim authorship of an AI-generated result?",
        answer:
          "No. The ARTCOVR license does not permit a buyer to claim authorship or copyright ownership of an AI-generated result.",
      },
      {
        heading: "How does prompt-based editing work?",
        answer:
          "A purchaser can describe a change in one freeform prompt. Each successful result can become the starting point for the next edit, and Reset returns to the original artwork.",
      },
      {
        heading: "Can generated images be resold as files?",
        answer:
          "No. Standalone resale, stock-library distribution, template redistribution, and sublicensing for independent reuse are prohibited.",
      },
      {
        heading: "Can purchased images be used for AI training?",
        answer:
          "No. Model-training rights are not included in the commercial license.",
      },
    ],
    sources: [
      {
        title: "Copyright and Artificial Intelligence",
        publisher: "U.S. Copyright Office",
        href: "https://www.copyright.gov/ai/",
        description:
          "The U.S. Copyright Office resource hub for current reports and policy work on copyright and AI.",
      },
      {
        title: "Copyright and Artificial Intelligence, Part 2: Copyrightability",
        publisher: "U.S. Copyright Office",
        href: "https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-2-Copyrightability-Report.pdf",
        description:
          "A government report discussing human authorship and copyrightability questions; it is not legal advice.",
      },
      {
        title: "Commercial Cover Art License",
        publisher: "ARTCOVR",
        href: "/license",
        description:
          "The first-party terms that control commercial use, editing, redistribution, and training restrictions.",
      },
    ],
    links: [
      { href: "/license", label: "Read the commercial license" },
      { href: "/faq", label: "Read the cover art FAQ" },
      { href: "/about", label: "Learn how ARTCOVR works" },
    ],
  },
] as const;

export const ANSWER_GUIDE_BY_PATH = new Map(
  ANSWER_GUIDES.map((guide) => [guide.path, guide]),
);