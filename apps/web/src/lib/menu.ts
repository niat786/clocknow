// Site navigation: one list drives the header menus and the footer, so every page is reachable.
export interface MenuItem {
  name: string;
  href: string;
}

export interface MenuGroup {
  name: string;
  items: MenuItem[];
}

export function menu(year: number): MenuGroup[] {
  return [
    {
      name: 'Clocks',
      items: [
        { name: 'Exact time now', href: '/' },
        { name: 'World time', href: '/time' },
        { name: 'Atomic clock', href: '/atomic' },
        { name: 'Time zones', href: '/zones' },
        { name: 'Time differences', href: '/difference' },
        { name: 'Meeting planner', href: '/meeting-planner' },
      ],
    },
    {
      name: 'Timers',
      items: [
        { name: 'Timer', href: '/timer' },
        { name: 'Stopwatch', href: '/stopwatch' },
        { name: 'Countdown', href: '/countdown' },
        { name: 'Pomodoro', href: '/pomodoro' },
        { name: 'Interval timer', href: '/interval-timer' },
      ],
    },
    {
      name: 'Tools',
      items: [
        { name: 'All converters', href: '/convert' },
        { name: 'Time zone converter', href: '/time-zone-converter' },
        { name: 'Unix timestamp', href: '/unix-timestamp' },
        { name: 'Date difference', href: '/date-difference' },
        { name: 'Business days', href: '/business-days' },
        { name: 'Age calculator', href: '/age-calculator' },
        { name: 'Hours calculator', href: '/hours-calculator' },
        { name: 'Cron explainer', href: '/cron' },
      ],
    },
    {
      name: 'Calendars',
      items: [
        { name: `Calendar ${year}`, href: `/calendar/${year}` },
        { name: 'All calendars', href: '/calendar' },
        { name: 'Week numbers', href: '/week' },
        { name: 'Public holidays', href: '/holidays' },
        { name: 'Calendar converter', href: '/calendar-converter' },
        { name: 'Clock changes', href: '/clock-changes' },
        { name: 'Printable calendars', href: '/print' },
      ],
    },
    {
      name: 'Sun & sky',
      items: [
        { name: 'Sunrise and sunset', href: '/sun' },
        { name: 'Prayer times', href: '/prayer' },
        { name: 'Moon phase', href: '/moon' },
        { name: 'Equinoxes and solstices', href: '/seasons' },
      ],
    },
  ];
}

export const ABOUT: MenuItem[] = [
  { name: 'Widgets for your site', href: '/widgets' },
  { name: 'Data sources and accuracy', href: '/about/data' },
  { name: 'Signed time', href: '/about/signed-time' },
  { name: 'Performance', href: '/performance' },
  { name: 'API for developers', href: '/developers' },
];

/** True when `href` is the current page or (for section index pages) one of its children. */
export function isCurrent(href: string, path: string): boolean {
  if (href === '/') return path === '/';
  return path === href;
}
