/**
 * Smoke test for the Client half without a browser or React.
 *
 * `client.js` is loaded the way the page loads it (`window.__ModuleLoader__`),
 * with a tiny React stand-in that can re-render the registered control so the
 * manual focus toggle, the icon-only markup and the generated focus stylesheet
 * are exercised.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

/* ---------- the smallest React that can render this control ---------- */

const Fragment = Symbol('Fragment');
let hookState = { values: [], cursor: 0 };

/** Begin a new mounted instance: hooks start from their initial values. */
function resetHooks() {
  hookState = { values: [], cursor: 0 };
}

/** Begin a render pass of the current instance: hook order restarts, values persist. */
function beginRender() {
  hookState.cursor = 0;
}

const react = {
  Fragment,
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children: children.flat(Infinity) };
  },
  useState(initial) {
    const index = hookState.cursor;
    hookState.cursor += 1;
    if (index >= hookState.values.length) hookState.values[index] = initial;
    return [
      hookState.values[index],
      (next) => {
        hookState.values[index] = typeof next === 'function' ? next(hookState.values[index]) : next;
      },
    ];
  },
  useRef(initial) {
    const index = hookState.cursor;
    hookState.cursor += 1;
    if (index >= hookState.values.length) hookState.values[index] = { current: initial };
    return hookState.values[index];
  },
  useMemo(run) {
    hookState.cursor += 1;
    return run();
  },
  useEffect() {
    hookState.cursor += 1;
  },
  useSyncExternalStore(_subscribe, getSnapshot) {
    hookState.cursor += 1;
    return getSnapshot();
  },
};

/* ---------- fake DOM ---------- */

let declaration;
const documentListeners = new Map();

globalThis.window = {
  __ModuleLoader__: {
    load(loaded) {
      declaration = loaded;
    },
  },
};

globalThis.document = {
  createElement(tag) {
    return { tag, dataset: {}, textContent: '', remove() {} };
  },
  head: {
    appended: [],
    append(node) {
      this.appended.push(node);
    },
  },
  addEventListener(type, listener) {
    documentListeners.set(type, listener);
  },
  removeEventListener(type) {
    documentListeners.delete(type);
  },
};

globalThis.Element = class Element {};

/* ---------- module load ---------- */

await import(new URL('../client.js', import.meta.url).href);

function loadModule() {
  assert.equal(declaration.id, 'dsh-workspace-focus');
  return declaration.factory((id) => {
    assert.equal(id, 'react');
    return react;
  });
}

/* ---------- apply ---------- */

let applied;

function applyOnce() {
  if (applied !== undefined) return applied;
  const plugin = loadModule();
  assert.deepEqual(plugin.inject, ['slots', 'locale']);

  const registrations = new Map();
  const locales = [];

  plugin.apply({
    effect(run) {
      return run();
    },
    locale: {
      register(namespace, dictionaries) {
        locales.push({ namespace, dictionaries });
        return () => {};
      },
    },
    slots: {
      inject(_key, install) {
        install();
        return () => {};
      },
      register(options, component) {
        registrations.set(options.name, { options, component });
        return () => {};
      },
    },
  });

  applied = { registrations, locales };
  return applied;
}

