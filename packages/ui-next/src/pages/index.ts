import { registerPage } from '../registry/page';

// === P0 Pages ===
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

// === P1 Pages ===
registerPage('problem_edit', () => import('./problem_edit'));
registerPage('problem_files', () => import('./problem_files'));
registerPage('problem_statistics', () => import('./problem_statistics'));
registerPage('problem_solution', () => import('./problem_solution'));
registerPage('problem_config', () => import('./problem_config'));
registerPage('home_settings', () => import('./home_settings'));
registerPage('home_security', () => import('./home_security'));
registerPage('home_messages', () => import('./home_messages'));
registerPage('home_files', () => import('./home_files'));
registerPage('home_domain', () => import('./home_domain'));
registerPage('discussion_main', () => import('./discussion_main'));
registerPage('discussion_detail', () => import('./discussion_detail'));
registerPage('discussion_create', () => import('./discussion_create'));
registerPage('discussion_edit', () => import('./discussion_edit'));
registerPage('contest_edit', () => import('./contest_edit'));
registerPage('contest_manage', () => import('./contest_manage'));
registerPage('contest_clarification', () => import('./contest_clarification'));
registerPage('contest_user', () => import('./contest_user'));
registerPage('contest_balloon', () => import('./contest_balloon'));
registerPage('contest_print', () => import('./contest_print'));
registerPage('user_sudo', () => import('./user_sudo'));

// === P2 Pages ===
registerPage('homework_main', () => import('./homework_main'));
registerPage('homework_detail', () => import('./homework_detail'));
registerPage('homework_edit', () => import('./homework_edit'));
registerPage('training_main', () => import('./training_main'));
registerPage('training_detail', () => import('./training_detail'));
registerPage('training_edit', () => import('./training_edit'));
registerPage('domain_dashboard', () => import('./domain_dashboard'));
registerPage('domain_edit', () => import('./domain_edit'));
registerPage('domain_user', () => import('./domain_user'));
registerPage('domain_role', () => import('./domain_role'));
registerPage('domain_permission', () => import('./domain_permission'));
registerPage('domain_group', () => import('./domain_group'));
registerPage('domain_create', () => import('./domain_create'));
registerPage('manage_dashboard', () => import('./manage_dashboard'));
registerPage('manage_setting', () => import('./manage_setting'));
registerPage('manage_config', () => import('./manage_config'));
registerPage('manage_script', () => import('./manage_script'));
registerPage('manage_user_import', () => import('./manage_user_import'));
registerPage('manage_user_priv', () => import('./manage_user_priv'));
registerPage('ranking', () => import('./ranking'));
registerPage('status', () => import('./status'));
registerPage('about', () => import('./about'));

// === Error Pages ===
registerPage('error', () => import('./error'));
registerPage('bsod', () => import('./error'));
