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
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | `localhost` / `6379` / vazio | Fila de notificações (BullMQ), tempo real e limite de tentativas compartilhados entre instâncias da API |
| `THROTTLE_AUTH_LIMIT` | `10` | Tentativas por minuto, por IP, em login, cadastro e recuperação de senha |
| `TRUST_PROXY` | `false` | `true` atrás de nginx ou load balancer, para o limite usar o IP real |
| `APP_URL` | `http://localhost:4200` | Endereço do frontend usado no link de redefinição de senha |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | Mailpit (`localhost` / `1025`) | Envio de e-mails |
| `MAIL_FROM` | `TaskFlow <nao-responda@taskflow.local>` | Remetente dos e-mails |
| `MAIL_TIMEZONE` | `America/Sao_Paulo` | Fuso dos horários escritos nos e-mails |
| `STORAGE_DRIVER` | `local` | Onde ficam fotos e anexos: `local` (pasta) ou `s3` |
| `UPLOAD_DIR` | `uploads` | Pasta das fotos e anexos quando o driver é `local` |
| `S3_BUCKET` / `S3_REGION` | vazio / `us-east-1` | Bucket quando o driver é `s3` |
| `S3_ENDPOINT` / `S3_FORCE_PATH_STYLE` | vazio / `false` | Só para serviços compatíveis com S3 (MinIO, R2...) |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | vazio | Sem elas, o SDK usa as credenciais do ambiente (IAM, `~/.aws`) |
| `REMINDERS_INTERVAL_MINUTES` | `15` | De quanto em quanto tempo a API procura tarefas que vencem nas próximas 24 h para avisar os responsáveis (`0` desliga) |

### Problemas comuns

- **"Muitas tentativas" no login**: o limite é de 10 por minuto por IP. Espere um minuto ou aumente `THROTTLE_AUTH_LIMIT` no `backend/.env`.
- **E-mail de redefinição não chega**: em desenvolvimento ele vai para o Mailpit (http://localhost:8025), não para a caixa real. Em produção, configure as variáveis `SMTP_*`.

- **`EADDRINUSE` na porta 3000**: outro programa (às vezes o próprio Docker Desktop) está usando a porta. Rode a API em outra, por exemplo `PORT=3100 npm run start:dev`, e o frontend com `API_URL=http://localhost:3100 npm start`.
- **Notificações não chegam**: confira se o Redis está de pé (`docker compose ps`). Sem ele a API continua funcionando: as notificações que não entram na fila ficam guardadas no banco e são reenviadas a cada 30 s, quando o Redis voltar.
- **Erro de validação do ambiente ao subir a API**: falta alguma variável no `backend/.env` ou um segredo JWT tem menos de 32 caracteres.

## Como funciona

- Organizações têm papéis **Dono**, **Admin** e **Membro**. Projetos, quadros e tarefas herdam o acesso da organização; quem não é membro recebe 404.
- Uma tarefa conta como **concluída** quando está na última coluna do quadro. É essa regra que alimenta os dashboards.
- Etiquetas são do projeto: as mesmas valem em todos os quadros dele.
- Os responsáveis recebem aviso quando a tarefa vence nas próximas 24 h e, se ela passar do prazo sem ser concluída, um aviso de atraso (no sino e por e-mail).
- Projetos arquivados ficam somente leitura; quem está com um quadro do projeto aberto vê a mudança na hora.
- Login, cadastro e recuperação de senha têm limite de tentativas por IP. Redefinir ou trocar a senha encerra as sessões abertas em outros aparelhos.
- Fotos de perfil e anexos ficam em `backend/uploads/` ou num bucket S3 (`STORAGE_DRIVER=s3`) . Com S3, os anexos são baixados direto do bucket por links que valem 5 minutos; sem S3, passam pela API. Anexos exigem login e, fora imagens comuns, sempre baixam (nunca abrem no navegador).
- Tema claro, escuro ou igual ao sistema, no menu do usuário (a escolha fica salva no navegador).
- O quadro é sincronizado ao vivo via Socket.IO entre todos que estão com ele aberto; as notificações chegam pelo sino sem recarregar a página.
- Dá para rodar várias instâncias da API atrás de um balanceador: o tempo real e o limite de tentativas passam pelo Redis e os arquivos vão para o S3. Se o Redis cair, a API continua no ar e cada instância conta as tentativas na própria memória até ele voltar. Os erros de validação da API vêm em português.

## Testes

Os do backend e os e2e do frontend precisam do PostgreSQL e do Redis do `docker compose` no ar.

```bash
# Backend: unitários
cd backend && npm test

# Backend: e2e (sobe a API em memória e usa o banco e o Redis)
cd backend && npm run test:e2e

# Frontend: unitários (Chrome headless, não precisa da API)
cd frontend && npm run test:ci

# Frontend: e2e no navegador (Chrome instalado)
# com a API e o `ng serve` rodando, e a API com limite alto de tentativas,
# porque as suítes criam vários usuários por minuto:
#   cd backend && THROTTLE_AUTH_LIMIT=200 npm run start:dev
cd frontend && npm run e2e          # todas as suítes
cd frontend && npm run e2e board    # só as que têm "board" no nome
```

Para rodar os testes de anexos e de perfil contra um S3 local (S3Mock), suba o perfil `s3` do compose:

```bash
docker compose --profile s3 up -d s3
cd backend && STORAGE_DRIVER=s3 S3_BUCKET=taskflow S3_ENDPOINT=http://localhost:9090 \n  S3_FORCE_PATH_STYLE=true S3_ACCESS_KEY_ID=x S3_SECRET_ACCESS_KEY=x \n  npm run test:e2e -- attachments profile
```

Os testes do navegador usam o Chrome do sistema; para outro caminho, defina `CHROME_PATH`. A URL do app pode ser trocada com `E2E_APP_URL` (padrão `http://localhost:4200`). Se uma suíte falhar, a captura da tela fica em `frontend/e2e/.output/`.
