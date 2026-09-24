import type { AddressDto } from '@hungrybox/shared';
import type { Address } from '../../generated/prisma/client';

export function toAddressDto(address: Address): AddressDto {
  return {
    id: address.id,
    label: address.label,
    recipientName: address.recipientName,
    phone: address.phone,
    houseFlat: address.houseFlat,
    streetArea: address.streetArea,
    landmark: address.landmark,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    latitude: address.latitude == null ? null : Number(address.latitude),
    longitude: address.longitude == null ? null : Number(address.longitude),
    deliveryInstructions: address.deliveryInstructions,
    isDefault: address.isDefault,
    createdAt: address.createdAt.toISOString(),
    updatedAt: address.updatedAt.toISOString(),
  };
}
