import { addOrganizationNoteAction, addPersonNoteAction } from "@/lib/actions";
import { NoteListItem } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { SubmitButton } from "@/components/forms";

export function NotesStream({
  entityType,
  entityId,
  notes,
  returnTo
}: {
  entityType: "person" | "organization";
  entityId: number;
  notes: NoteListItem[];
  returnTo: string;
}) {
  const action =
    entityType === "person" ? addPersonNoteAction.bind(null, entityId) : addOrganizationNoteAction.bind(null, entityId);

  return (
    <div className="stack">
      <form action={action} className="stack note-composer">
        <input name="returnTo" type="hidden" value={returnTo} />
        <label>
          Neue Notiz
          <textarea name="body" rows={4} placeholder="Kurz, konkret, intern..." required />
        </label>
        <SubmitButton pendingLabel="Speichert Notiz...">Notiz speichern</SubmitButton>
      </form>

      <div className="notes-list notes-timeline">
        {notes.length === 0 ? <p className="empty-state">Noch keine Notizen vorhanden.</p> : null}
        {notes.map((note) => (
          <article className="note-item" key={note.id}>
            <div className="note-meta">
              <strong>{note.authorName}</strong>
              <span>{formatDate(note.createdAt)}</span>
            </div>
            <p>{note.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
