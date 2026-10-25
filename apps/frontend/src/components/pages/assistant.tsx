"use client";

import { ArrowUp, Loader2, RotateCcw, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api/client";
import { useAskAssistant, useInvalidateTree, useTree } from "@/lib/api/hooks";
import type { AssistantAnswer, AssistantTurn } from "@/lib/api/types";
import { applyAssistantAction } from "@/lib/assistant-actions";
import { cn } from "@/lib/utils";
import { ActionCards, type ActionState, useActionTitle } from "@/components/assistant/action-cards";

type Message = AssistantTurn & Partial<Pick<AssistantAnswer, "people" | "model">> & { error?: boolean; actions?: ActionState[] };

// Only the last few turns go to the server; enough for follow-ups like "dan ibunya?".
const HISTORY_TURNS = 10;
const storageKey = (treeId: string) => `ft-assistant:${treeId}`;

function loadConversation(treeId: string): Message[] {
  try {
    const raw = sessionStorage.getItem(storageKey(treeId));
    const saved = raw ? (JSON.parse(raw) as Message[]) : [];
    // A reload in the middle of applying leaves no request running: offer the button again.
    return saved.map((m) => ({ ...m, actions: m.actions?.map((x) => (x.state === "applying" ? { ...x, state: "pending" as const } : x)) }));
  } catch {
    return [];
  }
}

/** Chat about the tree. The conversation stays in this browser tab (sessionStorage); the server keeps nothing. */
export function Assistant({ treeId }: { treeId: string }) {
  const t = useTranslations("assistant");
  const { data: tree } = useTree(treeId);

  if (!tree) {
    return (
      <div className="flex flex-1 items-center justify-center" role="status">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }
  if (!tree.assistantAvailable || !tree.assistantEnabled) {
    const owner = tree.role === "owner";
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <EmptyState
          icon={Sparkles}
          title={tree.assistantAvailable ? t("offTitle") : t("unavailable")}
          description={tree.assistantAvailable ? (owner ? t("offOwner") : t("offMember")) : undefined}
          action={
            owner && tree.assistantAvailable ? (
              <Button asChild>
                <Link href={`/app/t/${treeId}/settings`}>{t("openSettings")}</Link>
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }
  // Mounted only on the client (the tree query has no server data), so it can read sessionStorage right away.
  return <Conversation key={treeId} treeId={treeId} />;
}

function Conversation({ treeId }: { treeId: string }) {
  const t = useTranslations("assistant");
  const locale = useLocale();
  const ask = useAskAssistant(treeId);
  const invalidate = useInvalidateTree(treeId);
  const actionTitle = useActionTitle();
  const ta = useTranslations("assistant.actions");
  const [messages, setMessages] = useState<Message[]>(() => loadConversation(treeId));
  const [applying, setApplying] = useState(false);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey(treeId), JSON.stringify(messages.slice(-40)));
    } catch {
      // storage full or disabled: the conversation just won't survive a reload
    }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, treeId]);

  async function send(question: string, base: Message[] = messages) {
    const q = question.trim();
    if (!q || ask.isPending) return;
    const next: Message[] = [...base.filter((m) => !m.error), { role: "user", content: q }];
    setMessages(next);
    setDraft("");
    try {
      // The model only sees text, so tell it which proposed changes the user applied.
      const history = next.slice(-HISTORY_TURNS).map(({ role, content, actions }) => {
        const applied = (actions ?? []).filter((a) => a.state === "done").map(actionTitle);
        const text = applied.length ? `${content}\n\n[${ta("appliedNote", { items: applied.join("; ") })}]` : content;
        return { role, content: text.slice(0, 2000) };
      });
      const res = await ask.mutateAsync({ messages: history, locale });
      const actions: ActionState[] = (res.actions ?? []).map((a) => ({ ...a, state: "pending" }));
      setMessages([...next, { role: "assistant", content: res.answer, people: res.people, model: res.model, actions }]);
    } catch (err) {
      setMessages([...next, { role: "assistant", content: errorMessage(err, t("failed")), error: true }]);
    }
  }

  const patchAction = (msgIndex: number, id: string, patch: Partial<ActionState>) =>
    setMessages((prev) =>
      prev.map((m, i) => (i === msgIndex ? { ...m, actions: m.actions?.map((a) => (a.id === id ? { ...a, ...patch } : a)) } : m)),
    );

  async function applyActions(msgIndex: number, ids: string[]) {
    const msg = messages[msgIndex];
    setApplying(true);
    try {
      for (const id of ids) {
        const action = msg.actions?.find((a) => a.id === id);
        if (!action) continue;
        patchAction(msgIndex, id, { state: "applying", error: undefined });
        try {
          const { personId } = await applyAssistantAction(treeId, action);
          patchAction(msgIndex, id, { state: "done", resultPersonId: personId });
        } catch (err) {
          patchAction(msgIndex, id, { state: "failed", error: errorMessage(err) });
        }
      }
    } finally {
      await invalidate();
      setApplying(false);
    }
  }

  function retry() {
    const lastQuestion = [...messages].reverse().find((m) => m.role === "user");
    if (!lastQuestion) return;
    const idx = messages.lastIndexOf(lastQuestion);
    void send(lastQuestion.content, messages.slice(0, idx));
  }

  const suggestions = t.raw("suggestions") as string[];
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-6 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-xl font-semibold sm:text-3xl">{t("title")}</h1>
          {/* On phones the empty state explains it; once chatting, the room goes to the conversation. */}
          <p className={cn("text-sm text-muted-foreground", messages.length && "hidden sm:block")}>{t("description")}</p>
        </div>
        {messages.length ? (
          <Button variant="ghost" size="sm" onClick={() => setMessages([])} disabled={ask.isPending}>
            <RotateCcw className="size-4" aria-hidden /> {t("newChat")}
          </Button>
        ) : null}
      </div>

      <div className="flex-1 space-y-4 py-5 sm:py-6" aria-live="polite">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">{t("tryAsking")}</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-full border bg-card px-3.5 py-2 text-left text-sm shadow-[var(--shadow-soft)] transition-colors hover:bg-accent"
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="pt-2 text-xs leading-relaxed text-muted-foreground">{t("disclaimer")}</p>
          </div>
        ) : null}

        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] space-y-2 rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed",
                m.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border bg-card shadow-[var(--shadow-soft)]",
                m.error && "border-destructive/40 text-destructive",
              )}
            >
              <p className="whitespace-pre-wrap break-words">{m.content}</p>
              {m.people?.length ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {m.people.map((p) => (
                    <Link
                      key={p.id}
                      href={`/app/t/${treeId}?focus=${p.id}&person=${p.id}`}
                      aria-label={t("openPerson", { name: p.name })}
                      className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground hover:bg-accent"
                    >
                      <UserRound className="size-3" aria-hidden /> {p.name}
                    </Link>
                  ))}
                </div>
              ) : null}
              {m.actions?.length ? (
                <ActionCards
                  treeId={treeId}
                  actions={m.actions}
                  busy={applying || ask.isPending}
                  onApply={(id) => void applyActions(i, [id])}
                  onApplyAll={() => void applyActions(i, m.actions!.filter((a) => a.state === "pending" || a.state === "failed").map((a) => a.id))}
                  onDismiss={(id) => patchAction(i, id, { state: "dismissed" })}
                />
              ) : null}
              {m.error ? (
                <Button variant="outline" size="sm" onClick={retry} disabled={ask.isPending}>
                  <RotateCcw className="size-4" aria-hidden /> {t("retry")}
                </Button>
              ) : null}
              {m.model ? <p className="text-[11px] text-muted-foreground">{t("answeredBy", { model: m.model })}</p> : null}
            </div>
          </div>
        ))}

        {ask.isPending ? (
          <div className="flex justify-start" role="status">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border bg-card px-4 py-2.5 text-sm text-muted-foreground shadow-[var(--shadow-soft)]">
              <Loader2 className="size-4 animate-spin" aria-hidden /> {t("thinking")}
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      {/* Sticks above the phone tab bar; flush with the bottom on larger screens. */}
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] -mx-4 border-t bg-background/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6 md:bottom-0 md:pb-5">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(draft);
              }
            }}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
            maxLength={2000}
            rows={1}
            className="max-h-40 min-h-11 resize-none rounded-xl bg-card"
          />
          <Button type="submit" size="icon" className="size-11 shrink-0 rounded-xl" disabled={!draft.trim() || ask.isPending} aria-label={t("send")}>
            {ask.isPending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ArrowUp className="size-5" aria-hidden />}
          </Button>
        </form>
      </div>
    </div>
  );
}
