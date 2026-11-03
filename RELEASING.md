# Como publicar uma versão

Uma versão é uma tag imutável no GitHub. Quem usa instala assim, sem npm:

```json
{ "dependencies": { "htsx": "github:mvcc-kit/htsx#v0.3.0-beta.2" } }
```

## O fluxo

Sempre nesta ordem:

1. **Mude** o código, com teste, e leve para `main`.
2. **Escolha o número** pela tabela abaixo.
3. **Descreva** em `CHANGELOG.md`: `## 0.3.0-beta.2 (DD/MM/AAAA)`, no topo. Mudança incompatível vem com o que fazer. Faça commit.
4. **Ensaie:** `bun run release 0.3.0-beta.2 --dry-run`.
5. **Publique:** `bun run release 0.3.0-beta.2`.
6. **Atualize quem usa:** troque a tag no `package.json` do projeto, rode `bun install` e os testes dele. Só use a versão nova depois disso.

O comando do passo 5 faz o resto, nesta ordem, e para no primeiro erro:

1. Confere: `main`, sem mudanças soltas, igual ao GitHub, tag nova, número maior que o último e seção no `CHANGELOG.md`.
2. Roda testes e tipos.
3. Instala o que está no Git num projeto vazio e importa todas as entradas públicas.
4. Grava o número em `package.json`, faz o commit e cria a tag anotada.
5. Envia commit e tag juntos.
6. Cria a release no GitHub, marcada como pré-lançamento se for beta.

## Qual número usar

| Situação | Em beta (`0.x`) | Depois da `1.0.0` |
|---|---|---|
| Correção ou melhoria | `0.1.0-beta.1` → `0.1.0-beta.2` | `1.2.3` → `1.2.4` |
| Função nova compatível | `0.1.0-beta.1` → `0.1.0-beta.2` | `1.2.3` → `1.3.0` |
| Mudança incompatível | `0.1.0-beta.2` → `0.2.0-beta.1` | `1.2.3` → `2.0.0` |
| Falha de segurança | Versão nova no mesmo dia, com a falha em destaque | Igual |

**Sair do beta (`1.0.0`):** pelo menos um app real em produção com o htsx e 30 dias sem mudança incompatível.

## Regras

- Tag publicada não muda nem é apagada. Versão ruim se corrige com uma versão nova, e a seção antiga do `CHANGELOG.md` ganha o aviso.
- Quem usa fixa a tag exata. Nunca um branch nem `latest`.
- Só o comando cria tag. Nada de `git tag` à mão.
- Nada privado no repositório: ele é público, inclusive o histórico. Isso vale para nome de app, cliente, caminho de outro projeto e segredo.
