import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrganizationRole } from '@prisma/client';
import { OrganizationAccessService } from '../organizations/organization-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { ProjectAccessService } from './project-access.service';
import { ProjectsService } from './projects.service';

describe('Projetos — controle de acesso', () => {
  const prisma = {
    project: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
    organizationMember: { findUnique: jest.fn() },
    board: { findMany: jest.fn() },
  };
  let access: ProjectAccessService;
  let service: ProjectsService;

  const project = (over: object = {}) => ({
    id: 'p1',
    organizationId: 'o1',
    createdById: 'criador',
    archived: false,
    ...over,
  });
  const member = (role: OrganizationRole) => ({ role });

  beforeEach(() => {
    jest.resetAllMocks();
    const p = prisma as unknown as PrismaService;
    access = new ProjectAccessService(p, new OrganizationAccessService(p));
    prisma.board.findMany.mockResolvedValue([]);
    service = new ProjectsService(p, access, new RealtimeEmitter());
  });

  it('retorna 404 para quem não é membro da organização', async () => {
    prisma.project.findUnique.mockResolvedValue(project());
    prisma.organizationMember.findUnique.mockResolvedValue(null);
    await expect(access.getAccess('p1', 'estranho')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('MEMBER que não criou o projeto não pode editá-lo', async () => {
    prisma.project.findUnique.mockResolvedValue(project());
    prisma.organizationMember.findUnique.mockResolvedValue(
      member(OrganizationRole.MEMBER),
    );
    await expect(
      service.update('p1', 'outro', { name: 'Novo' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('o criador MEMBER pode editar o próprio projeto', async () => {
    prisma.project.findUnique.mockResolvedValue(project());
    prisma.organizationMember.findUnique.mockResolvedValue(
      member(OrganizationRole.MEMBER),
    );
    await service.update('p1', 'criador', { name: 'Novo' });
    expect(prisma.project.update).toHaveBeenCalled();
  });

  it('projeto arquivado não aceita edição sem desarquivar', async () => {
    prisma.project.findUnique.mockResolvedValue(project({ archived: true }));
    prisma.organizationMember.findUnique.mockResolvedValue(
      member(OrganizationRole.ADMIN),
    );
    await expect(
      service.update('p1', 'admin', { name: 'Novo' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('projeto arquivado pode ser desarquivado', async () => {
    prisma.project.findUnique.mockResolvedValue(project({ archived: true }));
    prisma.organizationMember.findUnique.mockResolvedValue(
      member(OrganizationRole.ADMIN),
    );
    await service.update('p1', 'admin', { archived: false });
    expect(prisma.project.update).toHaveBeenCalled();
  });

  it('o criador MEMBER não pode excluir o projeto', async () => {
    prisma.project.findUnique.mockResolvedValue(project());
    prisma.organizationMember.findUnique.mockResolvedValue(
      member(OrganizationRole.MEMBER),
    );
    await expect(service.remove('p1', 'criador')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.project.delete).not.toHaveBeenCalled();
  });
});
