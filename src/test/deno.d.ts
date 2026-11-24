// The tests import the edge functions' shared code, which reads its configuration through Deno.
declare const Deno: { env: { get(name: string): string | undefined } };
