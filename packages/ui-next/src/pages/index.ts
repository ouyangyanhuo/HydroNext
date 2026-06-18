import { registerPage } from '../registry/page';

// P0 Pages
registerPage('homepage', () => import('./homepage'));
registerPage('problem_main', () => import('./problem_main'));
registerPage('problem_detail', () => import('./problem_detail'));
registerPage('problem_submit', () => import('./problem_submit'));
registerPage('record_main', () => import('./record_main'));
registerPage('record_detail', () => import('./record_detail'));
registerPage('contest_main', () => import('./contest_main'));
registerPage('contest_detail', () => import('./contest_detail'));
registerPage('contest_scoreboard', () => import('./contest_scoreboard'));
registerPage('user_detail', () => import('./user_detail'));
registerPage('user_login', () => import('./user_login'));
registerPage('user_register', () => import('./user_register'));

// Error pages
registerPage('error', () => import('./error'));
registerPage('bsod', () => import('./error'));
