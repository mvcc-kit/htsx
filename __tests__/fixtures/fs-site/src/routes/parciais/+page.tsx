import Tarefas from './+tarefas.partial'

export default function Pagina() {
  return (
    <main>
      <Tarefas pagina={1} />
      <button {...Tarefas.get({ pagina: 2 }, { target: '#tarefas', swap: 'outerHTML' })}>Próxima</button>
      {/* @ts-expect-error a prop é tipada */}
      {false && <Tarefas pagina="texto" />}
    </main>
  )
}
