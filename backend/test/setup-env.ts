// fila separada da API de desenvolvimento, que usa o mesmo Redis
process.env.QUEUE_PREFIX = 'taskflow-e2e';
// nos testes o lembrete é chamado na mão, sem esperar o agendamento
process.env.REMINDERS_INTERVAL_MINUTES = '0';
// contagem do limite de tentativas própria de cada arquivo de teste
process.env.THROTTLE_KEY_PREFIX = `taskflow-e2e:throttle:${Math.random().toString(36).slice(2)}:`;
