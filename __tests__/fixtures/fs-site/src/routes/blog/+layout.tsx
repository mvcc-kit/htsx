import type { LayoutProps } from './$types'

export default function BlogLayout({ children, data }: LayoutProps) {
  return <section data-testid="blog"><h2>{data.secao}</h2>{children}</section>
}
