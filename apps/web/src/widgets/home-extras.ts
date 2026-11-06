// Everything below the main clock, loaded once the clock has painted so first paint stays light.
import './clock-stage';
import './overlap-strip';
import './sun-arc';
import './epoch-card';
import './mini-stopwatch';
import { initWorldCards } from './world-cards';

initWorldCards();
