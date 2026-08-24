import GeneratorForm from '@/components/GeneratorForm';
import HealthStrip from '@/components/HealthStrip';

export default function Page() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-12">
      <header className="mb-10">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-accent">
          Content engine
        </p>
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          LinkedIn Carousel Generator
        </h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Drop a project archive or describe a system. The engine writes the caption, picks a slide
          template, and compiles a 1080 by 1350 carousel ready to publish.
        </p>
      </header>

      <HealthStrip />
      <GeneratorForm />
    </main>
  );
}
