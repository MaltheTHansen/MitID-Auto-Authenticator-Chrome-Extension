export async function isLoginPage(tabId: number): Promise<boolean> {
  return (await loginPageAux(tabId)) !== null;
}

export async function loginPageAux(tabId: number): Promise<string | null> {
  try {
    const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func: readAux });
    return injection?.result ?? null;
  } catch {
    return null;
  }
}

export async function submitAuthCode(tabId: number, authCode: string): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, func: submitLoginForm, args: [authCode] });
}

function readAux(): string | null {
  const aux = document.querySelector<HTMLInputElement>("#clientInfoAux")?.value;
  const canSubmit = document.getElementById("AuthCode") !== null && document.getElementById("loginForm") !== null;
  return aux && canSubmit ? aux : null;
}

function submitLoginForm(authCode: string): void {
  document.querySelector<HTMLInputElement>("#AuthCode")!.value = authCode;
  document.querySelector<HTMLFormElement>("#loginForm")!.submit();
}
