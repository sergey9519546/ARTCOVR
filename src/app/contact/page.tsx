"use client";
import { useState } from "react";
import Link from "next/link";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
    setForm({ name: "", email: "", subject: "", message: "" });
    setTimeout(() => setSent(false), 5000);
  };

  return (
    <main className="min-h-screen px-4 py-32 lg:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-12">
          <div className="mb-6 h-[5px] w-full bg-current" />
          <h1 className="text-6xl font-[900] tracking-tighter md:text-8xl">Contact</h1>
        </div>

        <p className="mb-12 text-lg opacity-70">Have a question? Want to collaborate? Drop us a line.</p>

        {sent ? (
          <div className="rounded-lg border border-current/20 p-8 text-center">
            <p className="text-2xl font-bold">Message sent!</p>
            <p className="mt-2 text-sm opacity-60">We&apos;ll get back to you within 48 hours.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-tight">Name</label>
                <input required type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full rounded-lg border border-current/20 bg-transparent px-4 py-3 text-sm outline-none focus:border-current" />
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-tight">Email</label>
                <input required type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full rounded-lg border border-current/20 bg-transparent px-4 py-3 text-sm outline-none focus:border-current" />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-tight">Subject</label>
              <input required type="text" value={form.subject} onChange={e => setForm({...form, subject: e.target.value})} className="w-full rounded-lg border border-current/20 bg-transparent px-4 py-3 text-sm outline-none focus:border-current" />
            </div>
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-tight">Message</label>
              <textarea required rows={6} value={form.message} onChange={e => setForm({...form, message: e.target.value})} className="w-full resize-none rounded-lg border border-current/20 bg-transparent px-4 py-3 text-sm outline-none focus:border-current" />
            </div>
            <button type="submit" className="w-full rounded-full bg-current px-8 py-4 text-sm font-bold uppercase tracking-tight text-background transition-transform hover:scale-105">Send message</button>
          </form>
        )}

        <div className="mt-16 grid grid-cols-1 gap-8 border-t border-current/10 pt-8 md:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-tight opacity-60">Studio</p>
            <p className="mt-2">Libertad 2529, Office 102</p>
            <p>Montevideo, Uruguay</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-tight opacity-60">Elsewhere</p>
            <p className="mt-2"><a href="https://www.hellohello.is" target="_blank" rel="noopener noreferrer" className="link-hover">++hellohello →</a></p>
            <p><a href="https://www.instagram.com/hellohelloteam" target="_blank" rel="noopener noreferrer" className="link-hover">Instagram →</a></p>
          </div>
        </div>

        <div className="mt-16">
          <Link href="/" className="link-hover text-sm uppercase">← Back to shop</Link>
        </div>
      </div>
    </main>
  );
}
