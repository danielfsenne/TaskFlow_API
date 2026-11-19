# TaskFlow API

API em NestJS com Prisma (PostgreSQL), BullMQ (Redis) e Socket.IO.

Para subir o projeto inteiro, veja o [README da raiz](../README.md).

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run start:dev` | Sobe a API com recarga automática |
| `npm run build` / `npm run start:prod` | Compila e roda a versão compilada |
| `npm run prisma:deploy` | Aplica as migrações pendentes |
| `npm run prisma:migrate` | Cria uma migração nova a partir do `schema.prisma` |
| `npm run prisma:studio` | Abre o Prisma Studio para ver os dados |
| `npm test` | Testes unitários |
| `npm run test:e2e` | Testes e2e (precisam do Postgres e do Redis) |
| `npm run lint` | ESLint |

## Organização

```
src/
├── auth/            # cadastro, login, JWT e refresh token rotativo
├── organizations/   # organizações, membros e papéis
├── projects/        # projetos e arquivamento
├── boards/          # quadros e colunas
├── tasks/           # tarefas, responsáveis e movimentação
├── comments/        # comentários com paginação por cursor
├── notifications/   # fila (BullMQ), worker e rotas do sino
├── realtime/        # gateway Socket.IO (namespace /realtime)
├── dashboard/       # indicadores pessoais, da organização e do projeto
└── common/          # posições fracionárias e regra de conclusão
```
