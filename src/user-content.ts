// HTML de usuário que já passou por um sanitizador. Sanitizador comum não remove `hx-*` nem `x-*`:
// sem isto, um `hx-get` no conteúdo faria pedidos em nome de quem está vendo a página.
import { HtmlSafeString, raw } from './jsx-runtime'

/** `<UserContent html={sanitizado} />`. Não sanitiza: desliga htmx e Alpine dentro do trecho. */
export function UserContent(props: { html: string; class?: string }): HtmlSafeString {
  const className = props.class ? ` class="${props.class.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)}"` : ''
  return raw(`<div${className} hx-disable="true" x-ignore>${props.html}</div>`)
}
