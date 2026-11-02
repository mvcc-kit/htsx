// Juntado ao Worker gerado: Durable Objects (exports nomeados) e handlers além do fetch.
export class Contador {
  private n = 0
  constructor(_state: unknown, _env: unknown) {}
  async fetch(): Promise<Response> { return new Response(String(++this.n)) }
}

export default {
  async scheduled(_controller: unknown, env: { LOG?: string[] }) { env.LOG?.push('scheduled') },
}
