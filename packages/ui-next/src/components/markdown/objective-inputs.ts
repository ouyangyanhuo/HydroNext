import type { ObjectiveAnswers } from '../../utils/objective-answers';

export interface ObjectiveQuestion { id: string, anchor: string }
type AnswerControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

interface ObjectiveInputOptions {
  prefix: string;
  onChange: (id: string, value: string | string[]) => void;
}

/** Enhance sanitized statement DOM, keeping option Markdown (including math and images) intact. */
export function attachObjectiveInputs(root: HTMLElement, { prefix, onChange }: ObjectiveInputOptions) {
  const doc = root.ownerDocument;
  const questions: ObjectiveQuestion[] = [];
  const controls = new Map<AnswerControl, string>();
  const undo: (() => void)[] = [];
  const markers = /\{\{\s+(input|textarea|select|multiselect|dropdown)\((\d+(?:-\d+)?)\)(?:\[([^\]]*)\])?\s+\}\}/g;
  const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */);
  const textNodes: Text[] = [];
  const inputBlocks = new Set<Element>();
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const parent = node.parentElement;
    if (!parent || parent.closest('a, .hydro-math, script, style, textarea, input, select')) continue;
    const code = parent.closest('pre, code');
    if (code) {
      const block = parent.closest('code');
      if (block?.className.includes('#input')) inputBlocks.add(block);
      continue;
    }
    if (node.data.includes('{{')) textNodes.push(node);
  }
  // Explicit #input fences may have syntax highlighting that splits a marker across spans.
  for (const block of inputBlocks) {
    const children = [...block.childNodes];
    const text = doc.createTextNode(block.textContent || '');
    block.replaceChildren(text);
    undo.push(() => block.replaceChildren(...children));
    textNodes.push(text);
  }
  textNodes.sort((a, b) => (a.compareDocumentPosition(b) & 4 /* DOCUMENT_POSITION_FOLLOWING */ ? -1 : 1));

  const register = (control: AnswerControl, id: string) => {
    controls.set(control, id);
    control.classList.add('hydro-objective-input');
    control.setAttribute('aria-label', `#${id}`);
    // Prefix radio names so separate statements cannot uncheck one another silently.
    control.name = `${prefix}-${id}`;
  };

  for (const node of textNodes) {
    const text = node.data;
    const wrapper = doc.createElement('span');
    let end = 0;
    for (const match of text.matchAll(markers)) {
      const [marker, type, id, choices] = match;
      const paragraph = node.parentElement?.closest('p');
      const list = paragraph?.nextElementSibling;
      if ((type === 'select' || type === 'multiselect') && (list?.tagName !== 'UL' || list.hasAttribute('data-objective-options'))) continue;
      wrapper.append(doc.createTextNode(text.slice(end, match.index)));
      const slot = doc.createElement('span');
      slot.className = 'hydro-objective-slot';
      slot.id = `${prefix}-${id}-${questions.length}`;
      slot.tabIndex = -1;
      slot.dataset.questionId = id;
      questions.push({ id, anchor: slot.id });

      if (type === 'input' || type === 'textarea') {
        const control = doc.createElement(type === 'input' ? 'input' : 'textarea');
        if (control.tagName === 'INPUT') (control as HTMLInputElement).type = 'text';
        else (control as HTMLTextAreaElement).rows = 4;
        register(control, id);
        slot.append(control);
      } else if (type === 'dropdown') {
        const select = doc.createElement('select');
        select.append(doc.createElement('option'));
        for (const choice of (choices || '').split(',').map((value) => value.trim()).filter(Boolean)) {
          const option = doc.createElement('option');
          option.value = choice;
          option.textContent = choice;
          select.append(option);
        }
        register(select, id);
        slot.append(select);
      } else if (list) {
        const originalClass = list.getAttribute('class');
        list.setAttribute('data-objective-options', id);
        list.classList.add('hydro-objective-options');
        undo.push(() => {
          list.removeAttribute('data-objective-options');
          if (originalClass === null) list.removeAttribute('class');
          else list.setAttribute('class', originalClass);
        });
        for (const [index, item] of [...list.children].entries()) {
          const children = [...item.childNodes];
          const label = doc.createElement('label');
          const control = doc.createElement('input');
          control.type = type === 'select' ? 'radio' : 'checkbox';
          control.value = String.fromCharCode(65 + index);
          register(control, id);
          control.setAttribute('aria-label', `#${id} ${control.value}`);
          const body = doc.createElement('span');
          body.append(`${control.value}. `, ...children);
          label.append(control, body);
          item.replaceChildren(label);
          undo.push(() => item.replaceChildren(...children));
        }
      }
      wrapper.append(slot);
      end = match.index + marker.length;
    }
    if (!end) continue;
    wrapper.append(doc.createTextNode(text.slice(end)));
    node.replaceWith(wrapper);
    undo.push(() => wrapper.replaceWith(node));
  }

  const onInput = (event: Event) => {
    const control = event.target as AnswerControl;
    const id = controls.get(control);
    if (id === undefined || control.disabled) return;
    const type = (control as HTMLInputElement).type;
    const isChoice = type === 'checkbox' || type === 'radio' || control.tagName === 'SELECT';
    if ((event.type === 'change') !== isChoice) return;
    if (type === 'checkbox') {
      const checked = [...controls].filter(([input, key]) => key === id && (input as HTMLInputElement).checked);
      onChange(id, [...new Set(checked.map(([input]) => input.value))].sort());
    } else onChange(id, control.value);
  };
  root.addEventListener('input', onInput);
  root.addEventListener('change', onInput);

  return {
    questions,
    update(answers: ObjectiveAnswers, disabled: boolean) {
      for (const [control, id] of controls) {
        const value = answers[id];
        control.disabled = disabled;
        if (['radio', 'checkbox'].includes((control as HTMLInputElement).type)) {
          const checked = Array.isArray(value) ? value.includes(control.value) : value === control.value;
          // Browser form restoration/reset must use the saved draft as its default, too.
          (control as HTMLInputElement).defaultChecked = checked;
          (control as HTMLInputElement).checked = checked;
        } else {
          const next = typeof value === 'string' ? value : '';
          if (control.tagName === 'SELECT') {
            for (const option of (control as HTMLSelectElement).options) option.defaultSelected = option.value === next;
          } else (control as HTMLInputElement | HTMLTextAreaElement).defaultValue = next;
          if (control.value !== next) control.value = next;
        }
      }
    },
    destroy() {
      root.removeEventListener('input', onInput);
      root.removeEventListener('change', onInput);
      for (const restore of undo.reverse()) restore();
    },
  };
}
