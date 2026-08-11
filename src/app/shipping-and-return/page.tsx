import Link from "next/link";

export const metadata = {
  title: "Shipping & Returns — OUTFIT® by ++hellohello",
  description: "Shipping and return policy for OUTFIT® by ++hellohello.",
};

export default function ShippingAndReturnPage() {
  return (
    <main className="min-h-screen px-4 py-32 lg:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-12">
          <div className="mb-6 h-[5px] w-full bg-current" />
          <h1 className="text-6xl font-[900] tracking-tighter md:text-8xl">Shipping<br/>&amp; Returns</h1>
        </div>

        <div className="space-y-12">
          <section>
            <h2 className="mb-4 text-2xl font-bold uppercase tracking-tight">Shipping</h2>
            <div className="space-y-4 text-base leading-7 opacity-80">
              <p>We ship worldwide from our fulfillment center in Montevideo, Uruguay. All orders are processed within 1-2 business days, excluding weekends and holidays. Once your order has shipped, you will receive a confirmation email with tracking information.</p>
              <p>Domestic orders (within Uruguay) typically arrive within 2-5 business days. International shipping times vary by destination: North America and Europe take 7-14 business days, while other regions may take 14-21 business days. Customs processing may add additional time for international orders.</p>
              <p>Shipping costs are calculated at checkout based on destination, package weight, and selected shipping method. Free standard shipping is offered on all orders over $100 USD.</p>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-bold uppercase tracking-tight">Returns</h2>
            <div className="space-y-4 text-base leading-7 opacity-80">
              <p>We accept returns within 30 days of delivery for items in their original, unworn condition with all tags attached. To initiate a return, please contact us with your order number and the reason for return.</p>
              <p>Refunds are processed within 5-7 business days of receiving your returned item. Original shipping costs are non-refundable, and return shipping is the responsibility of the customer unless the item was received damaged or defective.</p>
              <p>Exchanges are subject to availability. If the requested size or item is out of stock, we will issue a full refund instead.</p>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-bold uppercase tracking-tight">Damaged or Defective Items</h2>
            <div className="space-y-4 text-base leading-7 opacity-80">
              <p>If you receive a damaged or defective item, please contact us within 7 days of delivery with photos of the product and packaging. We will arrange a free return and send a replacement or issue a full refund, including original shipping costs.</p>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-bold uppercase tracking-tight">Contact</h2>
            <div className="space-y-2 text-base leading-7 opacity-80">
              <p>For any shipping or return inquiries, please reach out:</p>
              <p>Libertad 2529, Office 102, Montevideo, Uruguay</p>
              <p><a href="https://www.hellohello.is/contact" target="_blank" rel="noopener noreferrer" className="link-hover">Contact form →</a></p>
            </div>
          </section>
        </div>

        <div className="mt-16">
          <Link href="/" className="link-hover text-sm uppercase">← Back to shop</Link>
        </div>
      </div>
    </main>
  );
}
