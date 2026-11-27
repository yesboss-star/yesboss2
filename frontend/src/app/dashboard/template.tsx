// A template is rebuilt on every page change (the layout around it is not), so the new page fades in softly.
// Only opacity is animated, never position, so nothing that is fixed to the screen (the bottom bar, chat box, pop-ups)
// can jump while it plays.
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-fade-in">{children}</div>;
}
