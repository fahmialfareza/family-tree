"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, CircleMinus, Loader2, RefreshCw } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Section } from "@/components/common/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/api/client";
import type { AdminOverview as Overview } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { ColumnChart } from "./column-chart";

function StatTile({ label, value, hint, className }: { label: string; value: string; hint?: string; className?: string }) {
  return (
    <div className={cn("rounded-2xl border bg-card p-4 shadow-[var(--shadow-soft)] sm:p-5", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

type Status = "ok" | "warn" | "off";
const STATUS_ICON = { ok: CircleCheck, warn: CircleAlert, off: CircleMinus } as const;
const STATUS_CLASS = { ok: "text-success", warn: "text-warning", off: "text-muted-foreground" } as const;

function StatusRow({ label, status, text }: { label: string; status: Status; text: string }) {
  const Icon = STATUS_ICON[status];
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <Icon className={cn("size-4", STATUS_CLASS[status])} aria-hidden /> {text}
      </span>
    </li>
  );
}

function KeyValues({ rows }: { rows: [string, number][] }) {
  const format = useFormatter();
  return (
    <dl className="divide-y">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between py-2 text-sm">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="font-medium tabular-nums">{format.number(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Platform overview for admins (GET /api/admin/overview). Refreshes every minute; old numbers stay while reloading. */
export function AdminOverview() {
  const t = useTranslations("admin");
  const format = useFormatter();
  const { data, error, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => api.get<Overview>("/api/admin/overview"),
    refetchInterval: 60_000,
  });
  const n = (v: number) => format.number(v);
  // Relative to when the server built the snapshot, so "3 days ago" matches the numbers.
  const when = (iso?: string) => (iso && data ? format.relativeTime(new Date(iso), new Date(data.generatedAt)) : t("never"));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex items-center gap-3">
          {dataUpdatedAt ? (
            <span className="text-xs text-muted-foreground">{t("updated", { time: format.dateTime(new Date(dataUpdatedAt), { timeStyle: "short" }) })}</span>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} {t("refresh")}
          </Button>
        </div>
      </div>

      {error && !data ? <p className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">{errorMessage(error, t("loadFailed"))}</p> : null}

      {!data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" role="status" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className={cn("space-y-6 transition-opacity", isFetching && "opacity-70")}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile label={t("users")} value={n(data.users.total)} hint={t("usersHint", { new: n(data.users.new30d) })} />
            <StatTile label={t("activeUsers")} value={n(data.users.active7d)} hint={t("activeHint", { day: n(data.users.active1d), month: n(data.users.active30d) })} />
            <StatTile label={t("trees")} value={n(data.trees.total)} hint={t("treesHint", { new: n(data.trees.new30d) })} />
            <StatTile label={t("people")} value={n(data.content.people)} hint={t("peopleHint", { new: n(data.content.peopleNew30d) })} />
            <StatTile className="col-span-2 lg:col-span-1" label={t("assistantTrees")} value={n(data.trees.assistantEnabled)} hint={t("assistantHint", { total: n(data.trees.total) })} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="min-w-0 rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
              <ColumnChart title={t("signupsTitle")} data={data.signups} />
            </section>
            <section className="min-w-0 rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
              <ColumnChart title={t("peopleTitle")} data={data.peopleAdded} />
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Section title={t("accounts")}>
              <KeyValues
                rows={[
                  [t("verifiedEmails"), data.users.verified],
                  [t("unverified"), data.users.pending],
                  [t("googleLinked"), data.users.google],
                  [t("appleLinked"), data.users.apple],
                ]}
              />
            </Section>
            <Section title={t("contentTitle")}>
              <KeyValues
                rows={[
                  [t("families"), data.content.families],
                  [t("relationships"), data.content.relationships],
                  [t("photos"), data.content.photos],
                  [t("branchScoped"), data.trees.branchScoped],
                ]}
              />
            </Section>
            <Section title={t("system")}>
              <ul className="divide-y">
                <StatusRow label={t("database")} status={data.system.database === "ok" ? "ok" : "warn"} text={data.system.database === "ok" ? t("statusOk") : t("statusError")} />
                <StatusRow
                  label={t("redis")}
                  status={data.system.redis === "ok" ? "ok" : data.system.redis === "off" ? "off" : "warn"}
                  text={data.system.redis === "ok" ? t("statusOk") : data.system.redis === "off" ? t("statusOff") : t("statusError")}
                />
                <StatusRow label={t("email")} status={data.system.email ? "ok" : "warn"} text={data.system.email ? t("configured") : t("notConfigured")} />
                <StatusRow label={t("google")} status={data.system.google ? "ok" : "off"} text={data.system.google ? t("configured") : t("notConfigured")} />
                <StatusRow label={t("apple")} status={data.system.apple ? "ok" : "off"} text={data.system.apple ? t("configured") : t("notConfigured")} />
                <StatusRow
                  label={t("ai")}
                  status={data.system.aiProviders.length ? "ok" : "off"}
                  text={data.system.aiProviders.length ? data.system.aiProviders.map((p) => (p === "gemini" ? "Gemini" : p === "groq" ? "Groq" : p)).join(", ") : t("none")}
                />
                {data.system.version ? <StatusRow label={t("version")} status="ok" text={data.system.version} /> : null}
              </ul>
            </Section>
          </div>

          <Section title={t("recentUsers")}>
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="px-1 py-2 font-medium">{t("name")}</th>
                    <th className="px-1 py-2 font-medium">{t("account")}</th>
                    <th className="px-1 py-2 font-medium">{t("signIn")}</th>
                    <th className="px-1 py-2 text-right font-medium">{t("treesCol")}</th>
                    <th className="px-1 py-2 font-medium">{t("joined")}</th>
                    <th className="px-1 py-2 font-medium">{t("lastActive")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentUsers.map((u) => (
                    <tr key={u.id} className="border-t">
                      <td className="px-1 py-2 font-medium">{u.name}</td>
                      <td className="max-w-[16rem] truncate px-1 py-2">
                        {u.email || u.username || t("never")}{" "}
                        {u.email ? <Badge variant={u.emailVerified ? "secondary" : "outline"}>{u.emailVerified ? t("verified") : t("pending")}</Badge> : null}
                      </td>
                      <td className="px-1 py-2">{t(`signInMethod.${u.signIn}`)}</td>
                      <td className="px-1 py-2 text-right tabular-nums">{u.trees}</td>
                      <td className="px-1 py-2 text-muted-foreground">{when(u.createdAt)}</td>
                      <td className="px-1 py-2 text-muted-foreground">{when(u.lastActiveAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={t("largestTrees")}>
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="px-1 py-2 font-medium">{t("tree")}</th>
                    <th className="px-1 py-2 text-right font-medium">{t("peopleCol")}</th>
                    <th className="px-1 py-2 text-right font-medium">{t("membersCol")}</th>
                    <th className="px-1 py-2 font-medium">{t("assistantCol")}</th>
                    <th className="px-1 py-2 font-medium">{t("created")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.largestTrees.map((tr) => (
                    <tr key={tr.id} className="border-t">
                      <td className="px-1 py-2 font-medium">{tr.name}</td>
                      <td className="px-1 py-2 text-right tabular-nums">{n(tr.people)}</td>
                      <td className="px-1 py-2 text-right tabular-nums">{n(tr.members)}</td>
                      <td className="px-1 py-2">{tr.assistant ? t("on") : t("off")}</td>
                      <td className="px-1 py-2 text-muted-foreground">{when(tr.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
