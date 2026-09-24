import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from '@node-rs/argon2';
import {
  BranchProductStatus,
  BranchStatus,
  CatalogStatus,
  PrismaClient,
  Role,
  UserStatus,
} from '../src/generated/prisma/client';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to seed');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const GUNTUR_BRANCH_CODE = 'guntur';

const CATEGORIES: ReadonlyArray<{
  name: string;
  slug: string;
  sortOrder: number;
}> = [
  { name: 'Biryani & Rice Meals', slug: 'biryani-and-rice', sortOrder: 0 },
  { name: 'Starters', slug: 'starters', sortOrder: 1 },
  { name: 'Rolls & Burgers', slug: 'rolls-burgers', sortOrder: 2 },
  { name: 'Beverages', slug: 'beverages', sortOrder: 3 },
  { name: 'Desserts', slug: 'desserts', sortOrder: 4 },
];

interface ProductSeed {
  name: string;
  slug: string;
  description: string;
  categorySlug: string;
  priceMinor: number;
  discountMinor: number;
  isAvailable: boolean;
}

const PRODUCTS: ReadonlyArray<ProductSeed> = [
  {
    name: 'Special Chicken Biryani',
    slug: 'special-chicken-biryani',
    description:
      'Long-grain basmati rice with tender chicken, mint, and spices, served with raita.',
    categorySlug: 'biryani-and-rice',
    priceMinor: 29900,
    discountMinor: 2000,
    isAvailable: true,
  },
  {
    name: 'Veg Fried Rice',
    slug: 'veg-fried-rice',
    description: 'Wok-tossed rice with fresh vegetables and soy garlic seasoning.',
    categorySlug: 'biryani-and-rice',
    priceMinor: 15900,
    discountMinor: 0,
    isAvailable: true,
  },
  {
    name: 'Paneer 65',
    slug: 'paneer-65',
    description: 'Crispy fried paneer tossed in spiced yogurt and curry leaves.',
    categorySlug: 'starters',
    priceMinor: 18900,
    discountMinor: 1000,
    isAvailable: true,
  },
  {
    name: 'Chilli Chicken',
    slug: 'chilli-chicken',
    description: 'Sweet, spicy, and tangy Indo-Chinese chicken starter.',
    categorySlug: 'starters',
    priceMinor: 22900,
    discountMinor: 0,
    isAvailable: false,
  },
  {
    name: 'Chicken 65 Roll',
    slug: 'chicken-65-roll',
    description: 'Spicy chicken 65 wrapped in a soft parotta with onion and mint chutney.',
    categorySlug: 'rolls-burgers',
    priceMinor: 12900,
    discountMinor: 500,
    isAvailable: true,
  },
  {
    name: 'Egg Roll',
    slug: 'egg-roll',
    description: 'Fluffy omelette rolled with spiced onions in a crisp parotta.',
    categorySlug: 'rolls-burgers',
    priceMinor: 9990,
    discountMinor: 0,
    isAvailable: true,
  },
  {
    name: 'Masala Lemonade',
    slug: 'masala-lemonade',
    description: 'Classic Andhra masala lemonade, tangy with roasted cumin.',
    categorySlug: 'beverages',
    priceMinor: 4900,
    discountMinor: 0,
    isAvailable: true,
  },
  {
    name: 'Butterscotch Shake',
    slug: 'butterscotch-shake',
    description: 'Rich butterscotch shake topped with crushed praline.',
    categorySlug: 'beverages',
    priceMinor: 12900,
    discountMinor: 0,
    isAvailable: true,
  },
  {
    name: 'Gulab Jamun',
    slug: 'gulab-jamun',
    description: 'Two soft khoya dumplings soaked in rose syrup.',
    categorySlug: 'desserts',
    priceMinor: 7990,
    discountMinor: 0,
    isAvailable: true,
  },
];

const SEED_PASSWORD_COST = {
  memoryCost: 19456,
  timeCost: 2,
};

async function seedBranch() {
  const branch = await prisma.branch.upsert({
    where: { code: GUNTUR_BRANCH_CODE },
    update: {},
    create: {
      code: GUNTUR_BRANCH_CODE,
      name: 'Hungry Box Guntur (Demo)',
      city: 'Guntur',
      state: 'Andhra Pradesh',
      country: 'India',
      address: 'Main Road, Guntur',
      latitude: 16.3067,
      longitude: 80.4365,
      deliveryRadiusKm: 10,
      status: BranchStatus.ACTIVE,
    },
  });
  return branch;
}

