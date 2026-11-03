// `partial()`: um trecho de página com URL própria. Usa-se como componente, e o htmx pede de novo o
// mesmo trecho. As regras estão em ./partial-logic; aqui só se valida, carrega e renderiza.
import { HtmlSafeString, raw, toHtml } from '../jsx-runtime'
import { getRequestEvent, type RequestEvent } from './app'
import { error } from './errors'
import { withMeta } from '../meta/collector'
import { PARTIAL_NAME, partialAttrs, partialUrl, queryToInput, type PartialRequestAttrs, type PartialRequestOpts, type StandardSchema } from './partial-logic'

type Params = Record<string, string>

export interface PartialLoadContext<I, P> {
  input: I
  params: P
  event: RequestEvent<P>
}

export interface PartialContext<I, D, P> extends PartialLoadContext<I, P> {
  data: Awaited<D>
}

export interface PartialDef<I, D, P> {
  /** Valida o que chega pela URL. Sem ele, o parcial não recebe nada da URL. */
  input?: StandardSchema<I>
  load?: (ctx: PartialLoadContext<I, P>) => D | Promise<D>
  render: (ctx: PartialContext<I, D, P>) => unknown
}

export interface PartialComponent<I> {
  /** Usado como componente: `<List id={1} />`, no HTML da página, sem passar pela rede. */
  (props: I): Promise<HtmlSafeString>
  /** Atributos do htmx para pedir este parcial: `<button {...List.get({ id: 1 }, { target: '#x' })}>`. */
  get(props: I, opts?: PartialRequestOpts): PartialRequestAttrs
  /** Resposta de uma ação de formulário só com este parcial. */
  respond(props: I): Promise<Response>
  /** Uso interno do roteador. */
  bind(name: string, owner: string): void
  /** Uso interno do roteador: valida a URL e renderiza. */
  handle(event: RequestEvent): Promise<string>
}

/** Declara um parcial. Em arquivos: `export default partial({ ... })` em `+name.partial.tsx`. */
export function partial<I = Record<never, never>, D = undefined, P = Params>(def: PartialDef<I, D, P>): PartialComponent<I> {
  let name: string | undefined

  async function html(input: I, event: RequestEvent): Promise<string> {
    const typed = event as unknown as RequestEvent<P>
    const base = { input, params: typed.params, event: typed }
    const data = (def.load ? await def.load(base) : undefined) as Awaited<D>
    return toHtml(def.render({ ...base, data }))
  }

  const component = (async (props: I) => raw(await html(props, getRequestEvent()))) as PartialComponent<I>

  component.get = (props, opts) => {
    if (!name) throw new Error('htsx: parcial sem rota; registre em route(id, { partials: { name } }) ou use +name.partial.tsx')
    return partialAttrs(partialUrl(name, props as object), opts)
  }

  component.respond = async props => new Response(await withMeta(() => html(props, getRequestEvent())), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })

  component.bind = (next, owner) => {
    if (!PARTIAL_NAME.test(next)) throw new Error(`htsx: ${owner}: nome de parcial inválido ${JSON.stringify(next)}; use letras, números, "_" ou "-"`)
    if (name && name !== next) throw new Error(`htsx: ${owner}: o mesmo parcial foi registrado como "${name}" e "${next}"`)
    name = next
  }

  component.handle = async event => {
    if (!def.input) return html({} as I, event)
    const result = await def.input['~standard'].validate(queryToInput(event.url.searchParams))
    // sem detalhes na resposta: quem manda este pedido pode ser qualquer um
    if (result.issues) error(400, 'Parâmetros inválidos')
    return html(result.value, event)
  }

  return component
}

/** Mesmo `partial()`, com `params` tipado pela rota: `partialFor<Params>()({ ... })`, com `Params` de `./$types`. */
export function partialFor<P>() {
  return <I = Record<never, never>, D = undefined>(def: PartialDef<I, D, P>): PartialComponent<I> => partial<I, D, P>(def)
}
