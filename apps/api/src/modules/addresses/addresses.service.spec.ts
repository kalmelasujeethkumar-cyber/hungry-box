import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { AddressesService } from './addresses.service';

type MockFn = ReturnType<typeof vi.fn>;

interface AddressTestDb {
  user: { findUnique: MockFn };
  address: {
    findMany: MockFn;
    findFirst: MockFn;
    count: MockFn;
    create: MockFn;
    update: MockFn;
    updateMany: MockFn;
    delete: MockFn;
  };
  $transaction: MockFn;
}

function buildService(db: AddressTestDb) {
  const prisma = {
    requireClient: vi.fn().mockReturnValue(db),
  } as unknown as PrismaService;
  return new AddressesService(prisma);
}

function addressRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'addr-1',
    label: 'HOME',
    recipientName: 'Demo Customer',
    phone: null,
    houseFlat: '2-13',
    streetArea: 'Lakshmipuram Main Road',
    landmark: null,
    city: 'Guntur',
    state: 'Andhra Pradesh',
    postalCode: '522007',
    latitude: null,
    longitude: null,
    deliveryInstructions: null,
    isDefault: true,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  };
}

function baseDb(): AddressTestDb {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: 'cust-1', status: 'ACTIVE' }),
    },
    address: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(addressRow()),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockResolvedValue(addressRow()),
      update: vi.fn().mockResolvedValue(addressRow()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: vi.fn().mockResolvedValue(addressRow()),
    },
    $transaction: vi.fn(),
  };
}

function withTransaction(db: AddressTestDb): AddressTestDb {
  db.$transaction = vi.fn(async (fn: (tx: AddressTestDb) => Promise<unknown>) => fn(db));
  return db;
}

describe('AddressesService.create', () => {
  it('makes the first address the default', async () => {
    const db = withTransaction(baseDb());
    db.address.count = vi.fn().mockResolvedValue(0);
    const service = buildService(db);

    const result = await service.create('cust-1', {
      recipientName: 'Demo Customer',
      houseFlat: '2-13',
      streetArea: 'Main Road',
      city: 'Guntur',
      state: 'Andhra Pradesh',
      postalCode: '522007',
    });

    expect(result.isDefault).toBe(true);
    expect(db.address.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 'cust-1',
        label: 'OTHER',
        isDefault: true,
        latitude: null,
        longitude: null,
      }),
    });
  });

  it('stores the numeric latitude and longitude', async () => {
    const db = withTransaction(baseDb());
    const service = buildService(db);

    await service.create('cust-1', {
      recipientName: 'Demo Customer',
      houseFlat: '2-13',
      streetArea: 'Main Road',
      city: 'Guntur',
      state: 'Andhra Pradesh',
      postalCode: '522007',
      latitude: 16.3015,
      longitude: 80.4405,
    });

    expect(db.address.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ latitude: 16.3015, longitude: 80.4405 }),
    });
  });

  it('unsets other defaults when the new address is flagged default', async () => {
    const db = withTransaction(baseDb());
    const service = buildService(db);

    await service.create('cust-1', {
      recipientName: 'Demo Customer',
      houseFlat: '3-1',
      streetArea: 'Brodipet',
      city: 'Guntur',
      state: 'Andhra Pradesh',
      postalCode: '522002',
      isDefault: true,
    });

    expect(db.address.updateMany).toHaveBeenCalledWith({
      where: { customerId: 'cust-1' },
      data: { isDefault: false },
    });
    expect(db.address.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ isDefault: true }),
    });
  });

  it('rejects a suspended customer', async () => {
    const db = baseDb();
    db.user.findUnique = vi.fn().mockResolvedValue({ id: 'cust-1', status: 'SUSPENDED' });
    const service = buildService(db);

    await expect(
      service.create('cust-1', {
        recipientName: 'Demo Customer',
        houseFlat: '2-13',
        streetArea: 'Main Road',
        city: 'Guntur',
        state: 'Andhra Pradesh',
        postalCode: '522007',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});

describe('AddressesService ownership (IDOR prevention)', () => {
  it('lists only the caller addresses', async () => {
    const db = baseDb();
    db.address.findMany = vi.fn().mockResolvedValue([addressRow()]);
    const service = buildService(db);

    const result = await service.listMy('cust-1');

    expect(db.address.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId: 'cust-1' } }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'addr-1', label: 'HOME', houseFlat: '2-13' });
  });

  it('cannot read another customer address', async () => {
    const db = baseDb();
    db.address.findFirst = vi.fn().mockResolvedValue(null);
    const service = buildService(db);

    await expect(service.findMine('cust-1', 'addr-other')).rejects.toThrow(NotFoundException);
    expect(db.address.findFirst).toHaveBeenCalledWith({
      where: { id: 'addr-other', customerId: 'cust-1' },
    });
  });

  it('cannot update another customer address', async () => {
    const db = baseDb();
    db.address.findFirst = vi.fn().mockResolvedValue(null);
    const service = buildService(db);

    await expect(service.update('cust-1', 'addr-other', { houseFlat: '9-9' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('cannot set default for another customer address', async () => {
    const db = withTransaction(baseDb());
    db.address.findFirst = vi.fn().mockResolvedValue(null);
    const service = buildService(db);

    await expect(service.setDefault('cust-1', 'addr-other')).rejects.toThrow(NotFoundException);
  });

  it('cannot delete another customer address', async () => {
    const db = baseDb();
    db.address.findFirst = vi.fn().mockResolvedValue(null);
    const service = buildService(db);

    await expect(service.delete('cust-1', 'addr-other')).rejects.toThrow(NotFoundException);
    expect(db.address.delete).not.toHaveBeenCalled();
  });
});

describe('AddressesService mutations', () => {
  it('updates an owned address', async () => {
    const db = withTransaction(baseDb());
    const service = buildService(db);

    const result = await service.update('cust-1', 'addr-1', { postalCode: '522001' });

    expect(result.postalCode).toBe('522007');
    expect(db.address.update).toHaveBeenCalledWith({
      where: { id: 'addr-1' },
      data: expect.objectContaining({ postalCode: '522001' }),
    });
  });

  it('clears latitude when it is explicitly set to null', async () => {
    const db = withTransaction(baseDb());
    const service = buildService(db);

    await service.update('cust-1', 'addr-1', { latitude: null });

    expect(db.address.update).toHaveBeenCalledWith({
      where: { id: 'addr-1' },
      data: expect.objectContaining({ latitude: null }),
    });
  });

  it('sets default and clears the others', async () => {
    const db = withTransaction(baseDb());
    db.address.findFirst = vi.fn().mockResolvedValue(addressRow({ id: 'addr-2' }));
    const service = buildService(db);

    await service.setDefault('cust-1', 'addr-2');

    expect(db.address.updateMany).toHaveBeenCalledWith({
      where: { customerId: 'cust-1' },
      data: { isDefault: false },
    });
    expect(db.address.update).toHaveBeenCalledWith({
      where: { id: 'addr-2' },
      data: { isDefault: true },
    });
  });

  it('deletes an owned address', async () => {
    const db = baseDb();
    const service = buildService(db);

    const result = await service.delete('cust-1', 'addr-1');

    expect(result).toEqual({ id: 'addr-1', deleted: true });
    expect(db.address.delete).toHaveBeenCalledWith({ where: { id: 'addr-1' } });
  });
});
