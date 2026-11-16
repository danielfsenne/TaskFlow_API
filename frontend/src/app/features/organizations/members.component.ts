import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import {
  FormGroupDirective,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { Member, Organization, OrganizationRole } from '../../core/models';
import { UiService } from '../../shared/dialogs';
import { InitialsPipe, outranks, RoleLabelPipe, roleAtLeast } from '../../shared/labels';

@Component({
  selector: 'app-members',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatSelectModule,
    RoleLabelPipe,
    InitialsPipe,
  ],
  template: `
    @if (canManage()) {
      <form
        [formGroup]="form"
        #formDir="ngForm"
        (ngSubmit)="add(formDir)"
        class="mb-4 flex flex-col gap-2 rounded-xl bg-white p-4 ring-1 ring-slate-200 sm:flex-row sm:items-start"
      >
        <mat-form-field appearance="outline" class="flex-1" subscriptSizing="dynamic">
          <mat-label>E-mail de quem já tem conta</mat-label>
          <input matInput type="email" formControlName="email" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="sm:w-40" subscriptSizing="dynamic">
          <mat-label>Papel</mat-label>
          <mat-select formControlName="role">
            @for (r of assignableRoles(); track r) {
              <mat-option [value]="r">{{ r | roleLabel }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <button mat-flat-button type="submit" class="sm:mt-2" [disabled]="adding()">Adicionar</button>
      </form>
    }

    <ul class="divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-200">
      @for (m of members(); track m.id) {
        <li class="flex items-center gap-3 p-3">
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-800">
            {{ m.name | initials }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium">
              {{ m.name }}
              @if (m.id === me()) {
                <span class="text-xs font-normal text-slate-400">(você)</span>
              }
            </p>
            <p class="truncate text-xs text-slate-500">{{ m.email }}</p>
          </div>
          <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{{ m.role | roleLabel }}</span>

          @if (canEdit(m) || (m.id === me() && m.role !== 'OWNER')) {
            <button mat-icon-button [matMenuTriggerFor]="menu" [attr.aria-label]="'Opções de ' + m.name">
              <mat-icon>more_vert</mat-icon>
            </button>
            <mat-menu #menu="matMenu" xPosition="before">
              @if (canEdit(m)) {
                @for (r of assignableRoles(); track r) {
                  @if (r !== m.role) {
                    <button mat-menu-item (click)="changeRole(m, r)">Tornar {{ r | roleLabel }}</button>
                  }
                }
                <button mat-menu-item (click)="removeMember(m)" class="!text-red-700">Remover</button>
              } @else {
                <button mat-menu-item (click)="removeMember(m)" class="!text-red-700">Sair da organização</button>
              }
            </mat-menu>
          }
        </li>
      }
    </ul>
  `,
})
export class MembersComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly organization = input.required<Organization>();

  readonly members = signal<Member[]>([]);
  readonly adding = signal(false);
  readonly me = computed(() => this.auth.user()?.id);
  readonly myRole = computed(() => this.organization().role);
  readonly canManage = computed(() => roleAtLeast(this.myRole(), 'ADMIN'));

  /** Só é possível atribuir papéis abaixo do seu (regra do backend). */
  readonly assignableRoles = computed<OrganizationRole[]>(() =>
    this.myRole() === 'OWNER' ? ['MEMBER', 'ADMIN'] : ['MEMBER'],
  );

  readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    role: ['MEMBER' as OrganizationRole],
  });

  async ngOnInit() {
    await this.load();
  }

  canEdit(m: Member) {
    return m.id !== this.me() && this.canManage() && outranks(this.myRole(), m.role);
  }

  private async load() {
    try {
      this.members.set(await this.api.members(this.organization().id));
    } catch (e) {
      this.ui.error(e);
    }
  }

  async add(formDir: FormGroupDirective) {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.adding.set(true);
    try {
      const { email, role } = this.form.getRawValue();
      const member = await this.api.addMember(this.organization().id, email.trim().toLowerCase(), role);
      this.members.update((list) => [...list, member]);
      // resetForm também limpa o estado "enviado", que deixaria o campo vermelho.
      formDir.resetForm({ email: '', role: 'MEMBER' });
      this.ui.toast(`${member.name} foi adicionado`);
    } catch (e) {
      this.ui.error(e);
    } finally {
      this.adding.set(false);
    }
  }

  async changeRole(m: Member, role: OrganizationRole) {
    try {
      const updated = await this.api.updateMemberRole(this.organization().id, m.id, role);
      this.members.update((list) => list.map((x) => (x.id === m.id ? updated : x)));
    } catch (e) {
      this.ui.error(e);
    }
  }

  async removeMember(m: Member) {
    const leaving = m.id === this.me();
    const ok = await this.ui.confirm({
      title: leaving ? 'Sair da organização?' : `Remover ${m.name}?`,
      message: leaving
        ? 'Você perde o acesso a todos os projetos dela.'
        : 'A pessoa perde o acesso e deixa de ser responsável pelas tarefas da organização.',
      confirmLabel: leaving ? 'Sair' : 'Remover',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.removeMember(this.organization().id, m.id);
      if (leaving) {
        await this.router.navigate(['/']);
        return;
      }
      this.members.update((list) => list.filter((x) => x.id !== m.id));
    } catch (e) {
      this.ui.error(e);
    }
  }
}
