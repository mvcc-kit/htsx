import { partialFor, type StandardSchema } from 'htsx/kit'
import type { Params } from './$types'

const input: StandardSchema<{ page: number }> = {
  '~standard': {
    version: 1,
    vendor: 'teste',
    validate: value => {
      const page = Number((value as { page?: string }).page)
      return Number.isInteger(page) && page > 0 ? { value: { page } } : { issues: [{ message: 'inválida' }] }
    },
  },
}

export default partialFor<Params>()({
  input,
  load: ({ input }) => ({ double: input.page * 2 }),
  render: ({ input, data }) => <p id="tasks">{`page ${input.page}, double ${data.double}`}</p>,
})
