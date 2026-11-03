// <img> que não faz a página pular: largura e altura obrigatórias, e carregamento adiado.
import { HtmlSafeString, jsx } from './jsx-runtime'

export interface ImageProps {
  src: string
  /** Texto para leitor de tela. Imagem decorativa: `alt=""`. */
  alt: string
  width: number
  height: number
  /** Imagem principal da página, visível sem rolar: carrega antes das outras. */
  priority?: boolean
  [key: string]: unknown
}

export function Image({ priority, ...props }: ImageProps): HtmlSafeString | Promise<HtmlSafeString> {
  return jsx('img', {
    loading: priority ? 'eager' : 'lazy',
    decoding: 'async',
    fetchpriority: priority ? 'high' : undefined,
    ...props,
  })
}
