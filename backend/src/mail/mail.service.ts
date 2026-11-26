import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter;
  private readonly from: string;
  private readonly timeZone: string;

  constructor(config: ConfigService) {
    const user = config.get<string>('SMTP_USER');
    this.transport = createTransport({
      host: config.get<string>('SMTP_HOST'),
      port: config.get<number>('SMTP_PORT'),
      secure: config.get<number>('SMTP_PORT') === 465,
      auth: user
        ? { user, pass: config.get<string>('SMTP_PASSWORD') }
        : undefined,
    });
    this.from = config.getOrThrow<string>('MAIL_FROM');
    this.timeZone = config.getOrThrow<string>('MAIL_TIMEZONE');
  }

  async sendPasswordReset(to: string, name: string, link: string) {
    const first = escape(name.split(' ')[0]);
    await this.send(
      to,
      'Redefinir sua senha do TaskFlow',
      [
        `Olá, ${name.split(' ')[0]}.`,
        '',
        'Recebemos um pedido para redefinir a senha da sua conta no TaskFlow.',
        `Para criar uma senha nova, abra o link abaixo (vale por 1 hora):`,
        '',
        link,
        '',
        'Se não foi você, ignore este e-mail: sua senha continua a mesma.',
      ].join('\n'),
      `<p>Olá, ${first}.</p>
<p>Recebemos um pedido para redefinir a senha da sua conta no TaskFlow.</p>
<p><a href="${escape(link)}">Criar uma senha nova</a> (o link vale por 1 hora).</p>
<p style="color:#666">Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>`,
    );
  }

  async sendInvitation(
    to: string,
    inviterName: string,
    organizationName: string,
    link: string,
  ) {
    await this.send(
      to,
      `${inviterName} convidou você para ${organizationName} no TaskFlow`,
      [
        'Olá.',
        '',
        `${inviterName} convidou você para participar da organização ${organizationName} no TaskFlow.`,
        'Para aceitar, abra o link abaixo (vale por 7 dias):',
        '',
        link,
        '',
        'Se não esperava este convite, é só ignorar este e-mail.',
      ].join('\n'),
      `<p>Olá.</p>
<p><strong>${escape(inviterName)}</strong> convidou você para participar da organização <strong>${escape(organizationName)}</strong> no TaskFlow.</p>
<p><a href="${escape(link)}">Aceitar o convite</a> (o link vale por 7 dias).</p>
<p style="color:#666">Se não esperava este convite, é só ignorar este e-mail.</p>`,
    );
  }

  async sendOverdue(
    to: string,
    name: string,
    task: { title: string; projectName: string; dueDate: Date; link: string },
  ) {
    const first = name.split(' ')[0];
    const due = task.dueDate.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: this.timeZone,
    });
    await this.send(
      to,
      `Tarefa atrasada: ${task.title}`,
      [
        `Olá, ${first}.`,
        '',
        `A tarefa "${task.title}", do projeto ${task.projectName}, venceu em ${due} e ainda não foi concluída.`,
        '',
        task.link,
      ].join('\n'),
      `<p>Olá, ${escape(first)}.</p>
<p>A tarefa <strong>${escape(task.title)}</strong>, do projeto ${escape(task.projectName)}, venceu em ${due} e ainda não foi concluída.</p>
<p><a href="${escape(task.link)}">Abrir a tarefa</a></p>`,
    );
  }

  private async send(to: string, subject: string, text: string, html: string) {
    try {
      await this.transport.sendMail({
        from: this.from,
        to,
        subject,
        text,
        html,
      });
    } catch (e) {
      // a resposta da API não depende do envio; o erro fica no log
      this.logger.error(
        `Falha ao enviar "${subject}" para ${to}: ${(e as Error).message}`,
      );
    }
  }
}
