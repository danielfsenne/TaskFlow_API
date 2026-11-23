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

O PostgreSQL fica na porta **5433** (para não brigar com um Postgres local na 5432) e o Redis na **6379**. O compose também sobe o **Mailpit**, uma caixa de e-mail de desenvolvimento: os e-mails do app (como o de redefinição de senha) aparecem em http://localhost:8025.

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
| `THROTTLE_AUTH_LIMIT` | `10` | Tentativas por minuto, por IP, em login, cadastro e recuperação de senha |
| `TRUST_PROXY` | `false` | `true` atrás de nginx ou load balancer, para o limite usar o IP real |
| `APP_URL` | `http://localhost:4200` | Endereço do frontend usado no link de redefinição de senha |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | Mailpit (`localhost` / `1025`) | Envio de e-mails |
| `MAIL_FROM` | `TaskFlow <nao-responda@taskflow.local>` | Remetente dos e-mails |
| `UPLOAD_DIR` | `uploads` | Pasta das fotos de perfil e dos anexos |
| `REMINDERS_INTERVAL_MINUTES` | `15` | De quanto em quanto tempo a API procura tarefas que vencem nas próximas 24 h para avisar os responsáveis (`0` desliga) |

### Problemas comuns

- **"Muitas tentativas" no login**: o limite é de 10 por minuto por IP. Espere um minuto ou aumente `THROTTLE_AUTH_LIMIT` no `backend/.env`.
- **E-mail de redefinição não chega**: em desenvolvimento ele vai para o Mailpit (http://localhost:8025), não para a caixa real. Em produção, configure as variáveis `SMTP_*`.

- **`EADDRINUSE` na porta 3000**: outro programa (às vezes o próprio Docker Desktop) está usando a porta. Rode a API em outra, por exemplo `PORT=3100 npm run start:dev`, e o frontend com `API_URL=http://localhost:3100 npm start`.
- **Notificações não chegam**: confira se o Redis está de pé (`docker compose ps`). Sem ele a API continua funcionando e as notificações ficam guardadas na memória até o Redis voltar; se a API reiniciar nesse meio-tempo, elas se perdem.
- **Erro de validação do ambiente ao subir a API**: falta alguma variável no `backend/.env` ou um segredo JWT tem menos de 32 caracteres.

## Como funciona

- Organizações têm papéis **Dono**, **Admin** e **Membro**. Projetos, quadros e tarefas herdam o acesso da organização; quem não é membro recebe 404.
- Uma tarefa conta como **concluída** quando está na última coluna do quadro. É essa regra que alimenta os dashboards.
- Projetos arquivados ficam somente leitura.
- Login, cadastro e recuperação de senha têm limite de tentativas por IP. Redefinir ou trocar a senha encerra as sessões abertas em outros aparelhos.
- Fotos de perfil e anexos ficam em `backend/uploads/` e são servidos pela própria API. Anexos exigem login e, fora imagens comuns, sempre baixam (nunca abrem no navegador). Com mais de uma instância da API, essa pasta precisa ser compartilhada (ou trocada por um storage como o S3).
- Tema claro, escuro ou igual ao sistema, no menu do usuário (a escolha fica salva no navegador).
- O quadro é sincronizado ao vivo via Socket.IO entre todos que estão com ele aberto; as notificações chegam pelo sino sem recarregar a página.

## Testes

Todos precisam do PostgreSQL e do Redis do `docker compose` no ar.

```bash
# Backend: unitários
cd backend && npm test

# Backend: e2e (sobe a API em memória e usa o banco e o Redis)
cd backend && npm run test:e2e

# Frontend: e2e no navegador (Chrome instalado)
# com a API e o `ng serve` rodando, e a API com limite alto de tentativas,
# porque as suítes criam vários usuários por minuto:
#   cd backend && THROTTLE_AUTH_LIMIT=200 npm run start:dev
cd frontend && npm run e2e          # todas as suítes
cd frontend && npm run e2e board    # só as que têm "board" no nome
```

Os testes do navegador usam o Chrome do sistema; para outro caminho, defina `CHROME_PATH`. A URL do app pode ser trocada com `E2E_APP_URL` (padrão `http://localhost:4200`). Se uma suíte falhar, a captura da tela fica em `frontend/e2e/.output/`.
