import Tasks from './+tasks.partial'

export default function Page() {
  return (
    <main>
      <Tasks page={1} />
      <button {...Tasks.get({ page: 2 }, { target: '#tasks', swap: 'outerHTML' })}>Próxima</button>
      {/* @ts-expect-error a prop é tipada */}
      {false && <Tasks page="texto" />}
    </main>
  )
}
