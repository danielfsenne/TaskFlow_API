import { Module } from '@nestjs/common';
import { OrganizationAccessService } from './organization-access.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationAccessService],
  exports: [OrganizationAccessService],
})
export class OrganizationsModule {}
