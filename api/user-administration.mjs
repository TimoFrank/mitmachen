import crypto from "node:crypto";

const ROLES = new Set(["viewer", "editor", "admin"]);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
export const adminError = (status, message) => Object.assign(new Error(message), { status });
export const adminFingerprint = value => crypto.createHash("sha256").update(JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)).digest("hex");
const exact = (value, keys) => value && !Array.isArray(value) && Object.keys(value).sort().join() === [...keys].sort().join();
const cleanText = (value, max) => typeof value === "string" && value === value.trim() && value.length <= max && !/[\x00-\x1f\x7f]/u.test(value);

export function validateAdminInvitation(value) {
  if (!exact(value, ["operationId", "name", "email", "role", "emailOwnershipVerified"]) || !UUID.test(value.operationId || "")
    || !cleanText(value.name, 120) || !value.name || !cleanText(value.email, 254)
    || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(value.email) || value.email !== value.email.toLowerCase()
    || !["viewer", "editor"].includes(value.role) || value.emailOwnershipVerified !== true) {
    throw adminError(400, "Name, bestätigte E-Mail-Adresse und Rolle sind erforderlich.");
  }
  return { ...value };
}

export function assertUserAdministrator(actor) {
  if (!actor?.id || actor.active === false || actor.role !== "admin"
    || (actor.access_scope || actor.accessScope) !== "standard"
    || (actor.scope_ref || actor.scopeRef)) throw adminError(403, "Nur freigegebene Admins dürfen Nutzer verwalten.");
}

