import { PublicPage } from "@/components/artcovr/PublicPage";
const questions = [
  ["What am I licensing?", "A commercial license to use the purchased artwork and your included generated images in commercial projects. ARTCOVR retains copyright unless a separate signed agreement says otherwise."],
  ["Can I alter the image?", "Yes. The artwork page has one freeform prompt box. Each successful generated image becomes the starting point for your next prompt, and Reset returns to the original artwork."],
  ["What is exclusive artwork?", "Exclusive artwork is reserved during checkout and removed from ARTCOVR after verified payment. Exclusivity does not assign copyright or promise worldwide uniqueness."],
  ["What is repeatable artwork?", "Repeatable artwork may be purchased by more than one customer under a non-exclusive commercial license."],
  ["Where are my images?", "Sign in to My Images to see purchases, prompts, generated images, remaining generations, expiration dates, and downloads."],
  ["Can I resell the image file itself?", "No. Standalone resale, stock or template redistribution, and sublicensing for independent reuse are prohibited."],
  ["Can I use purchased images to train a model?", "No. AI-training use is not included in the commercial license."],
];
export default function FaqPage() { return <PublicPage eyebrow="Support" title="FAQ"><dl className="divide-y divide-current/20 border-y border-current/20">{questions.map(([question, answer]) => <div key={question} className="py-6"><dt className="font-bold">{question}</dt><dd className="mt-3 text-sm leading-6 opacity-70">{answer}</dd></div>)}</dl></PublicPage>; }
