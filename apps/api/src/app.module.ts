import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AddressesModule } from './modules/addresses/addresses.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { BranchOrdersModule } from './modules/branch-orders/branch-orders.module';
import { BranchProductsModule } from './modules/branch-products/branch-products.module';
import { BranchesModule } from './modules/branches/branches.module';
import { CartModule } from './modules/cart/cart.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { DeliveriesModule } from './modules/deliveries/deliveries.module';
import { DeliveryPartnersModule } from './modules/delivery-partners/delivery-partners.module';
import { HealthModule } from './modules/health/health.module';
import { LocationsModule } from './modules/locations/locations.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ProductsModule } from './modules/products/products.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { BranchScopeGuard } from './common/guards/branch-scope.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    BranchesModule,
    CategoriesModule,
    ProductsModule,
    BranchProductsModule,
    CatalogModule,
    AddressesModule,
    LocationsModule,
    CartModule,
    AuditModule,
    PaymentsModule,
    CheckoutModule,
    OrdersModule,
    BranchOrdersModule,
    DeliveryPartnersModule,
    DeliveriesModule,
    NotificationsModule,
    RealtimeModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: BranchScopeGuard },
  ],
})
export class AppModule {}
