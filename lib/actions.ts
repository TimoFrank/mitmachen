"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearSession, hashPassword, requireUserId, setSession } from "@/lib/auth";
import {
  createNote,
  createOrganization,
  createPerson,
  getUserByEmail,
  parseNoteFormData,
  parseOrganizationFormData,
  parsePersonFormData,
  updateOrganization,
  updateOrganizationOwner,
  updatePerson,
  updatePersonOwner
} from "@/lib/db";

function requireText(value: string, label: string) {
  if (!value) {
    throw new Error(`${label} ist erforderlich.`);
  }
}

function withSavedParam(path: string, saved: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}saved=${saved}`;
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    redirect("/login?error=missing");
  }

  const user = getUserByEmail(email);

  if (!user || user.passwordHash !== hashPassword(password)) {
    redirect("/login?error=invalid");
  }

  await setSession(user.id);
  redirect("/");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

export async function createPersonAction(formData: FormData) {
  await requireUserId();
  const input = parsePersonFormData(formData);
  requireText(input.firstName, "Vorname");
  requireText(input.lastName, "Nachname");

  const personId = createPerson(input);
  revalidatePath("/");
  revalidatePath("/people");
  redirect(`/people/${personId}?saved=person-created`);
}

export async function updatePersonAction(personId: number, formData: FormData) {
  await requireUserId();
  const input = parsePersonFormData(formData);
  const returnTo = String(formData.get("returnTo") || `/people/${personId}`);
  requireText(input.firstName, "Vorname");
  requireText(input.lastName, "Nachname");

  updatePerson(personId, input);
  revalidatePath(`/people/${personId}`);
  revalidatePath("/people");
  redirect(withSavedParam(returnTo, "person-updated"));
}

export async function updatePersonOwnerAction(personId: number, formData: FormData) {
  await requireUserId();
  const returnTo = String(formData.get("returnTo") || `/people/${personId}`);
  const rawOwnerId = String(formData.get("ownerId") || "").trim();
  const parsedOwnerId = rawOwnerId ? Number(rawOwnerId) : null;
  const ownerId = parsedOwnerId !== null && Number.isInteger(parsedOwnerId) ? parsedOwnerId : null;

  updatePersonOwner(personId, ownerId);
  revalidatePath(`/people/${personId}`);
  revalidatePath("/people");
  redirect(withSavedParam(returnTo, "owner-updated"));
}

export async function createOrganizationAction(formData: FormData) {
  await requireUserId();
  const input = parseOrganizationFormData(formData);
  requireText(input.name, "Name");

  const organizationId = createOrganization(input);
  revalidatePath("/");
  revalidatePath("/organizations");
  redirect(`/organizations/${organizationId}?saved=organization-created`);
}

export async function updateOrganizationAction(organizationId: number, formData: FormData) {
  await requireUserId();
  const input = parseOrganizationFormData(formData);
  const returnTo = String(formData.get("returnTo") || `/organizations/${organizationId}`);
  requireText(input.name, "Name");

  updateOrganization(organizationId, input);
  revalidatePath(`/organizations/${organizationId}`);
  revalidatePath("/organizations");
  redirect(withSavedParam(returnTo, "organization-updated"));
}

export async function updateOrganizationOwnerAction(organizationId: number, formData: FormData) {
  await requireUserId();
  const returnTo = String(formData.get("returnTo") || `/organizations/${organizationId}`);
  const rawOwnerId = String(formData.get("ownerId") || "").trim();
  const parsedOwnerId = rawOwnerId ? Number(rawOwnerId) : null;
  const ownerId = parsedOwnerId !== null && Number.isInteger(parsedOwnerId) ? parsedOwnerId : null;

  updateOrganizationOwner(organizationId, ownerId);
  revalidatePath(`/organizations/${organizationId}`);
  revalidatePath("/organizations");
  redirect(withSavedParam(returnTo, "owner-updated"));
}

export async function addPersonNoteAction(personId: number, formData: FormData) {
  const authorId = await requireUserId();
  const returnTo = String(formData.get("returnTo") || `/people/${personId}#notes`);
  const { body } = parseNoteFormData(formData);
  requireText(body, "Notiz");

  createNote({
    body,
    entityType: "person",
    entityId: personId,
    authorId
  });

  revalidatePath(`/people/${personId}`);
  revalidatePath("/people");
  redirect(withSavedParam(returnTo, "note-saved"));
}

export async function addOrganizationNoteAction(organizationId: number, formData: FormData) {
  const authorId = await requireUserId();
  const returnTo = String(formData.get("returnTo") || `/organizations/${organizationId}#notes`);
  const { body } = parseNoteFormData(formData);
  requireText(body, "Notiz");

  createNote({
    body,
    entityType: "organization",
    entityId: organizationId,
    authorId
  });

  revalidatePath(`/organizations/${organizationId}`);
  revalidatePath("/organizations");
  redirect(withSavedParam(returnTo, "note-saved"));
}
