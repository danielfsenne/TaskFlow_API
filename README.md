# TaskFlow

Plataforma de gerenciamento de projetos e tarefas com quadros Kanban, colaboração em tempo real, notificações e dashboards.

## Stack

| Camada       | Tecnologia                  |
| ------------ | --------------------------- |
| Backend      | NestJS + TypeScript         |
| Frontend     | Angular + TypeScript        |
| Banco        | PostgreSQL                  |
| ORM          | Prisma                      |
| Cache        | Redis                       |
| Filas        | BullMQ                      |
| Tempo real   | Socket.IO                   |
| Estilização  | Tailwind CSS                |
| UI           | Angular Material + CDK      |
| Estado       | Signals + NgRx              |
| Infra        | Docker                      |

## Estrutura

```
taskflow/
├── backend/            # API NestJS
├── frontend/           # Aplicação Angular
└── docker-compose.yml  # PostgreSQL + Redis
```

## Pré-requisitos

- Node.js 18.19+
- Docker e Docker Compose

## Como rodar

```bash
# Infraestrutura (PostgreSQL + Redis)
cp .env.example .env
docker compose up -d
```

As instruções do backend e do frontend serão adicionadas conforme os módulos forem implementados.

## Testes

Todos precisam do PostgreSQL e do Redis do `docker compose` no ar.

```bash
# Backend: unitários
cd backend && npm test

# Backend: e2e (sobe a API em memória e usa o banco e o Redis)
cd backend && npm run test:e2e

# Frontend: e2e no navegador (Chrome instalado)
# com a API e o `ng serve` rodando
cd frontend && npm run e2e          # todas as suítes
cd frontend && npm run e2e board    # só as que têm "board" no nome
```

Os testes do navegador usam o Chrome do sistema; para outro caminho, defina `CHROME_PATH`. A URL do app pode ser trocada com `E2E_APP_URL` (padrão `http://localhost:4200`). Se uma suíte falhar, a captura da tela fica em `frontend/e2e/.output/`.
