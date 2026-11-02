import type { PageProps } from './$types'

export default function Blog({ data }: PageProps) {
  return <ul>{data.posts.map(slug => <li><a href={`/blog/${slug}`}>{slug}</a></li>)}</ul>
}