async function seedCategories() {
  const bySlug = new Map<string, string>();
  for (const category of CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, sortOrder: category.sortOrder },
      create: {
        name: category.name,
        slug: category.slug,
        sortOrder: category.sortOrder,
        status: CatalogStatus.ACTIVE,
      },
    });
    bySlug.set(category.slug, row.id);
  }
  return bySlug;
}

async function seedProducts(branchId: string, categoryIds: Map<string, string>) {
  const bySlug = new Map<string, string>();
  for (const item of PRODUCTS) {
    const product = await prisma.product.upsert({
      where: { slug: item.slug },
      update: { name: item.name, description: item.description },
      create: {
        name: item.name,
        slug: item.slug,
        description: item.description,
        categoryId: categoryIds.get(item.categorySlug) ?? null,
        status: CatalogStatus.ACTIVE,
      },
    });

    await prisma.branchProduct.upsert({
      where: {
        branchId_productId: {
          branchId,
          productId: product.id,
        },
      },
      update: {
        priceMinor: item.priceMinor,
        discountMinor: item.discountMinor,
        isAvailable: item.isAvailable,
      },
      create: {
        branchId,
        productId: product.id,
        priceMinor: item.priceMinor,
        discountMinor: item.discountMinor,
        isAvailable: item.isAvailable,
        status: BranchProductStatus.ACTIVE,
      },
    });
    bySlug.set(item.slug, product.id);
  }
  return bySlug;
}

interface UserSeed {
  loginId: string;
  email: string | null;
  name: string;
  password: string;
  role: Role;
  branchId: string | null;
  phone?: string | null;
}

async function seedUsers(gunturBranchId: string) {
  const users: UserSeed[] = [
    {
      loginId: 'admin@gmail.com',
      email: 'admin@gmail.com',
      name: 'Super Admin',
      password: '456456',
      role: Role.SUPER_ADMIN,
      branchId: null,
    },
    {
      loginId: 'branch1@gmail.com',
      email: 'branch1@gmail.com',
      name: 'Guntur Branch Manager',
      password: '654654',
      role: Role.BRANCH_MANAGER,
      branchId: gunturBranchId,
    },
    {
      loginId: 'shiva@',
      email: null,
      name: 'Delivery Partner',
      password: '789789',
      role: Role.DELIVERY_PARTNER,
      branchId: gunturBranchId,
    },
    {
      loginId: 'customer@gmail.com',
      email: 'customer@gmail.com',
      name: 'Demo Customer',
      password: '20252025',
      role: Role.CUSTOMER,
      branchId: null,
      phone: '9000000000',
    },
  ];

  for (const user of users) {
    const passwordHash = await hash(user.password, SEED_PASSWORD_COST);
    await prisma.user.upsert({
      where: { loginId: user.loginId },
      update: {
        role: user.role,
        status: UserStatus.ACTIVE,
        branchId: user.branchId,
        email: user.email,
        phone: user.phone ?? null,
      },
      create: {
        loginId: user.loginId,
        email: user.email,
        name: user.name,
        phone: user.phone ?? null,
        passwordHash,
        role: user.role,
        status: UserStatus.ACTIVE,
        branchId: user.branchId,
      },
    });
  }
}

async function seedCustomerAddress() {
  const customer = await prisma.user.findUnique({
    where: { loginId: 'customer@gmail.com' },
    select: { id: true },
  });
  if (!customer) {
    throw new Error('Demo customer was not seeded; cannot add demo address');
  }
  const existing = await prisma.address.findFirst({
    where: { customerId: customer.id, houseFlat: '2-13', streetArea: 'Lakshmipuram Main Road' },
    select: { id: true },
  });
  const data = {
    label: 'HOME',
    recipientName: 'Demo Customer',
    phone: '9000000000',
    houseFlat: '2-13',
    streetArea: 'Lakshmipuram Main Road',
    landmark: 'Near Clock Tower',
    city: 'Guntur',
    state: 'Andhra Pradesh',
    postalCode: '522007',
    latitude: 16.3015,
    longitude: 80.4405,
    deliveryInstructions: 'Leave at the gate',
    isDefault: true,
  };
  const address = existing
    ? await prisma.address.update({ where: { id: existing.id }, data })
    : await prisma.address.create({ data: { ...data, customerId: customer.id } });
  await prisma.address.updateMany({
    where: { customerId: customer.id, id: { not: address.id } },
    data: { isDefault: false },
  });
  return address;
}

