// Month and year names for the Hebrew, Chinese, Persian and Indian calendars. No date maths:
// the dates come from time-core (`WorldDate`); this file only names them.
import type { WorldCalendar, WorldDate } from '../engine/types';

const HEBREW = ['Tishrei', 'Cheshvan', 'Kislev', 'Tevet', 'Shevat', 'Adar', 'Nisan', 'Iyar', 'Sivan', 'Tammuz', 'Av', 'Elul'];
const PERSIAN = ['Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar', 'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand'];
const INDIAN = ['Chaitra', 'Vaishakha', 'Jyeshtha', 'Ashadha', 'Shravana', 'Bhadra', 'Ashwin', 'Kartika', 'Agrahayana', 'Pausha', 'Magha', 'Phalguna'];
const CN_MONTH = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const STEMS_LATIN = ['jia', 'yi', 'bing', 'ding', 'wu', 'ji', 'geng', 'xin', 'ren', 'gui'];
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const BRANCHES_LATIN = ['zi', 'chou', 'yin', 'mao', 'chen', 'si', 'wu', 'wei', 'shen', 'you', 'xu', 'hai'];
const ANIMALS = ['Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'];
const ELEMENTS = ['Wood', 'Fire', 'Earth', 'Metal', 'Water'];

export const WORLD_CALENDARS: ReadonlyArray<{ id: WorldCalendar; name: string; era: string }> = [
  { id: 'hebrew', name: 'Hebrew', era: 'AM' },
  { id: 'chinese', name: 'Chinese', era: '' },
  { id: 'persian', name: 'Persian (Solar Hijri)', era: 'SH' },
  { id: 'indian', name: 'Indian national (Saka)', era: 'Saka' },
];

/** Name of month `number` (with its leap flag) in a year with `monthsInYear` months. */
export function monthName(cal: WorldCalendar, number: number, leap: boolean, monthsInYear: number): string {
  switch (cal) {
    case 'hebrew':
      if (leap && number === 5) return 'Adar I';
      if (number === 6 && monthsInYear === 13) return 'Adar II';
      return HEBREW[number - 1] ?? '';
    case 'persian':
      return PERSIAN[number - 1] ?? '';
    case 'indian':
      return INDIAN[number - 1] ?? '';
    case 'chinese':
      return `${leap ? 'Leap month' : 'Month'} ${number} (${leap ? '闰' : ''}${CN_MONTH[number - 1] ?? ''}月)`;
  }
}

/** Stem-branch name of a Chinese cycle year (1 = jia-zi). */
export function cycleName(cycle: number): { hanzi: string; latin: string; animal: string; element: string } {
  const s = (cycle - 1) % 10;
  const b = (cycle - 1) % 12;
  return {
    hanzi: `${STEMS[s] ?? ''}${BRANCHES[b] ?? ''}`,
    latin: `${STEMS_LATIN[s] ?? ''}-${BRANCHES_LATIN[b] ?? ''}`,
    animal: ANIMALS[b] ?? '',
    element: ELEMENTS[Math.floor(s / 2)] ?? '',
  };
}

/** "1 Kislev 5787 AM", "Month 9 (九月), day 21 · Year of the Fire Horse (丙午)". */
export function formatWorld(cal: WorldCalendar, d: WorldDate): string {
  const month = monthName(cal, d.number, d.leap, d.months_in_year);
  if (cal === 'chinese') {
    const c = d.cycle ? cycleName(d.cycle) : null;
    return `${month}, day ${d.day}${c ? ` · Year of the ${c.element} ${c.animal} (${c.hanzi}, ${c.latin})` : ''}`;
  }
  const era = WORLD_CALENDARS.find((w) => w.id === cal)?.era ?? '';
  return `${d.day} ${month} ${d.year}${era ? ` ${era}` : ''}`;
}
