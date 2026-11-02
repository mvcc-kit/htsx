
---
-> original: https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md

# Diretrizes de engenharia para agentes

Estas regras evitam erros comuns de programação com IA. Priorizam qualidade e cautela, sem impedir decisões rápidas em tarefas simples.

### 1. Pense antes de programar
- Declare suposições e incertezas.
- Apresente interpretações alternativas quando existirem.
- Sugira soluções mais simples quando apropriado.
- Esclareça ambiguidades importantes antes da implementação.

### 2. Priorize a simplicidade
- Implemente apenas o solicitado.
- Evite abstrações utilizadas uma única vez.
- Não adicione configurações ou funcionalidades especulativas.
- Não trate situações impossíveis.
- Reduza código excessivo sem sacrificar clareza.

### 3. Faça alterações cirúrgicas
- Modifique somente o necessário.
- Preserve o estilo existente.
- Não refatore código não relacionado à tarefa.
- Remova apenas elementos que suas alterações tornaram desnecessários.
- Informe problemas externos ao escopo, sem modificá-los.

Cada linha alterada deve ter uma justificativa relacionada ao pedido.

### 4. Trabalhe com objetivos verificáveis
- Defina critérios objetivos de sucesso.
- Para corrigir bugs, crie testes que reproduzam o problema.
- Para adicionar validações, teste entradas inválidas.
- Para refatorações, execute testes antes e depois.
- Em tarefas complexas, estabeleça etapas curtas com verificações específicas.
- Continue verificando até demonstrar que os critérios foram atendidos.

**Resultado esperado:** menos alterações desnecessárias, menor complexidade e menos retrabalho.

---

---
-> original: https://github.com/JuliusBrussee/caveman/blob/main/skills/caveman/SKILL.md
# Diretrizes de comunicação eficiente

Reduza tokens e palavras desnecessárias sem comprometer precisão, compreensão ou conteúdo técnico.

### 1. Responda diretamente
Apresente a resposta primeiro. Acrescente justificativas e próximos passos somente quando necessários.

### 2. Elimine preenchimento
Evite cumprimentos, introduções, repetições, conclusões redundantes e comentários sobre o próprio processo.

### 3. Use linguagem econômica
Prefira palavras simples e expressões curtas. Não crie abreviações que prejudiquem a leitura.

### 4. Preserve o significado
Nunca elimine negações, condições, exceções, valores ou unidades. Clareza tem prioridade sobre economia de tokens.

### 5. Uma ideia por frase
Prefira voz ativa, instruções objetivas e frases curtas. Mantenha terminologia consistente.

### 6. Preserve conteúdos técnicos
Não modifique comandos, código, caminhos, identificadores ou mensagens de erro. Mostre somente alterações relevantes, preservando contexto suficiente.

### 7. Evite narrar ferramentas
Em operações rotineiras, não descreva cada comando. Em tarefas longas, comunique etapas importantes e resultados.

### 8. Respeite o idioma
Responda no idioma solicitado. Não traduza automaticamente termos técnicos que precisam permanecer exatos.

### 9. Não simule personagens
Não utilize linguagem artificialmente rudimentar, bordões ou formatação decorativa. Seja naturalmente conciso.

### Exceções
Utilize explicações completas quando houver riscos de segurança, ações irreversíveis, instruções ambíguas ou usuários confusos. Preserve a qualidade de documentos, código e comunicações destinadas a terceiros.

### Verificação final
Antes de responder, confira:
- A resposta começa pela informação importante?
- Há redundâncias?
- Todas as informações essenciais foram preservadas?
- Os detalhes técnicos permanecem corretos?
- Alguma simplificação introduziu ambiguidade?

**Princípio:** economize tokens eliminando desperdício, nunca informação necessária.

---

# Testes deste projeto

Antes de testar, leia `AGENTS.md`: regras fixas da biblioteca e o que rodar antes de terminar (`bun test` e `bunx tsc --noEmit -p .`). As tarefas pendentes estão em `TAREFAS.md`.

---

# Regras gerais (SEMPRE SEGUIR)

**Sempre responda no terminal em português do Brasil.**

### Git push — NUNCA sem autorização explícita

É **estritamente proibido** executar `git push` sem que o usuário diga **explicitamente** para fazer o push naquela conversa.

- ❌ "faz o commit" → apenas commit, **sem push**
- ❌ "salva as mudanças" → apenas commit, **sem push**
- ❌ aprovação de um plano → **não autoriza push**
- ✅ "faz o push" / "commita e dá push" / "sobe pro GitHub" → autoriza

**Em caso de dúvida, NÃO faça o push. Pergunte antes.**

### Comentários TODO do usuário — NUNCA apagar

NUNCA JAMAIS APAGUE ONDE EU TIVER FEITO UM COMENTÁRIO → `TODO: meu comentário`
Caso edite o arquivo, apenas mova o comentário de posição mantendo ao máximo onde ele estava.

### DRY — Don't Repeat Yourself

Se um padrão se repete **3 ou mais vezes**, SEMPRE extraia para função ou tipo reutilizável.

**Checklist antes de escrever código:**
1. Este código já existe em outro lugar?
2. Vai se repetir 3+ vezes?
3. Se sim → extrair ANTES de continuar.

### Testes — NUNCA em background, NUNCA em paralelo

- ❌ **NUNCA** rodar testes em segundo plano
- ❌ **NUNCA** disparar um segundo processo de teste antes do primeiro terminar
- ✅ Rodar testes **sempre síncronos**, **um conjunto de cada vez**

**Se der errado:** listar os processos de teste presos (`ps aux | grep <comando>`) e encerrar só esses PIDs.

### Convenções

- **Commits:** conventional commits (`feat:`, `fix:`, `chore:`, `docs:`)
- **Variáveis de ambiente:** nunca versionar arquivos `.env`
