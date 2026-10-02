export type AeoStructureInput = {
  entityName: string;
  title?: string | null;
  description?: string | null;
  clinicName?: string | null;
  city?: string | null;
  area?: string | null;
  services?: Array<string | null | undefined>;
};

export function buildAeoSummary(input: AeoStructureInput): string {
  const location = [input.city, input.area].filter(Boolean).join(' — ');
  const realServices = (input.services ?? []).filter((service): service is string => Boolean(service && service.trim()));
  const serviceText = realServices.slice(0, 3).join(' • ');

  const identity = [input.entityName, input.title, input.clinicName].filter(Boolean).join(' — ');
  const description = input.description?.trim() ? input.description.trim() : null;
  const fragments = [identity, location, serviceText, description].filter(Boolean);

  if (fragments.length === 0) return input.entityName;
  return fragments.join(' • ');
}

export function buildAeoSections(input: AeoStructureInput) {
  const location = [input.city, input.area].filter(Boolean).join(' — ');
  const services = (input.services ?? []).filter((service): service is string => Boolean(service && service.trim()));

  return [
    {
      heading: input.entityName,
      content: buildAeoSummary(input),
    },
    {
      heading: 'الخدمات',
      content: services.length > 0 ? services.join(' • ') : 'لا توجد خدمات منشورة بعد.',
    },
    {
      heading: 'معلومات العيادة',
      content: location || 'لم يتم إدراج موقع العيادة بعد.',
    },
  ];
}
