import { registerPage } from '../registry/page';

const HOME = 'homepage';
const PROBLEMS = 'problem_main';
const CONTESTS = 'contest_main';
const TRAINING = 'training_main';
const RECORDS = 'record_main';

// Route metadata is kept beside component registration so titles and primary
// navigation state cannot drift away from the page implementation.

// === P0 Pages ===
registerPage('homepage', () => import('./homepage'), { title: 'Home', nav: HOME });
registerPage('problem_main', () => import('./problem_main'), { title: 'Problems', nav: PROBLEMS });
registerPage('problem_random', () => import('./problem_random'), { title: 'Random Problem', nav: PROBLEMS });
registerPage('problem_detail', () => import('./problem_detail'), { title: 'Problem', nav: PROBLEMS });
registerPage('problem_submit', () => import('./problem_submit'), { title: 'Submit Solution', nav: PROBLEMS });
registerPage('contest_detail_problem', () => import('./problem_detail'), { title: 'Problem', nav: CONTESTS });
registerPage('homework_detail_problem', () => import('./problem_detail'), { title: 'Problem' });
registerPage('record_main', () => import('./record_main'), { title: 'Records', nav: RECORDS });
registerPage('record_detail', () => import('./record_detail'), { title: 'Submission detail', nav: RECORDS });
registerPage('code_replay', () => import('./code_replay'), { title: 'Code Replay', nav: RECORDS });
registerPage('contest_main', () => import('./contest_main'), { title: 'Contests', nav: CONTESTS });
registerPage('contest_detail', () => import('./contest_detail'), { title: 'Contest', nav: CONTESTS });
registerPage('contest_problemlist', () => import('./contest_detail'), { title: 'Problem List', nav: CONTESTS });
registerPage('contest_create', () => import('./contest_edit'), { title: 'Create Contest', nav: CONTESTS });
registerPage('contest_scoreboard', () => import('./contest_scoreboard'), { title: 'Scoreboard', nav: CONTESTS });
registerPage('homework_scoreboard', () => import('./contest_scoreboard'), { title: 'Scoreboard' });
registerPage('user_detail', () => import('./user_detail'), { title: 'User' });
registerPage('user_login', () => import('./user_login'), { title: 'Login' });
registerPage('user_register', () => import('./user_register'), { title: 'Register' });

// === P1 Pages ===
registerPage('problem_edit', () => import('./problem_edit'), { title: 'Edit Problem', nav: PROBLEMS });
registerPage('problem_files', () => import('./problem_files'), { title: 'Files', nav: PROBLEMS });
registerPage('problem_statistics', () => import('./problem_statistics'), { title: 'Statistics', nav: PROBLEMS });
registerPage('problem_solution', () => import('./problem_solution'), { title: 'Solutions', nav: PROBLEMS });
registerPage('problem_solution_detail', () => import('./problem_solution'), { title: 'Solutions', nav: PROBLEMS });
registerPage('problem_config', () => import('./problem_config'), { title: 'Configuration', nav: PROBLEMS });
registerPage('problem_import', () => import('./problem_import'), { title: 'Import Problems', nav: PROBLEMS });
registerPage('problem_import_hydro', () => import('./problem_import_hydro'), { title: 'Import From Hydro', nav: PROBLEMS });
registerPage('problem_create', () => import('./problem_edit'), { title: 'Create Problem', nav: PROBLEMS });
registerPage('problem_hack', () => import('./problem_hack'), { title: 'Hack', nav: PROBLEMS });
registerPage('contest_detail_problem_hack', () => import('./problem_hack'), { title: 'Hack', nav: CONTESTS });
registerPage('home_settings', () => import('./home_settings'), { title: 'Settings' });
registerPage('home_security', () => import('./home_security'), { title: 'Security' });
registerPage('home_messages', () => import('./home_messages'), { title: 'Messages' });
registerPage('home_files', () => import('./home_files'), { title: 'My Files' });
registerPage('home_domain', () => import('./home_domain'), { title: 'My Domains' });
registerPage('contest_edit', () => import('./contest_edit'), { title: 'Edit Contest', nav: CONTESTS });
registerPage('contest_manage', () => import('./contest_manage'), { title: 'Manage Contest', nav: CONTESTS });
registerPage('contest_clarification', () => import('./contest_clarification'), { title: 'Clarifications', nav: CONTESTS });
registerPage('contest_user', () => import('./contest_user'), { title: 'Users', nav: CONTESTS });
registerPage('contest_balloon', () => import('./contest_balloon'), { title: 'Balloons', nav: CONTESTS });
registerPage('contest_print', () => import('./contest_print'), { title: 'Print', nav: CONTESTS });
registerPage('contest_scoreboard_download_html', () => import('./contest_scoreboard_download_html'), { title: 'Scoreboard', nav: CONTESTS });
registerPage('user_sudo', () => import('./user_sudo'), { title: 'Sudo Mode' });

