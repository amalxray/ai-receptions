export type Lead = {
  id: number;
  clinic_id?: string | null;
  name: string;
  email: string;
  phone: string;
  source: string;
  status: string;
};
