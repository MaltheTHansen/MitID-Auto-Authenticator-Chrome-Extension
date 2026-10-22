import type { Identity } from "./identity.js";
import { sendCommand } from "./messages.js";
import { onStatusReported, type Status } from "./status.js";
import { loadIdentities, onIdentitiesChanged } from "./store.js";

const PANEL_WIDTH_PX = 200;
const PANEL_GAP_PX = 16;

const PANEL_STYLES = `
  :host {
    position: absolute;
    z-index: 2147483647;
    box-sizing: border-box;
    width: ${PANEL_WIDTH_PX}px;
    padding: 10px 12px;
    border: 1px solid #d5dbe3;
    border-radius: 6px;
    background: #ffffff;
    color: #1c2430;
    font: 13px/1.4 system-ui, "Segoe UI", sans-serif;
    text-align: left;
  }
  h2 { margin: 0 0 6px; font-size: 12px; font-weight: 600; color: #5b6b7f; }
  ol { list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
  .user-id { flex: 1; font-weight: 600; overflow-wrap: anywhere; }
  button {
    padding: 4px 10px;
    border: 1px solid #0060e6;
    border-radius: 6px;
    background: #0060e6;
    color: #ffffff;
    font: inherit;
    cursor: pointer;
  }
  .empty, .status { margin: 6px 0 0; color: #5b6b7f; }
  .status[data-kind="success"] { color: #1a7f37; }
  .status[data-kind="error"] { color: #c62828; }
`;

const mitIdBox = document.getElementById("remoteClient");
if (mitIdBox && document.getElementById("clientInfoAux")) showLoginPanel(mitIdBox);

function showLoginPanel(mitIdBox: HTMLElement): void {
  const host = document.createElement("div");
  const panel = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = PANEL_STYLES;
  const list = document.createElement("ol");
  const statusLine = textElement("p", "status", "");
  statusLine.hidden = true;
  panel.append(style, textElement("h2", "", "MitID Auto Authenticator"), list, statusLine);
  document.body.append(host);
  keepBeside(host, mitIdBox);

  list.addEventListener("click", (event) => {
    const userId = (event.target as HTMLElement).closest<HTMLButtonElement>("button")?.dataset.userId;
    if (userId) sendCommand({ type: "log-in", userId });
  });

  const render = (identities: Identity[]) =>
    list.replaceChildren(
      ...(identities.length
        ? identities.map(identityRow)
        : [textElement("li", "empty", "No Identities yet. Add them in the extension's popup.")]),
    );
  onIdentitiesChanged(render);
  void loadIdentities().then(render);
  onStatusReported((status) => showStatus(statusLine, status));
}

function keepBeside(host: HTMLElement, mitIdBox: HTMLElement): void {
  const place = () => {
    const box = mitIdBox.getBoundingClientRect();
    const fitsOnRight = box.right + PANEL_GAP_PX + PANEL_WIDTH_PX <= document.documentElement.clientWidth;
    const left = fitsOnRight ? box.right + PANEL_GAP_PX : box.left - PANEL_GAP_PX - PANEL_WIDTH_PX;
    host.style.left = `${Math.max(left, 0) + scrollX}px`;
    host.style.top = `${box.top + scrollY}px`;
  };
  place();
  new ResizeObserver(place).observe(mitIdBox);
  addEventListener("resize", place);
}

function identityRow(identity: Identity): HTMLElement {
  const logIn = textElement("button", "", "Log in");
  logIn.setAttribute("type", "button");
  logIn.dataset.userId = identity.userId;
  const row = document.createElement("li");
  row.append(textElement("span", "user-id", identity.userId), logIn);
  return row;
}

function showStatus(statusLine: HTMLElement, status: Status): void {
  statusLine.hidden = false;
  statusLine.dataset.kind = status.kind;
  statusLine.textContent = status.text;
}

function textElement<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  if (className) created.className = className;
  created.textContent = text;
  return created;
}
