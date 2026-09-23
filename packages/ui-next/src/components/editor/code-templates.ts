const CODE_TEMPLATES = {
  c: `#include <stdio.h>

int main(void) {
    return 0;
}
`,
  cpp: `#include <iostream>

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);

    return 0;
}
`,
  java: `import java.io.BufferedReader;
import java.io.InputStreamReader;

public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
    }
}
`,
  rust: `use std::io::{self, Read};

fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
}
`,
} as const;

type TemplateLanguage = keyof typeof CODE_TEMPLATES;

function resolveTemplateLanguage(language: string): TemplateLanguage | undefined {
  const normalized = language.trim().toLowerCase();
  if (normalized === 'c' || normalized.startsWith('c.')) return 'c';
  if (['cc', 'cpp', 'c++'].includes(normalized) || normalized.startsWith('cc.') || normalized.startsWith('cpp.')) return 'cpp';
  if (normalized === 'java' || normalized.startsWith('java.')) return 'java';
  if (['rs', 'rust'].includes(normalized) || normalized.startsWith('rs.') || normalized.startsWith('rust.')) return 'rust';
  return undefined;
}

export function getCodeTemplate(language: string) {
  const templateLanguage = resolveTemplateLanguage(language);
  return templateLanguage ? CODE_TEMPLATES[templateLanguage] : undefined;
}
