import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorMessage } from './api-error';

const http = (status: number, error: unknown = null) =>
  new HttpErrorResponse({ status, error });

describe('apiErrorMessage', () => {
  it('usa a mensagem da API, juntando listas de validação', () => {
    expect(apiErrorMessage(http(409, { message: 'Já existe' }))).toBe(
      'Já existe',
    );
    expect(
      apiErrorMessage(
        http(400, { message: ['nome deve ser um texto', 'cor inválida'] }),
      ),
    ).toBe('nome deve ser um texto. cor inválida');
  });

  it('traduz falta de conexão e arquivo grande demais', () => {
    expect(apiErrorMessage(http(0))).toBe(
      'Não foi possível falar com o servidor.',
    );
    expect(apiErrorMessage(http(413, { message: 'Payload Too Large' }))).toBe(
      'Arquivo grande demais.',
    );
  });

  it('cai no texto padrão quando não há mensagem útil', () => {
    expect(apiErrorMessage(http(500, { message: '' }))).toBe(
      'Algo deu errado. Tente novamente.',
    );
    expect(apiErrorMessage(new Error('x'), 'Outro')).toBe('Outro');
  });
});
