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
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: '',
        title: 'Organizações · TaskFlow',
        loadComponent: () =>
          import('./features/organizations/organizations.component').then(
            (m) => m.OrganizationsComponent,
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
    ],
  },
  { path: '**', redirectTo: '' },
];
