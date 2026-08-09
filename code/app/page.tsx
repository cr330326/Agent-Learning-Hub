import { parseRuntimeConfig } from "@/modules/runtime/runtime-config";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const runtime = parseRuntimeConfig(process.env);

  return (
    <main>
      <p>Agent Learning Hub</p>
      <h1>The new learning environment is being prepared.</h1>
      <p>
        The catalog, reader, learning state, and dual runtime modes will arrive
        in phased releases.
      </p>
      <p>Current runtime: {runtime.mode}</p>
    </main>
  );
}
