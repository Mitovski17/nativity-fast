import { useState } from "react";
import { deleteAccount } from "../lib/cloud";
import { tr } from "../lib/i18n";
import { signOut, useAccount } from "./Auth";
import { Icon, toast } from "./ui";

/** Web build only: who is signed in, sign out, and deleting the account */
export default function AccountSection() {
  const acc = useAccount();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm) return setConfirm(true);
    setBusy(true);
    try {
      await deleteAccount();
      await signOut(true);
    } catch {
      toast(tr("Профилът не беше изтрит. Опитай пак.", "The account wasn't deleted. Try again."));
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <>
      <div className="sec-head"><span className="eyebrow">{tr("Профил", "Account")}</span></div>
      <section className="card">
        <div className="li">
          <Icon name="user" size={18} />
          <span className="grow small" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{acc?.email}</span>
        </div>
        <button className="li" onClick={() => signOut()}>
          <Icon name="left" size={18} />
          <span className="grow">{tr("Изход", "Sign out")}</span>
        </button>
        <button className="li" style={{ color: "var(--warn)" }} onClick={remove} disabled={busy}>
          {busy ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <Icon name="trash" size={18} />}
          <span className="grow">
            {confirm ? tr("Натисни пак: профилът и всички данни се изтриват завинаги", "Tap again: your account and all its data are deleted for good") : tr("Изтрий профила", "Delete account")}
          </span>
        </button>
      </section>
    </>
  );
}
