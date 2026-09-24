export const ADDRESS_LABELS = ['HOME', 'WORK', 'OTHER'] as const;
export type AddressLabel = (typeof ADDRESS_LABELS)[number];

export interface AddressDto {
  id: string;
  label: string;
  recipientName: string;
  phone: string | null;
  houseFlat: string;
  streetArea: string;
  landmark: string | null;
  city: string;
  state: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  deliveryInstructions: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAddressInput {
  label: string;
  recipientName: string;
  phone?: string | null;
  houseFlat: string;
  streetArea: string;
  landmark?: string | null;
  city: string;
  state: string;
  postalCode: string;
  latitude?: number | null;
  longitude?: number | null;
  deliveryInstructions?: string | null;
  isDefault?: boolean;
}

export interface UpdateAddressInput {
  label?: string;
  recipientName?: string;
  phone?: string | null;
  houseFlat?: string;
  streetArea?: string;
  landmark?: string | null;
  city?: string;
  state?: string;
  postalCode?: string;
  latitude?: number | null;
  longitude?: number | null;
  deliveryInstructions?: string | null;
  isDefault?: boolean;
}
