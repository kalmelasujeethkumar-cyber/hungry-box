import { Injectable, NotFoundException } from '@nestjs/common';
import type { AddressDto } from '@hungrybox/shared';
import { requireActiveUser } from '../../common/utils/active-user';
import type { Address, PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { toAddressDto } from './address.mapper';
import type { CreateAddressDto } from './dto/create-address.dto';
import type { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async listMy(customerId: string): Promise<AddressDto[]> {
    const db = this.prisma.requireClient();
    await requireActiveUser(db, customerId);
    const addresses = await db.address.findMany({
      where: { customerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return addresses.map(toAddressDto);
  }

  async findMine(customerId: string, addressId: string): Promise<AddressDto> {
    const db = this.prisma.requireClient();
    await requireActiveUser(db, customerId);
    const address = await this.findOwned(db, customerId, addressId);
    return toAddressDto(address);
  }

  async create(customerId: string, dto: CreateAddressDto): Promise<AddressDto> {
    const db = this.prisma.requireClient();
    await requireActiveUser(db, customerId);

    const isDefault = dto.isDefault ?? false;
    const total = await db.address.count({ where: { customerId } });
    const makeDefault = isDefault || total === 0;

    return db.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.address.updateMany({
          where: { customerId },
          data: { isDefault: false },
        });
      }
      const address = await tx.address.create({
        data: {
          customerId,
          label: dto.label?.trim() || 'OTHER',
          recipientName: dto.recipientName.trim(),
          phone: dto.phone ?? null,
          houseFlat: dto.houseFlat.trim(),
          streetArea: dto.streetArea.trim(),
          landmark: dto.landmark ?? null,
          city: dto.city.trim(),
          state: dto.state.trim(),
          postalCode: dto.postalCode.trim(),
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          deliveryInstructions: dto.deliveryInstructions ?? null,
          isDefault: makeDefault,
        },
      });
      return toAddressDto(address);
    });
  }

  async update(customerId: string, addressId: string, dto: UpdateAddressDto): Promise<AddressDto> {
    const db = this.prisma.requireClient();
    await requireActiveUser(db, customerId);
    await this.findOwned(db, customerId, addressId);

    return db.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.address.updateMany({
          where: { customerId },
          data: { isDefault: false },
        });
      }
      const address = await tx.address.update({
        where: { id: addressId },
        data: {
          ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
          ...(dto.recipientName !== undefined ? { recipientName: dto.recipientName.trim() } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.houseFlat !== undefined ? { houseFlat: dto.houseFlat.trim() } : {}),
          ...(dto.streetArea !== undefined ? { streetArea: dto.streetArea.trim() } : {}),
          ...(dto.landmark !== undefined ? { landmark: dto.landmark } : {}),
          ...(dto.city !== undefined ? { city: dto.city.trim() } : {}),
          ...(dto.state !== undefined ? { state: dto.state.trim() } : {}),
          ...(dto.postalCode !== undefined ? { postalCode: dto.postalCode.trim() } : {}),
          ...(dto.latitude !== undefined ? { latitude: dto.latitude ?? null } : {}),
          ...(dto.longitude !== undefined ? { longitude: dto.longitude ?? null } : {}),
          ...(dto.deliveryInstructions !== undefined
            ? { deliveryInstructions: dto.deliveryInstructions }
            : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        },
      });
      return toAddressDto(address);
    });
  }

  async setDefault(customerId: string, addressId: string): Promise<AddressDto> {
    const db = this.prisma.requireClient();
    await requireActiveUser(db, customerId);
    await this.findOwned(db, customerId, addressId);

    await db.$transaction(async (tx) => {
      await tx.address.updateMany({
        where: { customerId },
        data: { isDefault: false },
      });
      await tx.address.update({
        where: { id: addressId },
        data: { isDefault: true },
      });
    });
    return this.findMine(customerId, addressId);
  }

  async delete(customerId: string, addressId: string): Promise<{ id: string; deleted: true }> {
    const db = this.prisma.requireClient();
    await requireActiveUser(db, customerId);
    await this.findOwned(db, customerId, addressId);
    await db.address.delete({ where: { id: addressId } });
    return { id: addressId, deleted: true };
  }

  private async findOwned(
    db: PrismaClient,
    customerId: string,
    addressId: string,
  ): Promise<Address> {
    const address = await db.address.findFirst({
      where: { id: addressId, customerId },
    });
    if (!address) {
      throw new NotFoundException('Address not found');
    }
    return address;
  }
}