test('apply registers one header control, its dictionaries and its styles', () => {
  const { registrations, locales } = applyOnce();

  assert.deepEqual([...registrations.keys()], ['conversation.header.leading']);
  assert.equal(registrations.get('conversation.header.leading').options.locale, 'dshWorkspaceFocus');

  assert.equal(locales.length, 1);
  assert.equal(locales[0].namespace, 'dshWorkspaceFocus');
  assert.equal(locales[0].dictionaries.zh.focusHint, '仅显示当前工作区的对话');
  assert.equal(locales[0].dictionaries.zh.showAllHint, '返回全部工作区');
  assert.equal(locales[0].dictionaries.en.focusHint, 'Show only the current workspace conversations');

  assert.equal(document.head.appended.length, 1);
  assert.match(document.head.appended[0].textContent, /\.dsh-workspace-focus \{/);
  assert.match(document.head.appended[0].textContent, /width: 28px/);
  assert.equal(document.head.appended[0].dataset.dshWorkspaceFocus, 'control');

  /* The old row-click navigation is gone. */
  assert.equal(documentListeners.has('click'), false);
});

/* ---------- rendering ---------- */

const workspaceA = 'a4f9c1e2-0000-4000-8000-000000000001';
const workspaceB = 'b4f9c1e2-0000-4000-8000-000000000002';

function props({ session, workspaces }) {
  return {
    t: (key) => 'tr:' + key,
    useSessions: (select) => select({ byId: session }),
    useWorkspaces: (select) => select({ items: workspaces }),
  };
}

const sessionsInA = {
  s1: { id: 's1', retainedBy: { mainView: 1 } },
  s2: { id: 's2', retainedBy: {} },
};
const sessionsInB = {
  s1: { id: 's1', retainedBy: {} },
  s2: { id: 's2', retainedBy: { mainView: 1 } },
};
const workspaces = [
  { workspaceId: workspaceA, sessionIds: ['s1'] },
  { workspaceId: workspaceB, sessionIds: ['s2'] },
];

function buttonOf(tree) {
  return tree.children.flat(Infinity).find((child) => child?.type === 'button');
}

function styleOf(tree) {
  return tree.children.flat(Infinity).find((child) => child?.type === 'style');
}

function textOf(node) {
  return node.children
    .flat(Infinity)
    .filter((child) => child !== null && child !== undefined)
    .map((child) => (typeof child === 'string' ? child : textOf(child)))
    .join('');
}

function render(input) {
  beginRender();
  return applied.registrations.get('conversation.header.leading').component(input);
}

test('the default view is every workspace, and the control renders an icon only', () => {
  resetHooks();
  const tree = render(props({ session: sessionsInA, workspaces }));

  assert.equal(styleOf(tree), undefined, 'no filtering before the user asks for it');
  const button = buttonOf(tree);
  assert.ok(button, 'the control should be rendered');
  assert.equal(button.props['aria-pressed'], false);
  assert.equal(button.props['aria-label'], 'tr:focusAria');
  assert.equal(button.props.title, 'tr:focusHint');
  assert.equal(textOf(button), '', 'no visible text, icon only');
  assert.equal(button.children.filter((child) => child !== null && child !== undefined).length, 1);
});

test('the control focuses the current workspace and shows the way back', () => {
  resetHooks();
  const input = props({ session: sessionsInA, workspaces });

  buttonOf(render(input)).props.onClick();

  const tree = render(input);
  const style = styleOf(tree);
  assert.ok(style, 'focusing renders the filter');
  const key = '[data-row-key="workspace:' + workspaceA + '"]';
  assert.ok(style.children[0].includes('[role="tree"]:has(' + key + ')'), style.children[0]);
  assert.ok(style.children[0].includes('[role="group"] > div:not(:has(' + key + '))'), style.children[0]);

  const button = buttonOf(tree);
  assert.equal(button.props['aria-pressed'], true);
  assert.match(button.props.className, /dsh-workspace-focus-active/);
  assert.equal(button.props['aria-label'], 'tr:showAllAria');
  assert.equal(textOf(button), '');

  button.props.onClick();

  const back = render(input);
  assert.equal(styleOf(back), undefined);
  assert.equal(buttonOf(back).props['aria-pressed'], false);
});

test('focus follows the open conversation while it is on', () => {
  resetHooks();
  const inA = props({ session: sessionsInA, workspaces });

  buttonOf(render(inA)).props.onClick();
  assert.ok(styleOf(render(inA)).children[0].includes('[data-row-key="workspace:' + workspaceA + '"]'));

  const inB = render(props({ session: sessionsInB, workspaces }));
  assert.ok(styleOf(inB).children[0].includes('[data-row-key="workspace:' + workspaceB + '"]'), 'the new workspace is focused');

  const backToAll = render(inA);
  buttonOf(backToAll).props.onClick();
  assert.equal(styleOf(render(inA)), undefined);
});

test('no control without a workspace-backed Session', () => {
  resetHooks();
  const ungrouped = { s9: { id: 's9', retainedBy: { mainView: 1 } } };
  assert.equal(render(props({ session: ungrouped, workspaces })), null);
  assert.equal(render(props({ session: {}, workspaces })), null);
});