export function adminAccountRows(users, profiles, bindings, project) {
  const namespace = `securetoken.google.com/${project}:`;
  return users.map(user => {
    const matches = bindings.filter(b => b.issuer === "https://cloud.google.com/iap" && b.subject === namespace + user.uid);
    const binding = matches.length === 1 ? matches[0] : null;
    const profile = binding && profiles.find(p => p.id === binding.profile_id);
    const bound = Boolean(profile && binding);
    const active = bound && profile.active && binding.active && !user.disabled;
    const version = adminFingerprint({ profile: profile || null, bindings: matches, disabled: user.disabled === true });
    return {
      id: user.uid, profileId: profile?.id || null, name: profile?.display_name || user.displayName || user.email || "Ohne Namen",
      email: user.email || "", role: profile?.role || null, team: profile?.team || "",
      scope: binding?.access_scope || null, scopeRef: binding?.scope_ref || null, status: !bound ? "unbound" : active ? "active" : "blocked",
      identityEnabled: !user.disabled, profileEnabled: Boolean(profile?.active), bindingEnabled: Boolean(binding?.active),
      lastSignIn: user.metadata?.lastSignInTime || null,
      providers: (user.providerData || []).map(p => p.providerId), version,
      editable: Boolean(bound && binding.active && ["standard", "test_only"].includes(binding.access_scope))
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "de") || a.email.localeCompare(b.email));
}

export function createUserAdministration({ pool, auth, delivery, project }) {
  async function identities() {
    const users = []; let token;
    do {
      const page = await auth.listUsers(1000, token); users.push(...page.users); token = page.pageToken;
      if (users.length > 10000) throw adminError(503, "Die Nutzerliste ist zu groß. Bitte die Administration kontaktieren.");
    } while (token);
    return users;
  }
  async function rows(client) {
    const [users, profiles, bindings] = await Promise.all([
      identities(), client.query("select id,email,display_name,role,active,team,updated_at from public.profiles"),
      client.query("select issuer,subject,profile_id,active,access_scope,scope_ref,updated_at from public.identity_bindings")
    ]);
    return adminAccountRows(users, profiles.rows, bindings.rows, project);
  }
  async function actorCheck(client, actor) {
    assertUserAdministrator(actor);
    const found = (await client.query(`select p.id from public.profiles p where p.id=$1 and p.active and p.role='admin'
      and exists(select 1 from public.identity_bindings b where b.profile_id=p.id and b.active and b.access_scope='standard' and b.scope_ref is null and b.issuer='https://cloud.google.com/iap')`, [actor.id])).rows;
    if (found.length !== 1) throw adminError(403, "Deine Admin-Berechtigung ist nicht mehr aktiv.");
  }
  async function locked(actor, work) {
    assertUserAdministrator(actor);
    const client = await pool.connect(); let locked = false; let discard = false;
    try {
      await client.query("set statement_timeout='30s'");
      // One session lock serializes admin changes across replicas, including provider calls.
      await client.query("select pg_advisory_lock(hashtext('versorgungs-kompass:pre-gematik:identity-bindings'))"); locked = true;
      await actorCheck(client, actor);
      return await work(client);
    } finally {
      if (locked) await client.query("select pg_advisory_unlock(hashtext('versorgungs-kompass:pre-gematik:identity-bindings'))").catch(() => { discard = true; });
      client.release(discard);
    }
  }
  async function audit(client, actor, action, target, details = {}) {
    await client.query("insert into user_administration.audit(actor_id,action,target_id,details) values($1,$2,$3,$4)", [actor.id, action, target, JSON.stringify(details)]);
  }
  async function transaction(client, work) {
    await client.query("begin");
    try { const result = await work(); await client.query("commit"); return result; }
    catch (error) { await client.query("rollback").catch(() => {}); throw error; }
  }
  const publicInvitation = row => ({ id: row.id, name: row.input.name, email: row.input.email, role: row.input.role,
    status: row.status, createdAt: row.created_at, sentAt: row.accepted_at,
    preview: row.package ? { subject: row.package.subject, text: row.package.previewText, fingerprint: row.package.fingerprint } : null });
  async function findOperation(client, id) {
    if (!UUID.test(id || "")) throw adminError(400, "Ungültiger Vorgang.");
    const row = (await client.query("select * from user_administration.invitations where id=$1", [id])).rows[0];
    if (!row) throw adminError(404, "Einladung nicht gefunden.");
    return row;
  }
  return Object.freeze({
    async list(actor) {
      assertUserAdministrator(actor);
      const client = await pool.connect();
      try {
        await actorCheck(client, actor);
        const items = await rows(client);
        const invitations = (await client.query("select * from user_administration.invitations order by created_at desc limit 100")).rows.map(publicInvitation);
        const history = (await client.query(`select a.id,a.action,a.target_id,a.created_at,a.details,p.display_name as actor_name
          from user_administration.audit a left join public.profiles p on p.id=a.actor_id order by a.id desc limit 100`)).rows;
        return { items, invitations, history, actorProfileId: actor.id, canInvite: Boolean(delivery), accessEndsAt: delivery?.accessEnd || null };
      } finally { client.release(); }
    },
    async update(actor, uid, input) {
      if (!exact(input, ["version", "role", "enabled"]) || !/^[a-f0-9]{64}$/u.test(input.version || "")
        || !ROLES.has(input.role) || typeof input.enabled !== "boolean") throw adminError(400, "Ungültige Kontoänderung.");
      return locked(actor, async client => {
        const items = await rows(client); const row = items.find(v => v.id === uid);
        if (!row?.editable) throw adminError(409, "Die Kontobindung muss zunächst administrativ geklärt werden.");
        if (row.profileId === actor.id) throw adminError(409, "Das eigene Konto kann hier nicht geändert werden.");
        if (row.version !== input.version) throw adminError(409, "Das Konto wurde inzwischen geändert. Bitte neu laden.");
        if (row.scope === "test_only" && input.role === "admin") throw adminError(400, "Im Testbereich sind nur Viewer und Editor erlaubt.");
        if (row.role === "admin" && row.status === "active" && (!input.enabled || input.role !== "admin")
          && !items.some(v => v.profileId !== row.profileId && v.role === "admin" && v.scope === "standard" && v.status === "active")) {
          throw adminError(409, "Der letzte aktive Admin muss erhalten bleiben.");
        }
        // Suspend the app profile before changing the identity. A provider failure cannot leave app access open.
        await transaction(client, async () => {
          await client.query("update public.profiles set active=false where id=$1", [row.profileId]);
          await audit(client, actor, "change_started", uid, { email: row.email, before: { role: row.role, enabled: row.status === "active" }, after: input });
        });
        try {
          await auth.updateUser(uid, { disabled: !input.enabled });
          await auth.revokeRefreshTokens(uid);
          await transaction(client, async () => {
            await client.query("update public.profiles set role=$2,active=$3 where id=$1", [row.profileId, input.role, input.enabled]);
            await audit(client, actor, input.enabled ? "account_updated" : "account_blocked", uid, { email: row.email, role: input.role });
          });
        } catch {
          await audit(client, actor, "change_failed_closed", uid, { email: row.email });
          throw adminError(502, "Der App-Zugang bleibt gesperrt. Die Kontoänderung konnte nicht vollständig bestätigt werden; bitte neu laden und erneut prüfen.");
        }
        return { updated: true };
      });
    },
    async prepare(actor, value) {
      const input = validateAdminInvitation(value);
      if (!delivery) throw adminError(503, "Der Einladungsversand ist noch nicht eingerichtet.");
      return locked(actor, async client => {
        await delivery.check();
        let row = (await client.query("select * from user_administration.invitations where id=$1", [input.operationId])).rows[0];
        if (row && adminFingerprint(row.input) !== adminFingerprint(input)) throw adminError(409, "Der Vorgang gehört zu anderen Eingaben.");
        if (row?.status === "ready" || row?.status === "sent") return publicInvitation(row);
        if (row && row.status !== "preparing") throw adminError(409, "Dieser Vorgang muss vor einem weiteren Versuch geprüft werden.");
        if (!row) {
          const existing = (await client.query("select id from public.profiles where lower(email)=$1", [input.email])).rows;
          if (existing.length || (await client.query("select id from user_administration.invitations where lower(input->>'email')=$1", [input.email])).rowCount) throw adminError(409, "Für diese E-Mail-Adresse besteht bereits ein Profil.");
          try { await auth.getUserByEmail(input.email); throw adminError(409, "Für diese E-Mail-Adresse besteht bereits ein Konto."); }
          catch (error) { if (error.code !== "auth/user-not-found") throw error; }
          row = (await client.query(`insert into user_administration.invitations(id,input,uid,profile_id,status)
            values($1,$2,$3,$4,'preparing') returning *`, [input.operationId, JSON.stringify(input), `managed-${input.operationId}`, crypto.randomUUID()])).rows[0];
          await audit(client, actor, "invitation_started", row.uid, { email: input.email, role: input.role });
        }
        // Stable UID plus durable intent permits recovery without adopting an existing email account.
        let user;
        try { user = await auth.getUser(row.uid); }
        catch (error) {
          if (error.code !== "auth/user-not-found") throw error;
          user = await auth.createUser({ uid: row.uid, email: input.email, displayName: input.name, emailVerified: true, password: crypto.randomBytes(48).toString("base64url") });
        }
        if (user.uid !== row.uid || user.email !== input.email || user.displayName !== input.name || user.disabled || !user.emailVerified || user.providerData?.length !== 1 || user.providerData[0].providerId !== "password") {
          throw adminError(409, "Das vorhandene Konto stimmt nicht mit diesem Vorgang überein.");
        }
        const subject = `securetoken.google.com/${project}:${row.uid}`;
        await transaction(client, async () => {
          const profiles = (await client.query("select * from public.profiles where id=$1 or lower(email)=$2", [row.profile_id, input.email])).rows;
          const bindings = (await client.query("select * from public.identity_bindings where profile_id=$1 or subject=$2", [row.profile_id, subject])).rows;
          const pending = (await client.query("select request_id from public.identity_enrollment_requests where subject=$1 or lower(verified_email)=$2", [subject, input.email])).rows;
          if (pending.length) throw adminError(409, "Es besteht bereits ein anderer Zugangsauftrag.");
          if (!profiles.length && !bindings.length) {
            await client.query("insert into public.profiles(id,email,display_name,role,active) values($1,$2,$3,$4,true)", [row.profile_id, input.email, input.name, input.role]);
            await client.query(`insert into public.identity_bindings(issuer,subject,profile_id,active,access_scope,scope_ref)
              values('https://cloud.google.com/iap',$1,$2,true,'test_only',$3)`, [subject, row.profile_id, `external-pilot:managed-${input.operationId}`]);
          } else if (profiles.length !== 1 || bindings.length !== 1 || profiles[0].id !== row.profile_id
            || profiles[0].email !== input.email || profiles[0].display_name !== input.name || profiles[0].role !== input.role || !profiles[0].active
            || bindings[0].subject !== subject || bindings[0].issuer !== "https://cloud.google.com/iap" || !bindings[0].active
            || bindings[0].access_scope !== "test_only" || bindings[0].scope_ref !== `external-pilot:managed-${input.operationId}`) {
            throw adminError(409, "Die Profilzuordnung stimmt nicht mit diesem Vorgang überein.");
          }
        });
        const mailPackage = row.package || await delivery.prepare(row);
        // Save the inert package before publishing it in object storage; a retry reuses the same token.
        await client.query("update user_administration.invitations set package=$2 where id=$1", [row.id, JSON.stringify(mailPackage)]);
        await delivery.storePrepared(mailPackage);
        row = (await client.query("update user_administration.invitations set status='ready' where id=$1 returning *", [row.id])).rows[0];
        await audit(client, actor, "invitation_ready", row.uid, { email: input.email });
        return publicInvitation(row);
      });
    },
    async send(actor, id, input) {
      if (!exact(input, ["fingerprint"]) || !/^[a-f0-9]{64}$/u.test(input.fingerprint || "")) throw adminError(400, "Die Versandbestätigung fehlt.");
      if (!delivery) throw adminError(503, "Der Einladungsversand ist nicht eingerichtet.");
      return locked(actor, async client => {
        await delivery.check();
        let row = await findOperation(client, id);
        if (row.package?.fingerprint !== input.fingerprint) throw adminError(409, "Die Einladung wurde geändert. Bitte Vorschau neu laden.");
        if (row.status === "sent") return publicInvitation(row);
        if (row.status === "sending" || row.status === "uncertain") throw adminError(409, "Der Versandstatus ist unklar. Keine erneute Mail; bitte den Versandbeleg prüfen lassen.");
        if (row.status !== "ready" && row.status !== "accepted") throw adminError(409, "Die Einladung ist noch nicht versandbereit.");
        const target = (await rows(client)).find(v => v.id === row.uid);
        if (!target || target.profileId !== row.profile_id || target.status !== "active" || target.role !== row.input.role || target.scope !== "test_only" || target.scopeRef !== `external-pilot:managed-${id}` || target.email !== row.input.email) {
          throw adminError(409, "Die Kontoberechtigung hat sich geändert. Die Einladung wurde nicht versendet.");
        }
        if (row.status === "ready") {
          await client.query("update user_administration.invitations set status='sending' where id=$1", [id]);
          try {
            const acceptedAt = await delivery.send(row.package);
            row = (await client.query("update user_administration.invitations set status='accepted',accepted_at=$2 where id=$1 returning *", [id, acceptedAt])).rows[0];
          } catch {
            await client.query("update user_administration.invitations set status='uncertain' where id=$1", [id]);
            await audit(client, actor, "delivery_uncertain", row.uid, { email: row.input.email });
            throw adminError(502, "Der Versand konnte nicht sicher bestätigt werden. Bitte vor einem erneuten Versand prüfen lassen.");
          }
        }
        await delivery.activate(row.package, new Date(row.accepted_at).toISOString());
        row = (await client.query("update user_administration.invitations set status='sent', package=$2 where id=$1 returning *", [id, JSON.stringify({ fingerprint: row.package.fingerprint, subject: row.package.subject, previewText: row.package.previewText })])).rows[0];
        await audit(client, actor, "invitation_sent", row.uid, { email: row.input.email });
        return publicInvitation(row);
      });
    }
  });
}
