import { z } from 'zod';
import defaultServices from '@/data/services.json';
import { landingMediaUrlSchema } from './hero-schema';

export type ServiceCardContent = {
  title: string;
  description: string;
  category: string;
  icon: string;
  image_url: string;
  details: string;
};

export type ServicesContent = { items: ServiceCardContent[] };

export const DEFAULT_SERVICES: ServiceCardContent[] = defaultServices.map((service) => ({
  ...service,
  image_url: '',
}));

const serviceCardContentSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
  category: z.string().trim().min(1).max(100),
  icon: z.string().trim().min(1).max(50),
  image_url: landingMediaUrlSchema.optional().default(''),
  details: z.string().trim().min(1).max(2000).optional(),
}).passthrough();

export const servicesContentSchema = z.object({
  items: z.array(serviceCardContentSchema).length(DEFAULT_SERVICES.length),
}).passthrough();

export function normalizeServicesContent(value: unknown): ServicesContent {
  const parsed = servicesContentSchema.safeParse(value);
  if (!parsed.success) return { items: DEFAULT_SERVICES };
  return {
    items: parsed.data.items.map((service, index) => ({
      title: String(service.title ?? DEFAULT_SERVICES[index].title),
      description: String(service.description ?? DEFAULT_SERVICES[index].description),
      category: String(service.category ?? DEFAULT_SERVICES[index].category),
      icon: String(service.icon ?? DEFAULT_SERVICES[index].icon),
      image_url: String(service.image_url ?? ''),
      details: String(service.details ?? DEFAULT_SERVICES[index].details),
    })),
  };
}
