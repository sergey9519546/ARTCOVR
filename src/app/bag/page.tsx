"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { OutfitWordmark } from "@/components/outfit/Svgs";

interface BagItem {
  slug: string;
  name: string;
  price: string;
  image: string;
  size: string;
  qty: number;
}

export default function BagPage() {
  const [items, setItems] = useState<BagItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", address: "", city: "", zip: "", country: "" });

  useEffect(() => {
    try {
      const b = JSON.parse(localStorage.getItem("bag") || "[]");
      setItems(Array.isArray(b) ? b : []);
    } catch {
      setItems([]);
    }
    setMounted(true);
  }, []);

  const removeItem = (slug: string, size: string) => {
    const next = items.filter(i => !(i.slug === slug && i.size === size));
    setItems(next);
    localStorage.setItem("bag", JSON.stringify(next));
  };

  const updateQty = (slug: string, size: string, delta: number) => {
    const next = items.map(i => {
      if (i.slug === slug && i.size === size) {
        return { ...i, qty: Math.max(1, i.qty + delta) };
      }
      return i;
    });
    setItems(next);
    localStorage.setItem("bag", JSON.stringify(next));
  };

  const total = items.reduce((sum, i) => {
    const price = parseFloat(i.price.replace(/[^0-9.]/g, "")) || 0;
    return sum + price * i.qty;
  }, 0);

  const shipping = total > 100 ? 0 : 8;
  const tax = total * 0.08;
  const grandTotal = total + shipping + tax;

  const handleCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate order processing
    setOrderComplete(true);
    localStorage.setItem("bag", "[]");
    setItems([]);
  };

  if (!mounted) return null;

  if (orderComplete) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-32">
        <div className="max-w-md text-center">
          <div className="mb-8 w-32 mx-auto opacity-40"><OutfitWordmark /></div>
          <h1 className="mb-4 text-4xl font-[900] tracking-tighter">Order placed!</h1>
          <p className="mb-8 text-sm opacity-60">A confirmation email has been sent to {form.email || "your email"}. Your order will ship in 1-2 business days.</p>
          <Link href="/" className="inline-block rounded-full bg-current px-8 py-4 text-sm font-bold uppercase tracking-tight text-background">Continue shopping</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-32 lg:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-12">
          <div className="mb-6 h-[5px] w-full bg-current" />
          <h1 className="text-6xl font-[900] tracking-tighter md:text-8xl">Bag</h1>
          <p className="mt-4 text-sm opacity-60">{items.length} {items.length === 1 ? "item" : "items"}</p>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="mb-8 w-48 opacity-30"><OutfitWordmark /></div>
            <p className="mb-8 text-xl opacity-60">Your bag is empty</p>
            <Link href="/" className="link-hover uppercase text-sm font-bold">Continue shopping</Link>
          </div>
        ) : (
          <>
            <div className="divide-y divide-current/10">
              {items.map((item) => (
                <div key={`${item.slug}-${item.size}`} className="flex gap-6 py-6">
                  <div className="aspect-square w-24 flex-shrink-0 overflow-hidden rounded-lg bg-[#d2cac3] md:w-32">
                    {item.image && <img src={item.image} alt={item.name} className="h-full w-full object-cover" />}
                  </div>
                  <div className="flex flex-1 flex-col justify-between">
                    <div>
                      <h3 className="text-lg font-bold">{item.name}</h3>
                      <p className="text-sm opacity-60">Size: {item.size}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-3">
                        <button onClick={() => updateQty(item.slug, item.size, -1)} className="h-8 w-8 rounded-full border border-current/20 hover:bg-current/10" aria-label="Decrease quantity">−</button>
                        <span className="w-8 text-center">{item.qty}</span>
                        <button onClick={() => updateQty(item.slug, item.size, 1)} className="h-8 w-8 rounded-full border border-current/20 hover:bg-current/10" aria-label="Increase quantity">+</button>
                      </div>
                      <button onClick={() => removeItem(item.slug, item.size)} className="text-sm opacity-60 hover:opacity-100 underline">Remove</button>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{item.price}</p>
                  </div>
                </div>
              ))}
            </div>

            {checkingOut ? (
              <form onSubmit={handleCheckout} className="mt-12 space-y-6 border-t border-current/10 pt-8">
                <h2 className="text-2xl font-bold uppercase tracking-tight">Shipping Details</h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <input required type="email" placeholder="Email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="rounded-lg border border-current/20 bg-transparent px-4 py-3 text-sm outline-none focus:border-current" />
                  <input required type="text" placeholder="Full name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="rounded-lg border border-current/20 bg-transparent px-4 py-3 text-sm outline-none focus:border-current" />
                  <input required type="text" placeholder="Address" value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="rounded-lg border border-current/20 bg-transparent px-4 py-3 text-sm outline-none focus:border-current md:col-span-2" />
                  <input required type="text" placeholder="City" value={form.city} onChange={e => setForm({...form, city: e.target.value})} className="rounded-lg border border-current/20 bg-transparent px-4 py-3 text-sm outline-none focus:border-current" />
                  <input required type="text" placeholder="ZIP / Postal code" value={form.zip} onChange={e => setForm({...form, zip: e.target.value})} className="rounded-lg border border-current/20 bg-transparent px-4 py-3 text-sm outline-none focus:border-current" />
                  <input required type="text" placeholder="Country" value={form.country} onChange={e => setForm({...form, country: e.target.value})} className="rounded-lg border border-current/20 bg-transparent px-4 py-3 text-sm outline-none focus:border-current md:col-span-2" />
                </div>
                <div className="space-y-2 border-t border-current/10 pt-4 text-sm">
                  <div className="flex justify-between"><span className="opacity-60">Subtotal</span><span>${total.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="opacity-60">Shipping</span><span>{shipping === 0 ? "Free" : `$${shipping.toFixed(2)}`}</span></div>
                  <div className="flex justify-between"><span className="opacity-60">Tax (8%)</span><span>${tax.toFixed(2)}</span></div>
                  <div className="flex justify-between border-t border-current/10 pt-2 text-lg font-bold"><span>Total</span><span>${grandTotal.toFixed(2)}</span></div>
                </div>
                <div className="flex gap-4">
                  <button type="submit" className="flex-1 rounded-full bg-current px-8 py-4 text-sm font-bold uppercase tracking-tight text-background transition-transform hover:scale-105">Place order</button>
                  <button type="button" onClick={() => setCheckingOut(false)} className="rounded-full border border-current/20 px-8 py-4 text-sm font-bold uppercase tracking-tight">Cancel</button>
                </div>
              </form>
            ) : (
              <div className="mt-12 flex flex-col gap-6 border-t border-current/10 pt-8 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm opacity-60">Subtotal</p>
                  <p className="text-3xl font-bold">${total.toFixed(2)}</p>
                  <p className="mt-1 text-xs opacity-40">{total < 100 ? `Add $${(100-total).toFixed(2)} for free shipping` : "Free shipping unlocked!"}</p>
                </div>
                <button onClick={() => setCheckingOut(true)} className="rounded-full bg-current px-8 py-4 text-sm font-bold uppercase tracking-tight text-background transition-transform hover:scale-105">
                  Checkout
                </button>
              </div>
            )}
          </>
        )}

        <div className="mt-16">
          <Link href="/" className="link-hover text-sm uppercase">← Back to shop</Link>
        </div>
      </div>
    </main>
  );
}
