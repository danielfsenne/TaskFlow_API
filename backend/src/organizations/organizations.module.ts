import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationAccessService } from './organization-access.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [NotificationsModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationAccessService],
  exports: [OrganizationAccessService],
})
export class OrganizationsModule {}
