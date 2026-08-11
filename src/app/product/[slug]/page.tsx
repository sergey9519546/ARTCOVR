"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { productsRow1, productsRow2, productsRow3, productsRow4, type Product } from "@/lib/outfit/products";

const ALL_PRODUCTS: Product[] = [...productsRow1, ...productsRow2, ...productsRow3, ...productsRow4];

export default function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState("M");
  const [showBack, setShowBack] = useState(false);
  const [added, setAdded] = useState(false);
  const [slug, setSlug] = useState<string>("");

  useEffect(() => {
    params.then(p => {
      setSlug(p.slug);
      const found = ALL_PRODUCTS.find(pr => pr.slug === p.slug);
      if (!found) {
        notFound();
        return;
      }
      setProduct(found);
    });
  }, [params]);

  const sizes = ["XS", "S", "M", "L", "XL", "XXL"];

  const addToBag = () => {
    if (!product) return;
    try {
      const bag = JSON.parse(localStorage.getItem("bag") || "[]");
      const existing = bag.find((i: any) => i.slug === product.slug && i.size === selectedSize);
      if (existing) {
        existing.qty += 1;
      } else {
        bag.push({
          slug: product.slug,
          name: product.name,
          price: product.price,
          image: product.frontImage,
          size: selectedSize,
          qty: 1,
        });
      }
      localStorage.setItem("bag", JSON.stringify(bag));
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    } catch (e) {
      console.error("Add to bag failed:", e);
    }
  };

  if (!product) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <p className="text-sm opacity-60">Loading...</p>
        </div>
      </main>
    );
  }

  const related = ALL_PRODUCTS.filter(p => p.slug !== product.slug).slice(0, 4);

  return (
    <main className="min-h-screen px-4 py-32 lg:px-6">
      <div className="mx-auto max-w-6xl">
        {/* Breadcrumb */}
        <nav className="mb-8 text-sm uppercase opacity-60">
          <Link href="/" className="link-hover">Shop</Link>
          <span className="mx-2">/</span>
          <span>{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
          {/* Image */}
          <div className="relative aspect-square overflow-hidden rounded-lg bg-[#d2cac3]">
            <img
              src={showBack ? product.backImage : product.frontImage}
              alt={product.name}
              className="h-full w-full object-cover transition-opacity duration-300"
            />
            <button
              onClick={() => setShowBack(!showBack)}
              className="absolute bottom-4 right-4 rounded-full bg-black/80 px-4 py-2 text-xs font-bold uppercase tracking-tight text-white backdrop-blur-sm hover:bg-black"
            >
              {showBack ? "View Front" : "View Back"}
            </button>
          </div>

          {/* Details */}
          <div className="flex flex-col">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase opacity-60">
              <div className="h-2 w-2 rounded-full bg-current" />
              <span>{product.category}</span>
            </div>
            <h1 className="mb-2 text-4xl font-[900] tracking-tighter md:text-5xl">{product.name}</h1>
            <p className="mb-8 text-2xl font-bold">{product.price}</p>

            <div className="mb-8">
              <p className="mb-4 text-sm font-bold uppercase tracking-tight">Size</p>
              <div className="flex flex-wrap gap-2">
                {sizes.map(s => (
                  <button
                    key={s}
                    onClick={() => setSelectedSize(s)}
                    className={`h-12 w-12 rounded-lg border-2 font-bold transition-all ${
                      selectedSize === s
                        ? "border-current bg-current text-background"
                        : "border-current/20 hover:border-current/50"
                    }`}
                    aria-pressed={selectedSize === s}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={addToBag}
              className="mb-4 w-full rounded-full bg-current px-8 py-4 text-sm font-bold uppercase tracking-tight text-background transition-transform hover:scale-[1.02]"
            >
              {added ? "✓ Added to Bag" : "Add to Bag"}
            </button>

            <div className="mt-8 space-y-4 text-sm leading-6 opacity-70">
              <p>Created by the ++hellohello team. Carefully designed apparel for the creatively passionate. Made to be worn, or judged, or both.</p>
              <p>100% combed cotton. Screen printed in Montevideo, Uruguay. Machine wash cold, tumble dry low.</p>
              <p>
                <Link href="/shipping-and-return" className="link-hover">Shipping & Returns →</Link>
              </p>
            </div>
          </div>
        </div>

        {/* Related */}
        <section className="mt-24">
          <h2 className="mb-8 text-2xl font-bold uppercase tracking-tight">You may also like</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
            {related.map(p => (
              <Link key={p.slug} href={`/product/${p.slug}`} className="group block">
                <div className="relative aspect-square overflow-hidden rounded-lg bg-[#d2cac3]">
                  <img src={p.frontImage} alt={p.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                </div>
                <div className="mt-3 flex justify-between text-sm">
                  <p>{p.name}</p>
                  <p className="font-bold">{p.price}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <div className="mt-16">
          <Link href="/" className="link-hover text-sm uppercase">← Back to shop</Link>
        </div>
      </div>
    </main>
  );
}
