import { createTheme, type MantineColorsTuple } from '@mantine/core';

const hydroBlue: MantineColorsTuple = [
    '#e7f5ff',
    '#d0ebff',
    '#a5d8ff',
    '#74c0fc',
    '#4dabf7',
    '#339af0',
    '#228be6',
    '#1c7ed6',
    '#1971c2',
    '#1864ab',
];

export const theme = createTheme({
    primaryColor: 'hydroBlue',
    colors: { hydroBlue },
    fontFamily: 'var(--hydro-font-family)',
    radius: { sm: '4px', md: '6px', lg: '8px' },
    components: {
        Button: { defaultProps: { size: 'sm' } },
        TextInput: { defaultProps: { size: 'sm' } },
        Select: { defaultProps: { size: 'sm' } },
        Textarea: { defaultProps: { size: 'sm' } },
    },
});
