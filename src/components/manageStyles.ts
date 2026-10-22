/**
 * Shared Tailwind class strings for the /manage staff console so every panel,
 * form and button looks the same.
 */

export const ui = {
  card: "bg-white border border-slate-200 rounded-lg",
  cardBody: "p-4 sm:p-5",
  sectionTitle: "text-base font-semibold text-slate-900",
  sectionHint: "text-sm text-slate-500",
  label: "block text-sm font-medium text-slate-700 mb-1",
  hint: "text-xs text-slate-500",
  input:
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-[#02275A] focus:outline-none focus:ring-2 focus:ring-[#02275A]/15 disabled:bg-slate-50",
  select:
    "rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-[#02275A] focus:outline-none focus:ring-2 focus:ring-[#02275A]/15 cursor-pointer",
  btnPrimary:
    "inline-flex items-center justify-center gap-1.5 rounded-md bg-[#02275A] px-3.5 py-2 text-sm font-medium text-white hover:bg-[#0a3a7a] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
  btnSecondary:
    "inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
  btnDanger:
    "inline-flex items-center justify-center gap-1.5 rounded-md border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-700 hover:bg-red-50 cursor-pointer",
  iconBtn:
    "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer",
  iconBtnDanger:
    "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600 cursor-pointer",
  badge: "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium",
  empty:
    "rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500",
  noticeOk:
    "flex items-start justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800",
  noticeError:
    "flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800",
  noticeWarn:
    "flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900",
}

/** Segmented control button (e.g. Open / Closed / Reserved). */
export function segment(active: boolean): string {
  return `px-3 py-1.5 text-sm font-medium first:rounded-l-md last:rounded-r-md border -ml-px first:ml-0 cursor-pointer ${
    active
      ? "relative z-10 border-[#02275A] bg-[#02275A] text-white"
      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
  }`
}