async function seedDeliveryPartnerDemo() {
  const partnerUser = await prisma.user.findUnique({
    where: { loginId: 'shiva@' },
    select: { id: true, branchId: true },
  });
  if (!partnerUser?.branchId) {
    throw new Error('Demo delivery partner user has no branch; cannot seed partner profile');
  }
  const existing = await prisma.deliveryPartnerProfile.findFirst({
    where: { userId: partnerUser.id },
    select: { id: true },
  });
  if (existing) return;

  const counter = await prisma.partnerIdCounter.upsert({
    where: { id: 'partner' },
    update: { seq: { increment: 0 } },
    create: { id: 'partner', seq: 1 },
  });
  const partnerId = `HB-DP-${String(counter.seq).padStart(6, '0')}`;

  const profile = await prisma.deliveryPartnerProfile.create({
    data: {
      partnerId,
      userId: partnerUser.id,
      branchId: partnerUser.branchId,
      fullName: 'Shiva Kumar',
      mobile: '9000000001',
      email: null,
      gender: 'Male',
      city: 'Guntur',
      state: 'Andhra Pradesh',
      postalCode: '522002',
      latitude: 16.2967,
      longitude: 80.4365,
      identityVerified: true,
      addressProofVerified: true,
      drivingLicenceNumber: 'DL6321XXXX',
      licenceType: 'Light Motor Vehicle',
      licenceVerified: true,
      vehicleType: 'Motorcycle',
      vehicleNumber: 'AP07 AB 1234',
      vehicleBrand: 'Hero',
      vehicleModel: 'Splendor Plus',
      vehicleColour: 'Black',
      ownVehicle: true,
      accountHolderName: 'Shiva Kumar',
      bankName: 'Demo Bank',
      accountNumberMasked: 'XXXX XXXX 4321',
      ifsc: 'DBBK0000001',
      payoutVerified: true,
      partnerType: 'FULL_TIME',
      joinedAt: new Date(),
      status: 'ACTIVE',
      availability: 'ONLINE',
      wentOnlineAt: new Date(),
    },
  });

  await prisma.deliveryPartnerDocument.createMany({
    data: [
      { deliveryPartnerId: profile.id, type: 'AADHAAR', status: 'VERIFIED', documentReference: 'demo/aadhaar' },
      { deliveryPartnerId: profile.id, type: 'PAN', status: 'VERIFIED', documentReference: 'demo/pan' },
      { deliveryPartnerId: profile.id, type: 'ADDRESS_PROOF', status: 'VERIFIED', documentReference: 'demo/address' },
      { deliveryPartnerId: profile.id, type: 'DRIVING_LICENSE', status: 'VERIFIED', documentReference: 'demo/driving-license' },
      { deliveryPartnerId: profile.id, type: 'PROFILE_PHOTO', status: 'VERIFIED', documentReference: 'demo/profile-photo' },
    ],
  });

  console.log(`Seeded demo delivery partner (${partnerId}) for loginId "shiva@"`);
}

async function main() {
  const branch = await seedBranch();
  const categoryIds = await seedCategories();
  const productSlugs = await seedProducts(branch.id, categoryIds);
  await seedUsers(branch.id);
  const address = await seedCustomerAddress();
  await seedDeliveryPartnerDemo();

  console.log(`Seeded branch "${branch.code}" (id=${branch.id})`);
  console.log(`Seeded ${categoryIds.size} categories and ${productSlugs.size} products`);
  console.log(`Seeded demo customer default address (id=${address.id})`);
  console.log(
    'Demo credentials: admin@gmail.com / branch1@gmail.com / shiva@ / customer@gmail.com (see AGENTS.md)',
  );
  console.log('Note: seeded user passwords are hashed with Argon2.');
}

main()
  .catch((error: unknown) => {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
