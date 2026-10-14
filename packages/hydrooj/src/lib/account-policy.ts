type SettingReader = (key: string) => unknown;

export function isRegistrationEnabled(get: SettingReader) {
    return get('server.allowRegister') !== false;
}

export function isPasswordResetEnabled(get: SettingReader) {
    return get('server.login') !== false
        && ['smtp.host', 'smtp.user', 'smtp.pass', 'smtp.from'].every((key) => {
            const value = get(key);
            return typeof value === 'string' && value.trim().length > 0;
        });
}

export function getAccountCapabilities(get: SettingReader) {
    return {
        registrationEnabled: isRegistrationEnabled(get),
        passwordResetEnabled: isPasswordResetEnabled(get),
    };
}
