import type { LayoutProps } from './$types'

export default function Root({ children, data }: LayoutProps) {
  return (
    <html lang="pt-br">
      <body>
        <header><b>{data.site}</b> · <span data-testid="user">{data.user}</span></header>
        {children}
      </body>
    </html>
  )
}
