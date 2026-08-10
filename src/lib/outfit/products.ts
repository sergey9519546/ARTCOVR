export type AspectRatio = "square";
export interface Product { slug: string; name: string; price: string; category: string; frontImage: string; backImage: string; aspect: AspectRatio; }
export const productsRow1: Product[] = [
  { slug: "off-by-design", name: "Off by Design", price: "$36.50", category: "Apparel", frontImage: "/assets/products/off-by-design-front.jpg", backImage: "/assets/products/off-by-design-back.jpg", aspect: "square" },
  { slug: "kerned-confidence-1", name: "Kerned Confidence", price: "$25.00", category: "Apparel", frontImage: "/assets/products/kerned-confidence-front.jpg", backImage: "/assets/products/kerned-confidence-back.jpg", aspect: "square" },
  { slug: "specimen-no-hh01", name: "Specimen No. HH01", price: "$30.00", category: "Apparel", frontImage: "/assets/products/specimen-no-hh01-front.jpg", backImage: "/assets/products/specimen-no-hh01-back.jpg", aspect: "square" },
  { slug: "grid-system-go", name: "Grid System Go", price: "$30.00", category: "Apparel", frontImage: "/assets/products/grid-system-go-front.jpg", backImage: "/assets/products/grid-system-go-back.jpg", aspect: "square" },
];
export const productsRow2: Product[] = [
  { slug: "neutral-grotesk", name: "Neutral Grotesk", price: "$30.00", category: "Apparel", frontImage: "/assets/products/neutral-grotesk-front.jpg", backImage: "/assets/products/neutral-grotesk-back.jpg", aspect: "square" },
  { slug: "red-dot-not-award-1", name: "Red Dot Not Award", price: "$20.00", category: "Apparel", frontImage: "/assets/products/red-dot-not-award-front.jpg", backImage: "/assets/products/red-dot-not-award-back.jpg", aspect: "square" },
  { slug: "gridlocked", name: "Gridlocked", price: "$25.00", category: "Apparel", frontImage: "/assets/products/gridlocked-front.jpg", backImage: "/assets/products/gridlocked-back.jpg", aspect: "square" },
];
export const productsRow3: Product[] = [
  { slug: "hello-week-001", name: "Hello Week 001", price: "$30.00", category: "Apparel", frontImage: "/assets/products/hello-week-001-front.jpg", backImage: "/assets/products/hello-week-001-back.jpg", aspect: "square" },
  { slug: "hello-week-002", name: "Hello Week 002", price: "$30.00", category: "Apparel", frontImage: "/assets/products/hello-week-002-front.jpg", backImage: "/assets/products/hello-week-002-back.jpg", aspect: "square" },
  { slug: "monochrome-manifest-1", name: "Monochrome Manifest", price: "$30.00", category: "Apparel", frontImage: "/assets/products/monochrome-manifest-front.jpg", backImage: "/assets/products/monochrome-manifest-back.jpg", aspect: "square" },
];
export const productsRow4: Product[] = [
  { slug: "positive-space", name: "Positive Space", price: "$30.00", category: "Apparel", frontImage: "/assets/products/positive-space-front.jpg", backImage: "/assets/products/positive-space-back.jpg", aspect: "square" },
  { slug: "whitespace-matters-1", name: "Whitespace Matters", price: "$33.00", category: "Apparel", frontImage: "/assets/products/whitespace-matters-front.jpg", backImage: "/assets/products/whitespace-matters-back.jpg", aspect: "square" },
  { slug: "command-k", name: "Command + K", price: "$15.00", category: "Apparel", frontImage: "/assets/products/command-k-front.jpg", backImage: "/assets/products/command-k-back.jpg", aspect: "square" },
];
export const aspectClass = (_aspect: AspectRatio): string => "w-full aspect-square h-full object-cover";
