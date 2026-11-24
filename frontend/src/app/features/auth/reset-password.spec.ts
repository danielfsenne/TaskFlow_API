import { FormControl, FormGroup } from '@angular/forms';
import { passwordsMatch } from './reset-password.component';

describe('passwordsMatch', () => {
  const form = (password: string, confirm: string) =>
    new FormGroup(
      {
        password: new FormControl(password),
        confirm: new FormControl(confirm),
      },
      { validators: passwordsMatch },
    );

  it('acusa senhas diferentes', () => {
    expect(form('SenhaForte1', 'SenhaForte2').hasError('mismatch')).toBeTrue();
  });

  it('não acusa enquanto um dos campos está vazio, nem quando batem', () => {
    expect(form('SenhaForte1', '').errors).toBeNull();
    expect(form('SenhaForte1', 'SenhaForte1').errors).toBeNull();
  });
});
