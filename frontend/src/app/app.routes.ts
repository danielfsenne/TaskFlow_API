import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Entrar · TaskFlow',
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    title: 'Criar conta · TaskFlow',
    loadComponent: () =>
      import('./features/auth/register.component').then(
        (m) => m.RegisterComponent,
      ),
  },
  {
    path: 'forgot-password',
    canActivate: [guestGuard],
    title: 'Esqueci minha senha · TaskFlow',
    loadComponent: () =>
      import('./features/auth/forgot-password.component').then(
        (m) => m.ForgotPasswordComponent,
      ),
  },
  {
    // sem guard: o link do e-mail pode ser aberto logado ou não
    path: 'reset-password',
    title: 'Nova senha · TaskFlow',
    loadComponent: () =>
      import('./features/auth/reset-password.component').then(
        (m) => m.ResetPasswordComponent,
      ),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: '',
        title: 'Início · TaskFlow',
        loadComponent: () =>
          import('./features/dashboard/home.component').then(
            (m) => m.HomeComponent,
          ),
      },
      {
        path: 'profile',
        title: 'Meu perfil · TaskFlow',
        loadComponent: () =>
          import('./features/account/profile.component').then(
            (m) => m.ProfileComponent,
          ),
      },
      {
        path: 'orgs/:orgId',
        title: 'Organização · TaskFlow',
        loadComponent: () =>
          import('./features/organizations/organization.component').then(
            (m) => m.OrganizationComponent,
          ),
      },
      {
        path: 'projects/:projectId',
        title: 'Projeto · TaskFlow',
        loadComponent: () =>
          import('./features/projects/project.component').then(
            (m) => m.ProjectComponent,
          ),
      },
      {
        path: 'boards/:boardId',
        title: 'Quadro · TaskFlow',
        loadComponent: () =>
          import('./features/board/board.component').then(
            (m) => m.BoardComponent,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
