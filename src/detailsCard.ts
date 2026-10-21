import { ageOn, attentionNotes, type IdentityDetails } from "./identityDetails.js";

export interface DetailsCardState {
  details?: IdentityDetails;
  loading: boolean;
  error?: string;
}

interface DetailField {
  label: string;
  value?: string;
  copyValue?: string;
  copyable?: false;
  needsAttention?: boolean;
}

export function detailsCardContent(state: DetailsCardState, today: Date): Node[] {
  if (state.loading && !state.details) return [element("p", "muted", "Looking up details in MitID…")];

  const content: Node[] = [];
  if (state.error) content.push(element("p", "details-error", `Could not look up details: ${state.error}`));
  if (state.details) {
    content.push(...detailFields(state.details, today).filter((field) => field.value).map(fieldRow));
    content.push(fetchedFooter(state.details, state.loading));
  } else if (state.error) {
    content.push(refreshButton(false));
  }
  return content;
}

function detailFields(details: IdentityDetails, today: Date): DetailField[] {
  const notes = attentionNotes(details);
  const born = details.dateOfBirth && `${details.dateOfBirth} (age ${ageOn(details.dateOfBirth, today)})`;
  return [
    { label: "Name", value: details.name },
    { label: "CPR number", value: details.cprNumber },
    { label: "Born", value: born, copyValue: details.dateOfBirth },
    { label: "Address", value: details.address },
    { label: "Email", value: details.email },
    { label: "Assurance level", value: details.assuranceLevel },
    {
      label: "Status",
      value: notes.length ? notes.join(" · ") : "Active",
      copyable: false,
      needsAttention: notes.length > 0,
    },
  ];
}

function fieldRow(field: DetailField): HTMLElement {
  const row = element("div", "detail-field");
  row.append(element("span", "label", field.label), element("span", "value", field.value!));
  if (field.needsAttention) row.classList.add("attention");
  if (field.copyable === false) return row;

  const copy = element("button", "icon copy", "⧉");
  copy.setAttribute("type", "button");
  copy.setAttribute("title", `Copy ${field.label.toLowerCase()}`);
  copy.dataset.action = "copy";
  copy.dataset.copyLabel = field.label.toLowerCase();
  copy.dataset.copyValue = field.copyValue ?? field.value!;
  row.append(copy);
  return row;
}

function fetchedFooter(details: IdentityDetails, refreshing: boolean): HTMLElement {
  const footer = element("div", "details-footer muted");
  const fetched = new Date(details.fetchedAt).toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short" });
  footer.append(element("span", "", refreshing ? "Refreshing…" : `Fetched ${fetched}`), refreshButton(refreshing));
  return footer;
}

function refreshButton(disabled: boolean): HTMLButtonElement {
  const button = element("button", "icon", "↻");
  button.setAttribute("type", "button");
  button.setAttribute("title", "Look up again in MitID");
  button.dataset.action = "refresh-details";
  button.disabled = disabled;
  return button;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  if (className) created.className = className;
  if (text !== undefined) created.textContent = text;
  return created;
}
