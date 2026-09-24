import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, CatalogStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import type { ProductDetail, ProductImageReference, ProductSummary } from './product.mapper';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ProductSummary[]> {
    const db = this.prisma.requireClient();
    const products = await db.product.findMany({
      where: { status: CatalogStatus.ACTIVE },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        status: true,
        category: {
          select: { id: true, name: true, slug: true },
        },
        images: {
          where: { isPrimary: true },
          take: 1,
          select: { imageUrl: true, altText: true },
        },
      },
    });
    return products.map((product) => this.toSummary(product));
  }

  async getById(id: string): Promise<ProductDetail> {
    const db = this.prisma.requireClient();
    const product = await db.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        status: true,
        category: {
          select: { id: true, name: true, slug: true },
        },
        images: {
          orderBy: { sortOrder: 'asc' },
          select: { imageUrl: true, altText: true },
        },
      },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      status: product.status,
      category: product.category,
      primaryImage: product.images[0] ?? null,
      images: product.images,
    };
  }

  async create(dto: CreateProductDto): Promise<ProductSummary> {
    const db = this.prisma.requireClient();

    if (dto.categoryId) {
      const category = await db.category.findUnique({
        where: { id: dto.categoryId },
        select: { id: true, status: true },
      });
      if (!category || category.status !== CatalogStatus.ACTIVE) {
        throw new BadRequestException('Category not found or inactive');
      }
    }

    try {
      const product = await db.product.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          description: dto.description ?? null,
          categoryId: dto.categoryId ?? null,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          status: true,
          category: {
            select: { id: true, name: true, slug: true },
          },
          images: {
            where: { isPrimary: true },
            take: 1,
            select: { imageUrl: true, altText: true },
          },
        },
      });
      return this.toSummary(product);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Product slug already exists');
      }
      throw error;
    }
  }

  private toSummary(product: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    status: 'ACTIVE' | 'INACTIVE';
    category: { id: string; name: string; slug: string } | null;
    images: ProductImageReference[];
  }): ProductSummary {
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      status: product.status,
      category: product.category,
      primaryImage: product.images[0] ?? null,
    };
  }
}
