import Link from "next/link";

export const metadata = { title: "FAQ — OUTFIT® by ++hellohello" };

const FAQS = [
  {
    q: "How long does shipping take?",
    a: "Domestic orders (Uruguay) arrive in 2-5 business days. International shipping takes 7-14 business days for North America and Europe, 14-21 days for other regions. All orders are processed within 1-2 business days.",
  },
  {
    q: "How much does shipping cost?",
    a: "Shipping is calculated at checkout based on destination and weight. We offer free standard shipping on all orders over $100 USD.",
  },
  {
    q: "What is your return policy?",
    a: "We accept returns within 30 days of delivery for items in their original, unworn condition with all tags attached. Refunds are processed within 5-7 business days of receiving your return.",
  },
  {
    q: "How do I find my size?",
    a: "Each product page has a size guide table showing chest, length, and sleeve measurements in inches. If you&apos;re between sizes, we recommend sizing up for a relaxed fit.",
  },
  {
    q: "Are your products ethically made?",
    a: "Yes. All our apparel is produced in facilities that follow ethical labor practices. We use 100% combed cotton and water-based inks for minimal environmental impact.",
  },
  {
    q: "Do you ship internationally?",
    a: "Yes, we ship worldwide from our fulfillment center in Montevideo, Uruguay. Customs processing may add additional time for international orders.",
  },
  {
    q: "Can I cancel or modify my order?",
    a: "Orders can be cancelled or modified within 12 hours of placement. Contact us immediately if you need to make changes.",
  },
  {
    q: "Do you offer exchanges?",
    a: "Yes, exchanges are subject to availability. If your requested size is out of stock, we will issue a full refund instead.",
  },
  {
    q: "How should I care for my items?",
    a: "Machine wash cold, tumble dry low. Do not bleach. Do not iron directly on prints. Following these instructions will keep your garments looking fresh for years.",
  },
  {
    q: "Do you restock sold-out items?",
    a: "Our products are produced in limited runs. Some items may be restocked based on demand — join our newsletter to be notified of restocks and new drops.",
  },
];

export default function FAQPage() {
  return (
    <main className="min-h-screen px-4 py-32 lg:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-12">
          <div className="mb-6 h-[5px] w-full bg-current" />
          <h1 className="text-6xl font-[900] tracking-tighter md:text-8xl">FAQ</h1>
          <p className="mt-4 text-sm opacity-60">Frequently asked questions</p>
        </div>

        <div className="divide-y divide-current/10">
          {FAQS.map((faq, i) => (
            <details key={i} className="group py-6">
              <summary className="flex cursor-pointer items-center justify-between text-lg font-bold tracking-tight">
                {faq.q}
                <span className="ml-4 text-2xl transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-4 text-sm leading-6 opacity-70" dangerouslySetInnerHTML={{ __html: faq.a }} />
            </details>
          ))}
        </div>

        <div className="mt-16 rounded-lg border border-current/10 p-8 text-center">
          <p className="text-lg font-bold">Still have questions?</p>
          <p className="mt-2 text-sm opacity-60">We&apos;re here to help.</p>
          <Link href="/contact" className="mt-4 inline-block rounded-full bg-current px-8 py-3 text-sm font-bold uppercase tracking-tight text-background">Contact us</Link>
        </div>

        <div className="mt-16">
          <Link href="/" className="link-hover text-sm uppercase">← Back to shop</Link>
        </div>
      </div>
    </main>
  );
}
