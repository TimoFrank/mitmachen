export type UserRecord = {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
};

export type OrganizationRecord = {
  id: number;
  name: string;
  industry: string | null;
  website: string | null;
  city: string | null;
  status: string;
  ownerId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type PersonRecord = {
  id: number;
  firstName: string;
  lastName: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  organizationId: number | null;
  ownerId: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type NoteRecord = {
  id: number;
  body: string;
  entityType: "person" | "organization";
  entityId: number;
  authorId: number;
  createdAt: string;
};

export type UserOption = {
  id: number;
  name: string;
  email: string;
};

export type SortOption = "updated" | "name";

export type OrganizationOption = {
  id: number;
  name: string;
};

export type PersonListItem = {
  id: number;
  firstName: string;
  lastName: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  organizationName: string | null;
  ownerName: string | null;
};

export type OrganizationListItem = {
  id: number;
  name: string;
  industry: string | null;
  sector: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  ownerName: string | null;
  peopleCount: number;
};

export type NoteListItem = {
  id: number;
  body: string;
  createdAt: string;
  authorName: string;
};

export type PersonDetail = {
  person: PersonRecord;
  organizationName: string | null;
  ownerName: string | null;
  notes: NoteListItem[];
};

export type OrganizationDetail = {
  organization: OrganizationRecord;
  ownerName: string | null;
  contacts: OrganizationOption[];
  notes: NoteListItem[];
};

export type DashboardStats = {
  organizations: number;
  people: number;
  notes: number;
};

export type PersonFilterOptions = {
  roles: string[];
  organizations: OrganizationOption[];
  owners: UserOption[];
};

export type OrganizationFilterOptions = {
  sectors: string[];
  cities: string[];
  states: string[];
};

export type GlobalSearchItem = {
  id: number;
  kind: "person" | "organization";
  title: string;
  subtitle: string;
  href: string;
  keywords: string;
};
