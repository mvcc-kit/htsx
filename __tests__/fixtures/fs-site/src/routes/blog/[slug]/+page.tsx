import type { PageProps } from './$types'

export default function Post({ data, form, params }: PageProps) {
  return (
    <article data-slug={params.slug}>
      <h1>{data.post}</h1>
      <small>{data.categoria} · {data.user}</small>
      <form method="post" action="?/comentar"><input name="texto" /></form>
      {form ? <p role="alert">{'erro' in form ? form.erro : `ok: ${form.ok}`}</p> : null}
    </article>
  )
}
