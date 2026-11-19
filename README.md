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

### 1. Banco e Redis

```bash
cp .env.example .env
docker compose up -d
```

O PostgreSQL fica na porta **5433** (para não brigar com um Postgres local na 5432) e o Redis na **6379**.

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:deploy   # aplica as migrações
npm run start:dev
```

Antes de subir, troque `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET` no `backend/.env` (mínimo de 32 caracteres cada). Para gerar:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

A API sobe em http://localhost:3000/api/v1 e a documentação (Swagger) em http://localhost:3000/api/docs.

### 3. Frontend

Em outro terminal:

```bash
cd frontend
npm install
npm start
```

Abra http://localhost:4200 e crie uma conta. O `ng serve` repassa `/api` e o Socket.IO para o backend, então não é preciso configurar CORS.

Se a API estiver em outra porta, informe com `API_URL`:

```bash
API_URL=http://localhost:3100 npm start
```

### Variáveis do backend

| Variável | Padrão no `.env.example` | Para que serve |
| --- | --- | --- |
| `PORT` | `3000` | Porta da API |
| `DATABASE_URL` | Postgres do compose | Conexão do Prisma |
| `CORS_ORIGIN` | `http://localhost:4200` | Origem liberada para HTTP e WebSocket |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | troque | Assinatura dos tokens |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | `15m` / `7d` | Validade dos tokens |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | `localhost` / `6379` / vazio | Fila de notificações (BullMQ) |

### Problemas comuns

- **`EADDRINUSE` na porta 3000**: outro programa (às vezes o próprio Docker Desktop) está usando a porta. Rode a API em outra, por exemplo `PORT=3100 npm run start:dev`, e o frontend com `API_URL=http://localhost:3100 npm start`.
- **Notificações não chegam**: confira se o Redis está de pé (`docker compose ps`). Sem ele a API continua funcionando e as notificações ficam guardadas na memória até o Redis voltar; se a API reiniciar nesse meio-tempo, elas se perdem.
- **Erro de validação do ambiente ao subir a API**: falta alguma variável no `backend/.env` ou um segredo JWT tem menos de 32 caracteres.

## Como funciona

- Organizações têm papéis **Dono**, **Admin** e **Membro**. Projetos, quadros e tarefas herdam o acesso da organização; quem não é membro recebe 404.
- Uma tarefa conta como **concluída** quando está na última coluna do quadro. É essa regra que alimenta os dashboards.
- Projetos arquivados ficam somente leitura.
- O quadro é sincronizado ao vivo via Socket.IO entre todos que estão com ele aberto; as notificações chegam pelo sino sem recarregar a página.

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
