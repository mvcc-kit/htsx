import { partialFor, type StandardSchema } from 'htsx/kit'
import type { Params } from './$types'

const input: StandardSchema<{ pagina: number }> = {
  '~standard': {
    version: 1,
    vendor: 'teste',
    validate: value => {
      const pagina = Number((value as { pagina?: string }).pagina)
      return Number.isInteger(pagina) && pagina > 0 ? { value: { pagina } } : { issues: [{ message: 'inválida' }] }
    },
  },
}

export default partialFor<Params>()({
  input,
  load: ({ input }) => ({ dobro: input.pagina * 2 }),
  render: ({ input, data }) => <p id="tarefas">{`página ${input.pagina}, dobro ${data.dobro}`}</p>,
})
