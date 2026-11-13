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
