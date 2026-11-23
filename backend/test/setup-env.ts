// fila separada da API de desenvolvimento, que usa o mesmo Redis
process.env.QUEUE_PREFIX = 'taskflow-e2e';
// nos testes o lembrete é chamado na mão, sem esperar o agendamento
process.env.REMINDERS_INTERVAL_MINUTES = '0';
