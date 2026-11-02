// Saídas de controle das rotas, como no SvelteKit: error(), redirect() e fail().

/** Erro HTTP esperado (404, 403...). A mensagem é mostrada ao usuário. */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'HttpError'
  }
}

export class Redirect {
  constructor(readonly status: 301 | 302 | 303 | 307 | 308, readonly location: string) {}
}

/** Resultado de ação de formulário que falhou na validação: a página é renderizada de novo com `form`. */
export class ActionFailure<T = unknown> {
  constructor(readonly status: number, readonly data: T) {}
}

/** Interrompe a rota com um erro HTTP. Ex.: `error(404, 'Post não encontrado')`. */
export function error(status: number, message: string): never {
  if (status < 400 || status > 599) throw new Error(`htsx: error(${status}) precisa de status entre 400 e 599`)
  throw new HttpError(status, message)
}

/** Interrompe a rota com redirecionamento. Use 303 depois de um POST. */
export function redirect(status: 301 | 302 | 303 | 307 | 308, location: string): never {
  throw new Redirect(status, location)
}

/** Devolva de uma ação para responder com erro de validação e repor o formulário. */
export function fail<T>(status: number, data: T): ActionFailure<T> {
  if (status < 400 || status > 599) throw new Error(`htsx: fail(${status}) precisa de status entre 400 e 599`)
  return new ActionFailure(status, data)
}
