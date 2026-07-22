declare namespace Deno {
  namespace env {
    function get(name: string): string | undefined;
  }

  function serve(handler: (request: Request) => Response | Promise<Response>): void;
}

declare module 'npm:@supabase/supabase-js@2' {
  export const createClient: (...args: unknown[]) => any;
}