// === P2 Pages ===
registerPage('homework_main', () => import('./homework_main'), { title: 'Homework' });
registerPage('homework_detail', () => import('./homework_detail'), { title: 'Homework' });
registerPage('homework_edit', () => import('./homework_edit'), { title: 'Edit Homework' });
registerPage('training_main', () => import('./training_main'), { title: 'Training', nav: TRAINING });
registerPage('training_detail', () => import('./training_detail'), { title: 'Training', nav: TRAINING });
registerPage('training_create', () => import('./training_edit'), { title: 'Create Training Plan', nav: TRAINING });
registerPage('training_edit', () => import('./training_edit'), { title: 'Edit Training Plan', nav: TRAINING });
registerPage('training_files', () => import('./training_files'), { title: 'Files', nav: TRAINING });
registerPage('domain_dashboard', () => import('./domain_dashboard'), { title: 'Domain Dashboard' });
registerPage('domain_edit', () => import('./domain_edit'), { title: 'Domain Settings' });
registerPage('domain_user', () => import('./domain_user'), { title: 'Domain Users' });
registerPage('domain_role', () => import('./domain_role'), { title: 'Roles' });
registerPage('domain_permission', () => import('./domain_permission'), { title: 'Permissions' });
registerPage('domain_group', () => import('./domain_group'), { title: 'Groups' });
registerPage('domain_create', () => import('./domain_create'), { title: 'Create Domain' });
registerPage('home_domain_create', () => import('./domain_create'), { title: 'Create Domain' });
registerPage('domain_join', () => import('./domain_join'), { title: 'Join Domain' });
registerPage('domain_join_applications', () => import('./domain_join_applications'), { title: 'Join Applications' });
registerPage('manage_dashboard', () => import('./manage_dashboard'), { title: 'Manage' });
registerPage('manage_setting', () => import('./manage_setting'), { title: 'System Settings' });
registerPage('manage_config', () => import('./manage_config'), { title: 'Configuration' });
registerPage('manage_script', () => import('./manage_script'), { title: 'Scripts' });
registerPage('manage_system_data', () => import('./manage_system_data'), { title: 'System Data' });
registerPage('manage_user', () => import('./manage_user'), { title: 'User Management' });
registerPage('manage_user_import', () => import('./manage_user_import'), { title: 'User Import' });
registerPage('manage_user_priv', () => import('./manage_user_priv'), { title: 'User Privileges' });
registerPage('ranking', () => import('./ranking'), { title: 'Ranking' });
registerPage('status', () => import('./status'), { title: 'Status' });
registerPage('about', () => import('./about'), { title: 'About' });
registerPage('wiki_about', () => import('./about'), { title: 'About' });
registerPage('wiki_help', () => import('./wiki_help'), { title: 'Help' });

// === User Flow Pages ===
registerPage('user_lostpass', () => import('./user_lostpass'), { title: 'Forgot Password' });
registerPage('user_lostpass_with_code', () => import('./user_lostpass_with_code'), { title: 'Reset Password' });
registerPage('user_lostpass_mail_sent', () => import('./user_lostpass_mail_sent'), { title: 'Email Sent' });
registerPage('user_register_with_code', () => import('./user_register_with_code'), { title: 'Register' });
registerPage('user_register_mail_sent', () => import('./user_register_mail_sent'), { title: 'Verification Email Sent' });
registerPage('user_logout', () => import('./user_logout'), { title: 'Logout' });
registerPage('user_delete_pending', () => import('./user_delete_pending'), { title: 'Account Deletion Pending' });
registerPage('user_verify', () => import('./user_verify'), { title: 'Verify Email' });
registerPage('user_changemail_with_code', () => import('./user_changemail_with_code'), { title: 'Change Email' });

// === Error Pages ===
registerPage('error', () => import('./error'), { title: 'Error' });
registerPage('bsod', () => import('./error'), { title: 'Error' });
