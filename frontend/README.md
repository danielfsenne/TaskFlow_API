# TaskFlow Web

Aplicação Angular 19 (componentes standalone, signals e NgRx Signals) com Angular Material, CDK e Tailwind.

Para subir o projeto inteiro, veja o [README da raiz](../README.md).

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm start` | `ng serve` em http://localhost:4200, repassando `/api` e o Socket.IO para o backend |
| `npm run build` | Build de produção em `dist/` |
| `npm run e2e` | Testes no navegador (precisam da API e do `ng serve` rodando) |

`API_URL` muda o endereço do backend usado pelo `ng serve` (padrão `http://localhost:3000`).

## Organização

```
src/app/
├── core/       # API, autenticação, tempo real, notificações e tipos
├── layout/     # moldura com barra lateral e sino
├── shared/     # diálogos, gráficos, avatar, rótulos
└── features/
    ├── auth/           # login e cadastro
    ├── dashboard/      # início e indicadores
    ├── organizations/  # organização e membros
    ├── projects/       # projeto e seus quadros
    └── board/          # quadro Kanban e painel da tarefa
```
